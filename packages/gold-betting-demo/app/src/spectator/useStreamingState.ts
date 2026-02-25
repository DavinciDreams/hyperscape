import { useEffect, useRef, useState, useCallback } from "react";
import type { StreamingStateUpdate, StreamingPhase } from "./types";
import { UI_SYNC_DELAY_MS, CONFIG } from "../lib/config";

const API_URL = CONFIG.gameApiUrl.replace(/\/$/, "");

const SSE_URL = `${API_URL}/api/streaming/state/events`;
const POLL_URL = `${API_URL}/api/streaming/state`;
const FALLBACK_POLL_INTERVAL_MS = 5000;

/** Known valid phases — anything else is treated as a data quality issue. */
const VALID_PHASES = new Set<StreamingPhase>([
  "IDLE",
  "ANNOUNCEMENT",
  "COUNTDOWN",
  "FIGHTING",
  "RESOLUTION",
]);

type SseSource = {
  onopen: (() => void) | null;
  onerror: (() => void) | null;
  close: () => void;
  addEventListener: (
    type: string,
    listener: (event: MessageEvent<string>) => void,
  ) => void;
};

function normalizeState(payload: unknown): StreamingStateUpdate | null {
  if (!payload || typeof payload !== "object") return null;
  const candidate = payload as Partial<StreamingStateUpdate> & {
    cycle?: unknown;
    leaderboard?: unknown;
  };
  if (!candidate.cycle || !Array.isArray(candidate.leaderboard)) return null;

  // Validate the phase field to prevent "unknown" state regressions.
  // If the server returns a phase we don't recognise, coerce to IDLE so the
  // UI never renders an undefined/unknown state string.
  const cycle = candidate.cycle as StreamingStateUpdate["cycle"];
  if (
    cycle &&
    typeof cycle.phase === "string" &&
    !VALID_PHASES.has(cycle.phase)
  ) {
    console.warn(
      `[useStreamingState] Unexpected phase "${cycle.phase}" received from server — coercing to IDLE`,
    );
    cycle.phase = "IDLE";
  }

  return {
    type: "STREAMING_STATE_UPDATE",
    cycle,
    leaderboard: candidate.leaderboard as StreamingStateUpdate["leaderboard"],
    cameraTarget:
      typeof candidate.cameraTarget === "string" ||
      candidate.cameraTarget === null
        ? candidate.cameraTarget
        : null,
    seq:
      typeof candidate.seq === "number" && Number.isFinite(candidate.seq)
        ? candidate.seq
        : undefined,
    emittedAt:
      typeof candidate.emittedAt === "number" &&
      Number.isFinite(candidate.emittedAt)
        ? candidate.emittedAt
        : undefined,
  };
}

export function useStreamingState(options: { disabled?: boolean } = {}) {
  const { disabled = false } = options;
  const [state, setState] = useState<StreamingStateUpdate | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const eventSourceRef = useRef<SseSource | null>(null);
  const lastEventIdRef = useRef<number>(0);
  const closedRef = useRef(false);
  const consecutiveFailuresRef = useRef<number>(0);

  const clearPollTimer = () => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  };

  const applyState = useCallback((nextState: StreamingStateUpdate) => {
    // Determine if we need to update the event ID sequence right away
    if (
      typeof nextState.seq === "number" &&
      Number.isFinite(nextState.seq) &&
      nextState.seq > lastEventIdRef.current
    ) {
      lastEventIdRef.current = nextState.seq;
    }

    // Delay UI state application to synchronize with public stream latency
    setTimeout(() => {
      setState(nextState);
      setIsConnected(true);
    }, UI_SYNC_DELAY_MS);
  }, []);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(POLL_URL, { cache: "no-store" });
      if (!res.ok) {
        consecutiveFailuresRef.current += 1;
        if (consecutiveFailuresRef.current >= 5) {
          setError(`Duel state endpoint unhealthy (HTTP ${res.status})`);
        }
        throw new Error(`HTTP ${res.status}`);
      }
      const data = normalizeState(await res.json());
      if (data) {
        consecutiveFailuresRef.current = 0;
        setError(null);
        applyState(data);
      } else {
        consecutiveFailuresRef.current += 1;
        if (consecutiveFailuresRef.current >= 5) {
          setError("Duel state endpoint returned invalid data");
        }
      }
    } catch (err) {
      setIsConnected(false);
      if (consecutiveFailuresRef.current === 0) {
        consecutiveFailuresRef.current = 1;
      }
      if (consecutiveFailuresRef.current >= 5 && !error) {
        const message = err instanceof Error ? err.message : String(err);
        setError(`Failed to fetch duel state: ${message}`);
      }
    }
  }, [applyState, error]);

  const startFallbackPolling = useCallback(() => {
    if (pollTimer.current) return;
    void poll();
    pollTimer.current = setInterval(() => {
      void poll();
    }, FALLBACK_POLL_INTERVAL_MS);
  }, [poll]);

  const connectSse = useCallback(() => {
    if (
      typeof window === "undefined" ||
      typeof window.EventSource === "undefined"
    ) {
      startFallbackPolling();
      return;
    }

    const url = new URL(SSE_URL);
    if (lastEventIdRef.current > 0) {
      url.searchParams.set("since", String(lastEventIdRef.current));
    }

    const source = new window.EventSource(
      url.toString(),
    ) as unknown as SseSource;
    eventSourceRef.current = source;

    source.onopen = () => {
      setIsConnected(true);
      setError(null);
      consecutiveFailuresRef.current = 0;
      clearPollTimer();
    };

    source.addEventListener("state", (event: MessageEvent<string>) => {
      try {
        const parsed = normalizeState(JSON.parse(event.data));
        if (parsed) {
          consecutiveFailuresRef.current = 0;
          setError(null);
          applyState(parsed);
        }
        const eventId = Number.parseInt(event.lastEventId || "", 10);
        if (Number.isFinite(eventId) && eventId > lastEventIdRef.current) {
          lastEventIdRef.current = eventId;
        }
        clearPollTimer();
      } catch {
        // Ignore malformed SSE payloads and wait for the next frame
      }
    });

    source.addEventListener("reset", (event: MessageEvent<string>) => {
      try {
        const parsed = normalizeState(JSON.parse(event.data));
        if (parsed) {
          applyState(parsed);
        }
        const eventId = Number.parseInt(event.lastEventId || "", 10);
        if (Number.isFinite(eventId) && eventId > lastEventIdRef.current) {
          lastEventIdRef.current = eventId;
        }
      } catch {
        // Ignore malformed reset payloads
      }
    });

    source.addEventListener("unavailable", () => {
      setIsConnected(false);
      setError("Streaming state SSE unavailable - falling back to polling");
      startFallbackPolling();
    });

    source.onerror = () => {
      setIsConnected(false);
      consecutiveFailuresRef.current += 1;
      if (consecutiveFailuresRef.current >= 3) {
        setError("Streaming state SSE connection failed");
      }
      if (!closedRef.current) {
        startFallbackPolling();
      }
    };
  }, [applyState, startFallbackPolling]);

  useEffect(() => {
    closedRef.current = false;
    if (!disabled) {
      connectSse();
    } else {
      clearPollTimer();
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    }

    return () => {
      closedRef.current = true;
      clearPollTimer();
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [connectSse, disabled]);

  return { state, isConnected, error, pollUrl: POLL_URL, sseUrl: SSE_URL };
}

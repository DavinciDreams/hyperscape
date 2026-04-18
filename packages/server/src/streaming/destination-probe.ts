import type {
  StreamManifestStatus,
  StreamPublicReadiness,
} from "./delivery-config.js";
import { isIP } from "node:net";

export type StreamPlaybackProbeResult = {
  playbackUrl: string;
  ready: boolean;
  manifestStatus: StreamManifestStatus;
  statusCode: number | null;
  lastError: string | null;
  updatedAt: number;
};

type PlaybackProbePoller = {
  snapshot: StreamPlaybackProbeResult | null;
  refreshPromise: Promise<void> | null;
  interval: ReturnType<typeof setInterval>;
  refCount: number;
};

const playbackProbePollers = new Map<string, PlaybackProbePoller>();

function isPrivateIpv4Address(hostname: string): boolean {
  const parts = hostname.split(".").map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return false;
  }
  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function isBlockedPrivateHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  if (
    normalized === "localhost" ||
    normalized === "localhost.localdomain" ||
    normalized.endsWith(".local")
  ) {
    return true;
  }
  const ipVersion = isIP(normalized);
  if (ipVersion === 4) {
    return isPrivateIpv4Address(normalized);
  }
  if (ipVersion === 6) {
    return normalized === "::1" || normalized.startsWith("fe80:");
  }
  return false;
}

function validatePlaybackProbeUrl(playbackUrl: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(playbackUrl);
  } catch {
    return "invalid_playback_url";
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return "unsupported_playback_protocol";
  }

  const allowPrivateHosts =
    process.env.NODE_ENV !== "production" ||
    process.env.STREAM_ALLOW_PRIVATE_PLAYBACK_PROBES === "true";
  if (!allowPrivateHosts && isBlockedPrivateHost(parsed.hostname)) {
    return "private_playback_host_blocked";
  }

  return null;
}

function classifyProbeResult(params: {
  statusCode: number | null;
  lastError: string | null;
}): Pick<StreamPlaybackProbeResult, "ready" | "manifestStatus" | "lastError"> {
  if (params.lastError) {
    return {
      ready: false,
      manifestStatus: "unknown",
      lastError: params.lastError,
    };
  }

  if (params.statusCode === 200 || params.statusCode === 206) {
    return {
      ready: true,
      manifestStatus: "ok",
      lastError: null,
    };
  }

  if (params.statusCode === 204 || params.statusCode === 404) {
    return {
      ready: false,
      manifestStatus: "missing",
      lastError: null,
    };
  }

  if (params.statusCode != null && params.statusCode >= 500) {
    return {
      ready: false,
      manifestStatus: "stale",
      lastError: null,
    };
  }

  return {
    ready: false,
    manifestStatus: "unknown",
    lastError: null,
  };
}

export async function probePlaybackUrl(
  playbackUrl: string,
  timeoutMs = 4_000,
): Promise<StreamPlaybackProbeResult> {
  const validationError = validatePlaybackProbeUrl(playbackUrl);
  if (validationError) {
    return {
      playbackUrl,
      ready: false,
      manifestStatus: "unknown",
      statusCode: null,
      lastError: validationError,
      updatedAt: Date.now(),
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(playbackUrl, {
      method: "GET",
      cache: "no-store",
      headers: {
        accept: "application/vnd.apple.mpegurl,text/plain,*/*",
      },
      signal: controller.signal,
    });

    try {
      await response.body?.cancel();
    } catch {
      // Ignore cancellation issues on already-consumed or absent bodies.
    }

    const classified = classifyProbeResult({
      statusCode: response.status,
      lastError: null,
    });
    return {
      playbackUrl,
      statusCode: response.status,
      updatedAt: Date.now(),
      ...classified,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "playback_probe_failed";
    const classified = classifyProbeResult({
      statusCode: null,
      lastError: message,
    });
    return {
      playbackUrl,
      statusCode: null,
      updatedAt: Date.now(),
      ...classified,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function refreshPlaybackProbePoller(
  poller: PlaybackProbePoller,
  playbackUrl: string,
  timeoutMs: number,
): Promise<void> {
  if (poller.refreshPromise) {
    return poller.refreshPromise;
  }
  poller.refreshPromise = probePlaybackUrl(playbackUrl, timeoutMs)
    .then((snapshot) => {
      poller.snapshot = snapshot;
    })
    .finally(() => {
      poller.refreshPromise = null;
    });
  return poller.refreshPromise;
}

export function acquirePlaybackProbePoller(
  playbackUrl: string | null,
  options?: {
    intervalMs?: number;
    timeoutMs?: number;
  },
): {
  getSnapshot(): StreamPlaybackProbeResult | null;
  refresh(): Promise<void>;
  release(): void;
} | null {
  if (!playbackUrl) {
    return null;
  }

  const timeoutMs = Math.max(500, options?.timeoutMs ?? 4_000);
  const intervalMs = Math.max(timeoutMs, options?.intervalMs ?? 5_000);
  let poller = playbackProbePollers.get(playbackUrl);
  if (!poller) {
    poller = {
      snapshot: null,
      refreshPromise: null,
      interval: setInterval(() => {
        void refreshPlaybackProbePoller(poller!, playbackUrl, timeoutMs);
      }, intervalMs),
      refCount: 0,
    };
    poller.interval.unref?.();
    playbackProbePollers.set(playbackUrl, poller);
    void refreshPlaybackProbePoller(poller, playbackUrl, timeoutMs);
  }

  poller.refCount += 1;

  return {
    getSnapshot(): StreamPlaybackProbeResult | null {
      return poller?.snapshot ?? null;
    },
    refresh(): Promise<void> {
      if (!poller) {
        return Promise.resolve();
      }
      return refreshPlaybackProbePoller(poller, playbackUrl, timeoutMs);
    },
    release(): void {
      if (!poller) return;
      poller.refCount = Math.max(0, poller.refCount - 1);
      if (poller.refCount > 0) {
        return;
      }
      clearInterval(poller.interval);
      playbackProbePollers.delete(playbackUrl);
    },
  };
}

export function toPublicReadinessFromProbe(params: {
  ready: boolean;
  reason: string | null;
  updatedAt: number;
}): StreamPublicReadiness {
  return {
    ready: params.ready,
    reason: params.reason,
    updatedAt: params.updatedAt,
  };
}

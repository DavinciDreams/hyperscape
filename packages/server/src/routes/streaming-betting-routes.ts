import fs from "node:fs/promises";
import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { RateLimitOptions } from "@fastify/rate-limit";
import type { DatabaseSystem } from "../systems/DatabaseSystem/index.js";
import type {
  World,
  StreamingGuardrailPhase,
} from "@hyperscape/shared";
import {
  deriveStreamingGuardrailReason,
  isActiveStreamingGuardrailPhase,
} from "@hyperscape/shared";
import { getStreamingDuelScheduler } from "../systems/StreamingDuelScheduler/index.js";
import type { StreamingDuelCycle } from "../systems/StreamingDuelScheduler/types.js";
import { getStreamCapture } from "../streaming/stream-capture.js";
import { storage } from "../database/schema.js";
import {
  BETTING_FEED_SCHEMA_VERSION,
  BETTING_SOURCE_EPOCH_STORAGE_KEY,
  buildBettingFeedDedupKey,
  buildBettingFeedPayload,
  selectReplayDelivery,
  type BettingFeedFrame,
  type BettingFeedRendererHealth,
} from "./streaming-betting-feed.js";
import {
  extractBettingFeedToken,
  hasValidBettingFeedToken,
  resolveBettingFeedAccessToken,
  shouldSkipBettingFeedAuth,
} from "./streaming-betting-auth.js";
import { trimReplayFrames } from "./streaming-sse-buffer.js";

type RegisterStreamingBettingRoutesOptions = {
  fastify: FastifyInstance;
  world: World;
  replayBuffer: number;
  replayMaxBytes: number;
  pushIntervalMs: number;
  heartbeatMs: number;
  maxPendingBytes: number;
  maxClients: number;
  bootstrapRateLimit: RateLimitOptions;
  eventsRateLimit: RateLimitOptions;
  internalAllowedOrigin: string | null;
  externalStatusFile: string | null;
  externalStatusMaxAgeMs: number;
  getStreamingDuelScheduler?: typeof getStreamingDuelScheduler;
  getStreamCaptureStats?: () => {
    clientConnected: boolean;
    ffmpegRunning: boolean;
  };
};

type BettingRouteMetrics = {
  schemaVersion: number;
  sourceEpoch: number;
  clients: {
    connected: number;
  };
  replay: {
    size: number;
    totalBytes: number;
    oldestSeq: number | null;
    latestSeq: number | null;
    lastBroadcastSeq: number;
  };
};

type SseSendStatus = "ok" | "closed" | "slow" | "error";

type DatabaseSystemLike = Pick<DatabaseSystem, "getDb">;
type ExternalRtmpStatusSnapshot = Record<string, unknown>;
type ExternalStatusPoller = {
  snapshot: ExternalRtmpStatusSnapshot | null;
  refreshPromise: Promise<void> | null;
  interval: ReturnType<typeof setInterval>;
  refCount: number;
};

const externalStatusPollers = new Map<string, ExternalStatusPoller>();

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function normalizeRendererHealthSnapshot(
  value: unknown,
): BettingFeedRendererHealth | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  return {
    ready: candidate.ready === true,
    degradedReason: asString(candidate.degradedReason),
    updatedAt: asFiniteNumber(candidate.updatedAt),
  };
}

function deriveCycleGuardrailReason(
  cycle: StreamingDuelCycle | null,
): string | null {
  if (!cycle) {
    return null;
  }
  return deriveStreamingGuardrailReason({
    phase: cycle.phase as StreamingGuardrailPhase | null | undefined,
    agent1: cycle.agent1
      ? {
          id: cycle.agent1.characterId,
          name: cycle.agent1.name,
          hp: cycle.agent1.currentHp,
          maxHp: cycle.agent1.maxHp,
        }
      : null,
    agent2: cycle.agent2
      ? {
          id: cycle.agent2.characterId,
          name: cycle.agent2.name,
          hp: cycle.agent2.currentHp,
          maxHp: cycle.agent2.maxHp,
        }
      : null,
    arenaPositions: cycle.arenaPositions,
  });
}

export function parseExternalRtmpStatusSnapshot(
  raw: string,
  externalStatusMaxAgeMs: number,
  options?: { allowStale?: boolean },
): ExternalRtmpStatusSnapshot | null {
  try {
    const normalized = raw.trim();
    if (!normalized) return null;
    const parsed = JSON.parse(normalized) as ExternalRtmpStatusSnapshot;
    if (!parsed || typeof parsed !== "object") return null;
    if (!Array.isArray(parsed.destinations)) return null;
    if (typeof parsed.stats !== "object" || parsed.stats == null) return null;

    const updatedAt = Number(parsed.updatedAt || 0);
    if (
      !options?.allowStale &&
      Number.isFinite(updatedAt) &&
      updatedAt > 0 &&
      Date.now() - updatedAt > externalStatusMaxAgeMs
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function loadExternalRtmpStatusSnapshot(
  externalStatusFile: string | null,
  externalStatusMaxAgeMs: number,
  options?: { allowStale?: boolean },
): Promise<ExternalRtmpStatusSnapshot | null> {
  if (!externalStatusFile) return null;
  try {
    const raw = await fs.readFile(externalStatusFile, "utf8");
    return parseExternalRtmpStatusSnapshot(
      raw,
      externalStatusMaxAgeMs,
      options,
    );
  } catch {
    return null;
  }
}

export function deriveBettingRendererHealth(
  cycle: StreamingDuelCycle | null,
  options?: {
    externalStatusSnapshot?: ExternalRtmpStatusSnapshot | null;
    externalStatusMaxAgeMs?: number;
    nowMs?: number;
    captureStats?: {
      clientConnected: boolean;
      ffmpegRunning: boolean;
    };
  },
): BettingFeedRendererHealth {
  const updatedAt = options?.nowMs ?? Date.now();
  const guardrailReason = deriveCycleGuardrailReason(cycle);
  if (guardrailReason) {
    return {
      ready: false,
      degradedReason: guardrailReason,
      updatedAt,
    };
  }

  const externalSnapshot = options?.externalStatusSnapshot ?? null;
  const externalRendererHealth = normalizeRendererHealthSnapshot(
    externalSnapshot?.rendererHealth,
  );
  if (externalRendererHealth) {
    const ageMs =
      externalRendererHealth.updatedAt != null
        ? Math.max(0, updatedAt - externalRendererHealth.updatedAt)
        : null;
    if (
      externalRendererHealth.updatedAt != null &&
      ageMs != null &&
      ageMs > (options?.externalStatusMaxAgeMs ?? 15_000)
    ) {
      return {
        ready: false,
        degradedReason: "renderer_health_stale",
        updatedAt,
      };
    }
    return externalRendererHealth;
  }

  const captureStats = options?.captureStats ?? getStreamCapture().getStats();
  if (isActiveStreamingGuardrailPhase(cycle?.phase as StreamingGuardrailPhase)) {
    if (!captureStats.clientConnected) {
      return {
        ready: false,
        degradedReason: "capture_client_disconnected",
        updatedAt,
      };
    }
    if (!captureStats.ffmpegRunning) {
      return {
        ready: false,
        degradedReason: "capture_pipeline_inactive",
        updatedAt,
      };
    }
  }

  return {
    ready: true,
    degradedReason: null,
    updatedAt,
  };
}

function getExternalStatusPollerKey(
  externalStatusFile: string,
  externalStatusMaxAgeMs: number,
): string {
  return `${externalStatusFile}::${externalStatusMaxAgeMs}`;
}

async function refreshExternalStatusPoller(
  poller: ExternalStatusPoller,
  externalStatusFile: string,
  externalStatusMaxAgeMs: number,
): Promise<void> {
  if (poller.refreshPromise) {
    return poller.refreshPromise;
  }
  poller.refreshPromise = (async () => {
    const nextSnapshot = await loadExternalRtmpStatusSnapshot(
      externalStatusFile,
      externalStatusMaxAgeMs,
      { allowStale: true },
    );
    if (nextSnapshot) {
      poller.snapshot = nextSnapshot;
    }
  })().finally(() => {
    poller.refreshPromise = null;
  });
  return poller.refreshPromise;
}

function acquireExternalStatusPoller(
  externalStatusFile: string | null,
  externalStatusMaxAgeMs: number,
): {
  getSnapshot(): ExternalRtmpStatusSnapshot | null;
  refresh(): Promise<void>;
  release(): void;
} | null {
  if (!externalStatusFile) {
    return null;
  }

  const key = getExternalStatusPollerKey(
    externalStatusFile,
    externalStatusMaxAgeMs,
  );
  let poller = externalStatusPollers.get(key);
  if (!poller) {
    const refreshIntervalMs = Math.max(
      1_000,
      Math.min(externalStatusMaxAgeMs, 5_000),
    );
    poller = {
      snapshot: null,
      refreshPromise: null,
      interval: setInterval(() => {
        void refreshExternalStatusPoller(
          poller!,
          externalStatusFile,
          externalStatusMaxAgeMs,
        );
      }, refreshIntervalMs),
      refCount: 0,
    };
    externalStatusPollers.set(key, poller);
    void refreshExternalStatusPoller(
      poller,
      externalStatusFile,
      externalStatusMaxAgeMs,
    );
  }

  poller.refCount += 1;
  return {
    getSnapshot: () => poller?.snapshot ?? null,
    refresh: () =>
      refreshExternalStatusPoller(
        poller!,
        externalStatusFile,
        externalStatusMaxAgeMs,
      ),
    release: () => {
      if (!poller) {
        return;
      }
      poller.refCount = Math.max(0, poller.refCount - 1);
      if (poller.refCount > 0) {
        return;
      }
      clearInterval(poller.interval);
      externalStatusPollers.delete(key);
    },
  };
}

function formatSseEvent(event: string, data: string, id?: number): string {
  const normalizedData = data.replace(/\n/g, "\ndata: ");
  const idLine = typeof id === "number" ? `id: ${id}\n` : "";
  return `${idLine}event: ${event}\ndata: ${normalizedData}\n\n`;
}

export function normalizeInternalAllowedOrigin(
  value: string | null | undefined,
): string | null {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === "*" || trimmed === "null") {
    return null;
  }
  if (trimmed.includes(",")) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    if (
      parsed.pathname !== "/" ||
      parsed.search.length > 0 ||
      parsed.hash.length > 0
    ) {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

export function parseReplayCursor(
  request: FastifyRequest<{ Querystring: { since?: string } }>,
): number {
  const headerLastEventId = request.headers["last-event-id"];
  const normalizedHeaderId = Array.isArray(headerLastEventId)
    ? headerLastEventId[0]
    : headerLastEventId;
  const querySince = Number.parseInt(request.query.since || "", 10);
  const headerSince = Number.parseInt(normalizedHeaderId || "", 10);
  return Number.isFinite(headerSince)
    ? headerSince
    : Number.isFinite(querySince)
      ? querySince
      : 0;
}

export function registerStreamingBettingRoutes(
  options: RegisterStreamingBettingRoutesOptions,
): {
  close(): void;
  getMetrics(): BettingRouteMetrics;
} {
  const {
    fastify,
    world,
    replayBuffer,
    replayMaxBytes,
    pushIntervalMs,
    heartbeatMs,
    maxPendingBytes,
    maxClients,
    bootstrapRateLimit,
    eventsRateLimit,
    internalAllowedOrigin,
    externalStatusFile,
    externalStatusMaxAgeMs,
    getStreamingDuelScheduler: getStreamingDuelSchedulerOverride,
    getStreamCaptureStats,
  } = options;

  const tokenResolution = resolveBettingFeedAccessToken(process.env);
  const skipAuth = shouldSkipBettingFeedAuth(process.env);
  const allowedOrigin = normalizeInternalAllowedOrigin(internalAllowedOrigin);
  const viewerTokenConfigured = Boolean(
    process.env.STREAMING_VIEWER_ACCESS_TOKEN?.trim(),
  );
  const getScheduler =
    getStreamingDuelSchedulerOverride ?? getStreamingDuelScheduler;
  const externalStatusPoller = acquireExternalStatusPoller(
    externalStatusFile,
    externalStatusMaxAgeMs,
  );
  if (!tokenResolution.token && process.env.NODE_ENV === "production") {
    fastify.log.warn(
      "BETTING_FEED_ACCESS_TOKEN is unset in production; internal betting feed will fail closed",
    );
  } else if (!tokenResolution.token && skipAuth) {
    fastify.log.warn(
      "BETTING_FEED_SKIP_AUTH=true with no betting-feed token configured; internal betting feed auth bypass is enabled for development/test use only",
    );
  } else if (!tokenResolution.token && viewerTokenConfigured) {
    fastify.log.warn(
      "STREAMING_VIEWER_ACCESS_TOKEN is configured but is no longer accepted for internal betting feed auth; set BETTING_FEED_ACCESS_TOKEN instead",
    );
  } else if (!tokenResolution.token) {
    fastify.log.warn(
      "BETTING_FEED_ACCESS_TOKEN is unset; internal betting feed will fail closed unless BETTING_FEED_SKIP_AUTH=true is set in development/test",
    );
  } else if (viewerTokenConfigured) {
    fastify.log.info(
      "STREAMING_VIEWER_ACCESS_TOKEN remains separate from internal betting feed auth; BETTING_FEED_ACCESS_TOKEN is the canonical betting secret",
    );
  }
  if (internalAllowedOrigin && !allowedOrigin) {
    fastify.log.warn(
      {
        configuredOrigin: internalAllowedOrigin,
      },
      "Ignoring invalid INTERNAL_BET_SYNC_ALLOWED_ORIGIN; expected one explicit http(s) origin with no path, query, or hash",
    );
  }

  const bettingClients = new Map<number, FastifyReply>();
  const bettingReplayFrames: BettingFeedFrame[] = [];
  let bettingReplayFramesTotalBytes = 0;
  let bettingSequence = 0;
  let lastSerializedBettingState = "";
  let lastBettingBroadcastSeq = 0;
  let bettingPushInterval: ReturnType<typeof setInterval> | null = null;
  let bettingHeartbeatInterval: ReturnType<typeof setInterval> | null = null;
  let bettingSourceEpoch = Date.now();
  let bettingSourceEpochInit: Promise<number> | null = null;
  let bettingSourceEpochReady = false;
  let nextBettingClientId = 1;

  const writeSseMessage = (
    reply: FastifyReply,
    message: string,
  ): SseSendStatus => {
    const raw = reply.raw;
    if (raw.destroyed || raw.writableEnded) {
      return "closed";
    }
    if (raw.writableLength > maxPendingBytes) {
      return "slow";
    }

    try {
      raw.write(message);
      return "ok";
    } catch {
      return "error";
    }
  };

  const writeSseEvent = (
    reply: FastifyReply,
    event: string,
    data: string,
    id?: number,
  ): SseSendStatus => writeSseMessage(reply, formatSseEvent(event, data, id));

  const clearBettingLoops = (): void => {
    if (bettingPushInterval) {
      clearInterval(bettingPushInterval);
      bettingPushInterval = null;
    }
    if (bettingHeartbeatInterval) {
      clearInterval(bettingHeartbeatInterval);
      bettingHeartbeatInterval = null;
    }
  };

  const removeBettingClient = (clientId: number): void => {
    const clientReply = bettingClients.get(clientId);
    if (!clientReply) return;

    bettingClients.delete(clientId);
    try {
      if (!clientReply.raw.writableEnded) {
        clientReply.raw.end();
      }
    } catch {
      // ignore socket close errors
    }

    if (bettingClients.size === 0) {
      clearBettingLoops();
    }
  };

  const getDatabaseSystem = (): DatabaseSystemLike | null =>
    (world.getSystem("database") as unknown as DatabaseSystemLike | null);

  const persistBettingSourceEpoch = async (epoch: number): Promise<void> => {
    const db = getDatabaseSystem()?.getDb?.();
    if (!db) return;

    const value = JSON.stringify({
      sourceEpoch: epoch,
      updatedAt: Date.now(),
    });
    try {
      await db
        .insert(storage)
        .values({
          key: BETTING_SOURCE_EPOCH_STORAGE_KEY,
          value,
          updatedAt: Date.now(),
        })
        .onConflictDoUpdate({
          target: storage.key,
          set: {
            value,
            updatedAt: Date.now(),
          },
        });
    } catch {
      // Best-effort durability only.
    }
  };

  const ensureBettingSourceEpoch = async (): Promise<number> => {
    if (bettingSourceEpochReady) {
      return bettingSourceEpoch;
    }
    if (bettingSourceEpochInit) {
      return bettingSourceEpochInit;
    }

    bettingSourceEpochInit = (async () => {
      const db = getDatabaseSystem()?.getDb?.();
      if (!db) {
        return bettingSourceEpoch;
      }

      try {
        const rows = await db
          .select()
          .from(storage)
          .where(eq(storage.key, BETTING_SOURCE_EPOCH_STORAGE_KEY))
          .limit(1);
        const rawValue = rows[0]?.value ?? "";
        let parsedEpoch = Number.parseInt(rawValue, 10);
        if (!Number.isFinite(parsedEpoch)) {
          try {
            const parsed = JSON.parse(rawValue) as {
              sourceEpoch?: number;
            };
            parsedEpoch = Number(parsed?.sourceEpoch);
          } catch {
            parsedEpoch = Number.NaN;
          }
        }

        bettingSourceEpoch = Number.isFinite(parsedEpoch)
          ? Math.max(parsedEpoch + 1, Date.now())
          : Date.now();
        await persistBettingSourceEpoch(bettingSourceEpoch);
      } catch {
        bettingSourceEpoch = Date.now();
      }

      bettingSourceEpochReady = true;
      return bettingSourceEpoch;
    })();

    return bettingSourceEpochInit;
  };

  const currentRendererHealthSnapshot = (
    cycle: StreamingDuelCycle | null,
    nowMs?: number,
  ): BettingFeedRendererHealth =>
    deriveBettingRendererHealth(cycle, {
      externalStatusSnapshot: externalStatusPoller?.getSnapshot() ?? null,
      externalStatusMaxAgeMs,
      nowMs,
      captureStats: getStreamCaptureStats?.() ?? undefined,
    });

  const captureBettingFrame = (
    forceNewFrame = false,
  ): BettingFeedFrame | null => {
    const scheduler = getScheduler();
    const cycle = scheduler?.getCurrentCycle() ?? null;
    const nextSeq = bettingSequence + 1;
    const emittedAt = Date.now();
    const rendererHealth = currentRendererHealthSnapshot(cycle, emittedAt);
    const payload = buildBettingFeedPayload({
      sourceEpoch: bettingSourceEpoch,
      seq: nextSeq,
      emittedAt,
      cycle,
      rendererHealth,
    });
    const dedupKey = buildBettingFeedDedupKey(payload);

    if (
      !forceNewFrame &&
      dedupKey === lastSerializedBettingState &&
      bettingReplayFrames.length > 0
    ) {
      return null;
    }

    lastSerializedBettingState = dedupKey;
    bettingSequence = nextSeq;
    const payloadJson = JSON.stringify(payload);

    const frame: BettingFeedFrame = {
      seq: nextSeq,
      emittedAt: payload.emittedAt,
      payload,
      payloadJson,
      payloadBytes: Buffer.byteLength(payloadJson, "utf8"),
    };

    bettingReplayFrames.push(frame);
    bettingReplayFramesTotalBytes += frame.payloadBytes;
    bettingReplayFramesTotalBytes = trimReplayFrames(
      bettingReplayFrames,
      bettingReplayFramesTotalBytes,
      {
        maxFrames: replayBuffer,
        maxBytes: replayMaxBytes,
      },
    );

    return frame;
  };

  const startBettingLoopsIfNeeded = (): void => {
    if (bettingPushInterval) return;

    lastBettingBroadcastSeq =
      bettingReplayFrames[bettingReplayFrames.length - 1]?.seq ?? 0;

    bettingPushInterval = setInterval(() => {
      const frame = captureBettingFrame(false);
      if (!frame) return;

      for (const [clientId, clientReply] of bettingClients.entries()) {
        const status = writeSseEvent(
          clientReply,
          "betting",
          frame.payloadJson,
          frame.seq,
        );
        if (status !== "ok") {
          removeBettingClient(clientId);
          continue;
        }
      }
      lastBettingBroadcastSeq = frame.seq;
    }, pushIntervalMs);

    bettingHeartbeatInterval = setInterval(() => {
      const heartbeatMessage = `:hb ${Date.now()}\n\n`;
      for (const [clientId, clientReply] of bettingClients.entries()) {
        const status = writeSseMessage(clientReply, heartbeatMessage);
        if (status === "ok") {
          continue;
        }
        removeBettingClient(clientId);
      }
    }, heartbeatMs);
  };

  const assertBettingAuth = async (
    request: FastifyRequest,
    reply: FastifyReply,
    authOptions?: { allowQueryToken?: boolean },
  ): Promise<boolean> => {
    const requiredToken = resolveBettingFeedAccessToken(process.env).token;
    if (!requiredToken) {
      if (process.env.NODE_ENV === "production" || !skipAuth) {
        reply.status(503).send({
          error: "Service unavailable",
          message: "Betting feed auth token is not configured",
        });
        return false;
      }
      return true;
    }

    const requestQuery = request.query as { streamToken?: string };
    const token = extractBettingFeedToken({
      authorizationHeader: request.headers.authorization,
      streamToken: requestQuery.streamToken?.trim() || null,
      // EventSource cannot set Authorization headers, so the query-token path
      // is retained only for the long-lived SSE event stream. Production
      // access logs and reverse proxies must redact streamToken from URLs.
      allowQueryToken: authOptions?.allowQueryToken,
    });

    if (hasValidBettingFeedToken(requiredToken, token)) {
      return true;
    }

    reply.status(401).send({
      error: "Unauthorized",
      message: "Missing or invalid betting feed token",
    });
    return false;
  };

  const buildBettingBootstrapResponse = (frame: BettingFeedFrame | null) => {
    const fallbackEmittedAt = Date.now();
    const fallbackPayload = buildBettingFeedPayload({
      sourceEpoch: bettingSourceEpoch,
      seq: bettingSequence,
      emittedAt: fallbackEmittedAt,
      cycle: null,
      rendererHealth: currentRendererHealthSnapshot(null, fallbackEmittedAt),
    });

    return {
      ...(frame?.payload ?? fallbackPayload),
      schemaVersion: BETTING_FEED_SCHEMA_VERSION,
      sourceEpoch: bettingSourceEpoch,
      seq: frame?.seq ?? bettingSequence,
      emittedAt: frame?.emittedAt ?? fallbackEmittedAt,
      replay: {
        sourceEpoch: bettingSourceEpoch,
        latestSeq:
          bettingReplayFrames[bettingReplayFrames.length - 1]?.seq ?? null,
        oldestSeq: bettingReplayFrames[0]?.seq ?? null,
        bufferedFrames: bettingReplayFrames.length,
        bufferedBytes: bettingReplayFramesTotalBytes,
        lastBroadcastSeq: lastBettingBroadcastSeq,
      },
    };
  };

  const bettingBootstrapAuthPreHandler = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> => {
    if (!(await assertBettingAuth(request, reply, { allowQueryToken: false }))) {
      return;
    }
  };

  const bettingEventsAuthPreHandler = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> => {
    if (!(await assertBettingAuth(request, reply, { allowQueryToken: true }))) {
      return;
    }
  };

  const handleBettingBootstrap = async (
    _request: FastifyRequest,
    reply: FastifyReply,
  ) => {
    const scheduler = getScheduler();
    if (!scheduler) {
      return reply.status(503).send({
        error: "Streaming mode not active",
        message: "The streaming duel scheduler is not running",
      });
    }

    await ensureBettingSourceEpoch();
    if (bettingReplayFrames.length === 0) {
      captureBettingFrame(true);
    }

    return reply.send(
      buildBettingBootstrapResponse(
        bettingReplayFrames[bettingReplayFrames.length - 1] ?? null,
      ),
    );
  };

  const handleBettingEvents = async (
    request: FastifyRequest<{ Querystring: { since?: string } }>,
    reply: FastifyReply,
  ) => {
    const scheduler = getScheduler();
    if (!scheduler) {
      return reply.status(503).send({
        error: "Streaming mode not active",
        message: "The streaming duel scheduler is not running",
      });
    }

    await ensureBettingSourceEpoch();
    if (bettingReplayFrames.length === 0) {
      captureBettingFrame(true);
    }

    if (bettingClients.size >= maxClients) {
      return reply.status(503).send({
        error: "Bet sync SSE capacity reached",
        message: "Too many concurrent betting SSE clients",
      });
    }

    const raw = reply.raw;
    reply.hijack();

    raw.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    raw.setHeader("Cache-Control", "no-cache, no-transform");
    raw.setHeader("Connection", "keep-alive");
    raw.setHeader("X-Accel-Buffering", "no");
    if (allowedOrigin) {
      raw.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    }
    raw.socket?.setNoDelay?.(true);
    raw.socket?.setKeepAlive?.(true, heartbeatMs * 2);
    raw.flushHeaders?.();
    raw.write("retry: 2000\n\n");

    const clientId = nextBettingClientId++;
    bettingClients.set(clientId, reply);

    const delivery = selectReplayDelivery(
      bettingReplayFrames,
      parseReplayCursor(request),
    );
    if (delivery.mode === "reset") {
      const status = writeSseEvent(
        reply,
        "reset",
        delivery.latestFrame.payloadJson,
        delivery.latestFrame.seq,
      );
      if (status !== "ok") {
        removeBettingClient(clientId);
        return;
      }
    } else if (delivery.frames.length > 0) {
      for (const frame of delivery.frames) {
        const status = writeSseEvent(
          reply,
          "betting",
          frame.payloadJson,
          frame.seq,
        );
        if (status !== "ok") {
          removeBettingClient(clientId);
          return;
        }
      }
    } else if (delivery.mode === "bootstrap" && delivery.latestFrame) {
      const status = writeSseEvent(
        reply,
        "betting",
        delivery.latestFrame.payloadJson,
        delivery.latestFrame.seq,
      );
      if (status !== "ok") {
        removeBettingClient(clientId);
        return;
      }
    }

    request.raw.on("close", () => {
      removeBettingClient(clientId);
    });

    startBettingLoopsIfNeeded();
  };

  // Legacy compatibility alias. Canonical internal betting bootstrap route:
  // /api/internal/bet-sync/state
  fastify.get("/api/streaming/betting/bootstrap", {
    config: { rateLimit: bootstrapRateLimit },
    preHandler: bettingBootstrapAuthPreHandler,
  }, handleBettingBootstrap);

  // Canonical internal betting bootstrap route.
  fastify.get("/api/internal/bet-sync/state", {
    config: { rateLimit: bootstrapRateLimit },
    preHandler: bettingBootstrapAuthPreHandler,
  }, handleBettingBootstrap);

  // Legacy compatibility alias. Canonical internal betting SSE route:
  // /api/internal/bet-sync/events
  fastify.get<{
    Querystring: { since?: string };
  }>("/api/streaming/betting/events", {
    config: { rateLimit: eventsRateLimit },
    preHandler: bettingEventsAuthPreHandler,
  }, handleBettingEvents);

  // Canonical internal betting SSE route.
  fastify.get<{
    Querystring: { since?: string };
  }>("/api/internal/bet-sync/events", {
    config: { rateLimit: eventsRateLimit },
    preHandler: bettingEventsAuthPreHandler,
  }, handleBettingEvents);

  return {
    close(): void {
      clearBettingLoops();
      externalStatusPoller?.release();
      for (const clientId of [...bettingClients.keys()]) {
        removeBettingClient(clientId);
      }
    },
    getMetrics(): BettingRouteMetrics {
      return {
        schemaVersion: BETTING_FEED_SCHEMA_VERSION,
        sourceEpoch: bettingSourceEpoch,
        clients: {
          connected: bettingClients.size,
        },
        replay: {
          size: bettingReplayFrames.length,
          totalBytes: bettingReplayFramesTotalBytes,
          oldestSeq: bettingReplayFrames[0]?.seq ?? null,
          latestSeq:
            bettingReplayFrames[bettingReplayFrames.length - 1]?.seq ?? null,
          lastBroadcastSeq: lastBettingBroadcastSeq,
        },
      };
    },
  };
}

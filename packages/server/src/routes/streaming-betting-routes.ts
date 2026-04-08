import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { RateLimitOptions } from "@fastify/rate-limit";
import type { DatabaseSystem } from "../systems/DatabaseSystem/index.js";
import type { World } from "@hyperscape/shared";
import { getStreamingDuelScheduler } from "../systems/StreamingDuelScheduler/index.js";
import type { StreamingDuelCycle } from "../systems/StreamingDuelScheduler/types.js";
import { storage } from "../database/schema.js";
import {
  BETTING_FEED_SCHEMA_VERSION,
  BETTING_SOURCE_EPOCH_STORAGE_KEY,
  buildBettingFeedDedupKey,
  buildBettingFeedPayload,
  selectReplayDelivery,
  type BettingFeedFrame,
  type BettingFeedRendererMetrics,
  type BettingFeedRendererHealth,
} from "./streaming-betting-feed.js";
import {
  extractBettingFeedToken,
  hasValidBettingFeedToken,
  resolveBettingFeedAccessToken,
  shouldSkipBettingFeedAuth,
} from "./streaming-betting-auth.js";
import { trimReplayFrames } from "./streaming-sse-buffer.js";
import { deriveBettingRendererHealth } from "./streaming-betting-health.js";
import {
  acquireExternalStatusPoller,
  type ExternalRtmpDestination,
  type ExternalRtmpStatusSnapshot,
} from "./streaming-external-status.js";
import { deriveStreamSourceRuntime } from "./streaming-source-runtime.js";
import { acquirePlaybackProbePoller } from "../streaming/destination-probe.js";
import {
  buildStreamDestinationId,
  inferStreamDeliveryTransport,
  normalizeStreamDestinationProvider,
  resolveSelfHostedStreamPlaybackUrl,
  resolveStreamDeliveryInfo,
  resolveStreamPresentationDelayMs,
  type StreamChannelState,
  type StreamDestinationState,
  type StreamManifestStatus,
  type StreamPublicReadiness,
} from "../streaming/delivery-config.js";
import type { StreamSourceRuntime } from "../streaming/source-runtime.js";
import { readLocalHlsManifestSnapshot } from "../streaming/stream-status-artifacts.js";

// Re-exports so existing consumers (streaming.ts, tests) don't need import changes.
export { deriveBettingRendererHealth } from "./streaming-betting-health.js";
export {
  loadExternalRtmpStatusSnapshot,
  parseExternalRtmpStatusSnapshot,
} from "./streaming-external-status.js";

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

const REQUIRE_EXTERNAL_SOURCE_RUNTIME =
  process.env.STREAM_SOURCE_RUNTIME_REQUIRE_EXTERNAL === "true" ||
  process.env.NODE_ENV === "production";

type SseSendStatus = "ok" | "closed" | "slow" | "error";

type DatabaseSystemLike = Pick<DatabaseSystem, "getDb">;

type BettingClientIdAllocation = {
  clientId: number;
  nextCursor: number;
};

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

export function allocateNextBettingClientId(
  nextCursor: number,
  activeClientIds: Iterable<number>,
): BettingClientIdAllocation {
  const activeIds = new Set(activeClientIds);
  const maxClientId = Number.MAX_SAFE_INTEGER - 1;
  let clientId = nextCursor;
  let wrapped = false;

  while (activeIds.has(clientId)) {
    clientId += 1;
    if (clientId > maxClientId) {
      clientId = 1;
      wrapped = true;
    }
    if (wrapped && clientId === nextCursor) {
      throw new Error("No betting SSE client ids available");
    }
  }

  const nextId = clientId >= maxClientId ? 1 : clientId + 1;
  return {
    clientId,
    nextCursor: nextId,
  };
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
  const configuredDelivery = resolveStreamDeliveryInfo(process.env);
  const configuredPresentationDelayMs = resolveStreamPresentationDelayMs(
    process.env,
    configuredDelivery.mode,
  );
  const configuredSelfHostedPlaybackUrl =
    resolveSelfHostedStreamPlaybackUrl(process.env);
  const configuredCanonicalProvider = normalizeStreamDestinationProvider(
    configuredDelivery.provider,
    "Cloudflare",
  );
  const configuredCanonicalDestinationId = buildStreamDestinationId({
    role: "canonical",
    provider: configuredCanonicalProvider,
    name: "External Delivery",
  });
  const configuredFallbackDestinationId = buildStreamDestinationId({
    role: "fallback",
    provider: "self_hls",
    name: "Self-HLS",
  });
  const configuredExternalPlaybackUrl =
    configuredDelivery.mode === "external_hls"
      ? configuredDelivery.playbackUrl ??
        configuredDelivery.llhlsUrl ??
        configuredDelivery.hlsUrl
      : null;
  const externalPlaybackProbePoller = acquirePlaybackProbePoller(
    configuredExternalPlaybackUrl,
    {
      intervalMs: Math.max(2_000, Math.min(externalStatusMaxAgeMs, 5_000)),
      timeoutMs: Math.min(externalStatusMaxAgeMs, 4_000),
    },
  );
  if (!tokenResolution.token && process.env.NODE_ENV === "production") {
    fastify.log.warn(
      "BETTING_FEED_ACCESS_TOKEN is unset in production; internal betting feed will fail closed",
    );
  } else if (!tokenResolution.token && skipAuth) {
    fastify.log.warn(
      "BETTING_FEED_SKIP_AUTH=true with no betting-feed token configured; internal betting feed auth bypass is enabled for development use only",
    );
  } else if (!tokenResolution.token && viewerTokenConfigured) {
    fastify.log.warn(
      "STREAMING_VIEWER_ACCESS_TOKEN is configured but is no longer accepted for internal betting feed auth; set BETTING_FEED_ACCESS_TOKEN instead",
    );
  } else if (!tokenResolution.token) {
    fastify.log.warn(
      "BETTING_FEED_ACCESS_TOKEN is unset; internal betting feed will fail closed unless BETTING_FEED_SKIP_AUTH=true is set in development",
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
  let closed = false;

  const writeSseMessage = (
    reply: FastifyReply,
    message: string,
  ): SseSendStatus => {
    const raw = reply.raw;
    if (raw.destroyed || raw.writableEnded || !raw.writable) {
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

  const closeRoutes = (): void => {
    if (closed) {
      return;
    }
    closed = true;
    clearBettingLoops();
    externalPlaybackProbePoller?.release();
    externalStatusPoller?.release();
    for (const clientId of [...bettingClients.keys()]) {
      removeBettingClient(clientId);
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
    (world.getSystem("database") ?? null) as DatabaseSystemLike | null;

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
        let parsedEpoch = Number.NaN;
        try {
          const parsed = JSON.parse(rawValue) as {
            sourceEpoch?: number;
          };
          parsedEpoch = Number(parsed?.sourceEpoch);
        } catch {
          // Stored value is not valid JSON — fall through to Date.now().
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
  ): BettingFeedRendererHealth => {
    const localHlsManifest = readLocalHlsManifestSnapshot(process.env);
    return deriveBettingRendererHealth(cycle, {
      externalStatusSnapshot: externalStatusPoller?.getSnapshot() ?? null,
      externalStatusMaxAgeMs,
      nowMs,
      localHlsManifest,
      captureStats: getStreamCaptureStats?.() ?? undefined,
    });
  };

  const currentRendererMetricsSnapshot = (): BettingFeedRendererMetrics | null => {
    const metrics = externalStatusPoller?.getSnapshot()?.metrics;
    const hlsManifest =
      externalStatusPoller?.getSnapshot()?.hlsManifest ??
      readLocalHlsManifestSnapshot(process.env);
    const hasHlsManifest =
      typeof hlsManifest?.updatedAt === "number" ||
      typeof hlsManifest?.mediaSequence === "number";
    if (!metrics && !hasHlsManifest) {
      return null;
    }
    return {
      captureFps:
        typeof metrics?.captureFps === "number" ? metrics.captureFps : null,
      encodeFps:
        typeof metrics?.encodeFps === "number" ? metrics.encodeFps : null,
      droppedFrames:
        typeof metrics?.droppedFrames === "number" ? metrics.droppedFrames : null,
      renderTick:
        typeof metrics?.renderTick === "number" ? metrics.renderTick : null,
      duelStateTick:
        typeof metrics?.duelStateTick === "number" ? metrics.duelStateTick : null,
      latestFrameAt:
        typeof metrics?.latestFrameAt === "number" ? metrics.latestFrameAt : null,
      latestRenderTickAt:
        typeof metrics?.latestRenderTickAt === "number"
          ? metrics.latestRenderTickAt
          : null,
      latestDuelStateTickAt:
        typeof metrics?.latestDuelStateTickAt === "number"
          ? metrics.latestDuelStateTickAt
          : null,
      latestVisualChangeAt:
        typeof metrics?.latestVisualChangeAt === "number"
          ? metrics.latestVisualChangeAt
          : null,
      visualChangeAgeMs:
        typeof metrics?.visualChangeAgeMs === "number"
          ? metrics.visualChangeAgeMs
          : null,
      hlsManifest: hasHlsManifest
        ? {
            updatedAt:
              typeof hlsManifest.updatedAt === "number"
                ? hlsManifest.updatedAt
                : null,
            mediaSequence:
              typeof hlsManifest.mediaSequence === "number"
                ? hlsManifest.mediaSequence
                : null,
          }
        : null,
    };
  };

  const currentSourceRuntimeSnapshot = (
    cycle: StreamingDuelCycle | null,
    nowMs?: number,
    rendererHealth?: BettingFeedRendererHealth | null,
  ): StreamSourceRuntime => {
    const localHlsManifest = readLocalHlsManifestSnapshot(process.env);
    return deriveStreamSourceRuntime({
      externalStatusSnapshot: externalStatusPoller?.getSnapshot() ?? null,
      externalStatusMaxAgeMs,
      rendererHealth: rendererHealth ?? currentRendererHealthSnapshot(cycle, nowMs),
      localHlsManifest,
      captureStats: getStreamCaptureStats?.() ?? undefined,
      nowMs,
      requireExternalWorker: REQUIRE_EXTERNAL_SOURCE_RUNTIME,
    });
  };

  const resolveSnapshotUpdatedAt = (
    value: number | null | undefined,
    fallbackUpdatedAt: number,
  ): number => {
    return typeof value === "number" && Number.isFinite(value)
      ? value
      : fallbackUpdatedAt;
  };

  const isSnapshotFresh = (
    updatedAt: number | null | undefined,
    nowMs: number,
  ): boolean => {
    return (
      typeof updatedAt === "number" &&
      Number.isFinite(updatedAt) &&
      Math.max(0, nowMs - updatedAt) <= externalStatusMaxAgeMs
    );
  };

  const resolveManifestStatusFromUpdatedAt = (
    updatedAt: number | null | undefined,
    nowMs: number,
  ): StreamManifestStatus => {
    if (typeof updatedAt !== "number" || !Number.isFinite(updatedAt)) {
      return "missing";
    }
    return isSnapshotFresh(updatedAt, nowMs) ? "ok" : "stale";
  };

  const resolveExternalDeliveryReason = (params: {
    nowMs: number;
    externalSnapshot: ExternalRtmpStatusSnapshot | null;
    destination: ExternalRtmpDestination | null;
    playbackUrl: string | null;
  }): string | null => {
    const probeSnapshot = externalPlaybackProbePoller?.getSnapshot() ?? null;

    if (!params.playbackUrl) {
      return "playback_unconfigured";
    }
    if (!params.externalSnapshot) {
      return "delivery_status_unavailable";
    }

    const snapshotUpdatedAt = resolveSnapshotUpdatedAt(
      params.externalSnapshot.updatedAt,
      params.nowMs,
    );
    if (!isSnapshotFresh(snapshotUpdatedAt, params.nowMs)) {
      return "delivery_status_stale";
    }
    if (
      params.externalSnapshot.active !== true ||
      params.externalSnapshot.ffmpegRunning !== true
    ) {
      return "delivery_pipeline_inactive";
    }
    if (!params.destination) {
      return "delivery_destination_missing";
    }
    if (probeSnapshot?.ready === true) {
      return null;
    }
    if (params.destination.connected !== true) {
      return "delivery_disconnected";
    }
    if (
      params.externalSnapshot.stats?.healthy === false ||
      (typeof params.destination.error === "string" &&
        params.destination.error.trim().length > 0)
    ) {
      return "delivery_unhealthy";
    }
    if (!probeSnapshot) {
      return "delivery_status_unavailable";
    }
    if (probeSnapshot.ready) {
      return null;
    }
    if (probeSnapshot.manifestStatus === "missing") {
      return "manifest_not_ready";
    }
    if (probeSnapshot.manifestStatus === "stale") {
      return "manifest_stale";
    }
    return "delivery_unhealthy";
  };

  const findCanonicalExternalDestination = (
    externalSnapshot: ExternalRtmpStatusSnapshot | null,
  ): ExternalRtmpDestination | null => {
    if (!externalSnapshot) {
      return null;
    }

    const destinations = Array.isArray(externalSnapshot.destinations)
      ? externalSnapshot.destinations
      : [];
    return (
      destinations.find((destination) => destination.role === "canonical") ??
      destinations.find(
        (destination) => destination.id === configuredCanonicalDestinationId,
      ) ??
      destinations.find(
        (destination) =>
          normalizeStreamDestinationProvider(
            destination.provider ?? null,
            destination.name ?? null,
          ) === configuredCanonicalProvider,
      ) ??
      destinations.find((destination) =>
        (destination.name ?? "")
          .trim()
          .toLowerCase()
          .includes("external delivery"),
      ) ??
      null
    );
  };

  const buildSelfHostedDestination = (params: {
    role: "canonical" | "fallback";
    nowMs: number;
  }): StreamDestinationState => {
    const localManifest =
      externalStatusPoller?.getSnapshot()?.hlsManifest ??
      readLocalHlsManifestSnapshot(process.env);
    const manifestUpdatedAt =
      typeof localManifest?.updatedAt === "number" &&
      Number.isFinite(localManifest.updatedAt)
        ? localManifest.updatedAt
        : null;
    const manifestStatus = resolveManifestStatusFromUpdatedAt(
      manifestUpdatedAt,
      params.nowMs,
    );
    const playbackReady = manifestStatus === "ok";

    return {
      id:
        params.role === "fallback"
          ? configuredFallbackDestinationId
          : buildStreamDestinationId({
              role: "canonical",
              provider: "self_hls",
              name: "Self-HLS",
            }),
      name: "Self-HLS",
      role: params.role,
      provider: "self_hls",
      transport: "hls",
      playbackUrl: configuredSelfHostedPlaybackUrl,
      ingestUrl: null,
      connected: playbackReady,
      transportHealthy: playbackReady,
      playbackReady,
      manifestStatus,
      lastError:
        playbackReady
          ? null
          : manifestStatus === "stale"
            ? "manifest_stale"
            : "manifest_not_ready",
      updatedAt: manifestUpdatedAt,
    };
  };

  const buildCanonicalExternalDestination = (params: {
    nowMs: number;
    sourceRuntime: StreamSourceRuntime;
  }): {
    destination: StreamDestinationState;
    publicReadiness: StreamPublicReadiness;
  } => {
    const externalSnapshot = externalStatusPoller?.getSnapshot() ?? null;
    const externalDestination = findCanonicalExternalDestination(externalSnapshot);
    const probeSnapshot = externalPlaybackProbePoller?.getSnapshot() ?? null;
    const playbackUrl =
      externalDestination?.playbackUrl ??
      configuredDelivery.playbackUrl ??
      configuredDelivery.llhlsUrl ??
      configuredDelivery.hlsUrl ??
      null;
    const ingestUrl =
      externalDestination?.ingestUrl ?? configuredDelivery.ingestUrl ?? null;
    const snapshotUpdatedAt = externalSnapshot
      ? resolveSnapshotUpdatedAt(externalSnapshot.updatedAt, params.nowMs)
      : params.nowMs;
    const probeReady = probeSnapshot?.ready === true;
    const destinationConnected =
      externalDestination?.connected === true || probeReady;
    const destinationError =
      typeof externalDestination?.error === "string"
        ? externalDestination.error.trim()
        : null;
    const updatedAt = resolveSnapshotUpdatedAt(
      probeSnapshot?.updatedAt ??
        externalDestination?.startedAt ??
        externalSnapshot?.updatedAt,
      params.nowMs,
    );
    const lastFatalWriteAt =
      typeof externalSnapshot?.captureDiagnostics?.lastFatalWriteError?.at ===
        "number" &&
      Number.isFinite(externalSnapshot.captureDiagnostics.lastFatalWriteError.at)
        ? externalSnapshot.captureDiagnostics.lastFatalWriteError.at
        : null;
    const freshestSourceIncidentAt = Math.max(
      lastFatalWriteAt ?? Number.NEGATIVE_INFINITY,
      params.sourceRuntime.workerHeartbeatAt ?? Number.NEGATIVE_INFINITY,
    );
    const contradictorySourceError =
      probeReady &&
      params.sourceRuntime.ready !== true &&
      (!Number.isFinite(freshestSourceIncidentAt) ||
        freshestSourceIncidentAt >= updatedAt);
    const transportHealthy =
      params.sourceRuntime.ready === true &&
      externalSnapshot != null &&
      isSnapshotFresh(snapshotUpdatedAt, params.nowMs) &&
      externalSnapshot.active === true &&
      externalSnapshot.ffmpegRunning === true &&
      externalSnapshot.stats?.healthy !== false &&
      destinationConnected &&
      probeReady &&
      !contradictorySourceError;
    const reason = resolveExternalDeliveryReason({
      nowMs: params.nowMs,
      externalSnapshot,
      destination: externalDestination,
      playbackUrl,
    });

    return {
      destination: {
        id: externalDestination?.id ?? configuredCanonicalDestinationId,
        name: externalDestination?.name ?? "External Delivery",
        role: "canonical",
        provider: normalizeStreamDestinationProvider(
          externalDestination?.provider ?? configuredDelivery.provider,
          externalDestination?.name ?? "External Delivery",
        ),
        transport:
          externalDestination?.transport ??
          inferStreamDeliveryTransport({
            playbackUrl,
            ingestUrl,
          }),
        playbackUrl,
        ingestUrl,
        connected: destinationConnected,
        transportHealthy,
        playbackReady: probeReady,
        manifestStatus:
          probeSnapshot?.manifestStatus ??
          (playbackUrl ? "unknown" : "missing"),
        lastError: probeReady
          ? contradictorySourceError
            ? params.sourceRuntime.degradedReason ??
              destinationError ??
              reason
            : null
          : destinationError ?? probeSnapshot?.lastError ?? reason,
        updatedAt,
      },
      publicReadiness: {
        ready: reason == null,
        reason,
        updatedAt,
      },
    };
  };

  const buildMirrorDestinations = (params: {
    nowMs: number;
    canonicalDestinationId: string | null;
  }): StreamDestinationState[] => {
    const externalSnapshot = externalStatusPoller?.getSnapshot() ?? null;
    if (!externalSnapshot) {
      return [];
    }

    const snapshotUpdatedAt = resolveSnapshotUpdatedAt(
      externalSnapshot.updatedAt,
      params.nowMs,
    );
    const snapshotFresh = isSnapshotFresh(snapshotUpdatedAt, params.nowMs);
    const baseTransportHealthy =
      snapshotFresh &&
      externalSnapshot.active === true &&
      externalSnapshot.ffmpegRunning === true &&
      externalSnapshot.stats?.healthy !== false;
    const seen = new Set<string>();

    return externalSnapshot.destinations.flatMap((destination) => {
      const provider = normalizeStreamDestinationProvider(
        destination.provider ?? null,
        destination.name ?? null,
      );
      if (
        destination.id === params.canonicalDestinationId ||
        destination.role === "canonical" ||
        (params.canonicalDestinationId != null &&
          provider === configuredCanonicalProvider &&
          ((destination.name ?? "")
            .trim()
            .toLowerCase()
            .includes("external delivery") ||
            destination.id == null))
      ) {
        return [];
      }
      if (destination.role === "fallback" || provider === "self_hls") {
        return [];
      }

      const id =
        destination.id ??
        buildStreamDestinationId({
          role: "mirror",
          provider,
          name: destination.name ?? provider,
        });
      if (seen.has(id)) {
        return [];
      }
      seen.add(id);

      const transportHealthy =
        baseTransportHealthy &&
        destination.connected === true &&
        !(
          typeof destination.error === "string" &&
          destination.error.trim().length > 0
        );
      return [
        {
          id,
          name: destination.name ?? provider,
          role: "mirror",
          provider,
          transport:
            destination.transport ??
            inferStreamDeliveryTransport({
              playbackUrl: destination.playbackUrl ?? null,
              ingestUrl: destination.ingestUrl ?? destination.url ?? null,
            }),
          playbackUrl: destination.playbackUrl ?? null,
          ingestUrl: destination.ingestUrl ?? destination.url ?? null,
          connected: destination.connected === true,
          transportHealthy,
          playbackReady: transportHealthy,
          manifestStatus: "unknown",
          lastError:
            typeof destination.error === "string" &&
            destination.error.trim().length > 0
              ? destination.error.trim()
              : snapshotFresh
                ? null
                : "delivery_status_stale",
          updatedAt: resolveSnapshotUpdatedAt(
            destination.startedAt ?? externalSnapshot.updatedAt,
            params.nowMs,
          ),
        } satisfies StreamDestinationState,
      ];
    });
  };

  const currentChannelSnapshot = (
    cycle: StreamingDuelCycle | null,
    nowMs?: number,
    sourceRuntime?: StreamSourceRuntime,
  ): StreamChannelState => {
    const updatedAt = nowMs ?? Date.now();
    const resolvedSourceRuntime =
      sourceRuntime ?? currentSourceRuntimeSnapshot(cycle, updatedAt);

    if (configuredDelivery.mode === "external_hls") {
      const { destination: canonicalDestination, publicReadiness } =
        buildCanonicalExternalDestination({
          nowMs: updatedAt,
          sourceRuntime: resolvedSourceRuntime,
        });
      const mirrors = buildMirrorDestinations({
        nowMs: updatedAt,
        canonicalDestinationId: canonicalDestination.id,
      });
      const fallbackDestination = buildSelfHostedDestination({
        role: "fallback",
        nowMs: updatedAt,
      });
      return {
        id: "hyperscapes-broadcast-channel",
        mode: "always_on",
        presentationDelayMs: configuredPresentationDelayMs,
        activeDuelId: cycle?.duelId ?? null,
        activeDuelKey: cycle?.duelKeyHex ?? null,
        canonicalDestinationId: canonicalDestination.id,
        fallbackDestinationId: fallbackDestination.id,
        publicPlaybackUrl: canonicalDestination.playbackUrl,
        publicReadiness: resolvedSourceRuntime.ready
          ? publicReadiness
          : {
              ready: false,
              reason: resolvedSourceRuntime.degradedReason,
              updatedAt:
                resolvedSourceRuntime.workerHeartbeatAt ??
                publicReadiness.updatedAt,
            },
        destinations: [canonicalDestination, fallbackDestination, ...mirrors],
      };
    }

    const mirrors = buildMirrorDestinations({
      nowMs: updatedAt,
      canonicalDestinationId: null,
    });
    const canonicalDestination = buildSelfHostedDestination({
      role: "canonical",
      nowMs: updatedAt,
    });
    return {
      id: "hyperscapes-broadcast-channel",
      mode: "always_on",
      presentationDelayMs: configuredPresentationDelayMs,
      activeDuelId: cycle?.duelId ?? null,
      activeDuelKey: cycle?.duelKeyHex ?? null,
      canonicalDestinationId: canonicalDestination.id,
      fallbackDestinationId: null,
      publicPlaybackUrl: canonicalDestination.playbackUrl,
      publicReadiness: resolvedSourceRuntime.ready
        ? {
            ready: canonicalDestination.playbackReady,
            reason: canonicalDestination.lastError,
            updatedAt: canonicalDestination.updatedAt,
          }
        : {
            ready: false,
            reason: resolvedSourceRuntime.degradedReason,
            updatedAt:
              resolvedSourceRuntime.workerHeartbeatAt ??
              canonicalDestination.updatedAt,
          },
      destinations: [canonicalDestination, ...mirrors],
    };
  };

  const captureBettingFrame = (
    forceNewFrame = false,
  ): BettingFeedFrame | null => {
    const scheduler = getScheduler();
    const cycle = scheduler?.getCurrentCycle() ?? null;
    const nextSeq = bettingSequence + 1;
    const emittedAt = Date.now();
    const rendererHealth = currentRendererHealthSnapshot(cycle, emittedAt);
    const sourceRuntime = currentSourceRuntimeSnapshot(
      cycle,
      emittedAt,
      rendererHealth,
    );
    const channel = currentChannelSnapshot(cycle, emittedAt, sourceRuntime);
    const payload = buildBettingFeedPayload({
      sourceEpoch: bettingSourceEpoch,
      seq: nextSeq,
      emittedAt,
      cycle,
      rendererHealth,
      channel,
      sourceRuntime,
      rendererMetrics: currentRendererMetricsSnapshot(),
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

    const token = extractBettingFeedToken({
      authorizationHeader: request.headers.authorization,
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
    const fallbackRendererHealth = currentRendererHealthSnapshot(
      null,
      fallbackEmittedAt,
    );
    const fallbackSourceRuntime = currentSourceRuntimeSnapshot(
      null,
      fallbackEmittedAt,
      fallbackRendererHealth,
    );
    const fallbackPayload = buildBettingFeedPayload({
      sourceEpoch: bettingSourceEpoch,
      seq: bettingSequence,
      emittedAt: fallbackEmittedAt,
      cycle: null,
      rendererHealth: fallbackRendererHealth,
      channel: currentChannelSnapshot(null, fallbackEmittedAt, fallbackSourceRuntime),
      sourceRuntime: fallbackSourceRuntime,
      rendererMetrics: currentRendererMetricsSnapshot(),
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
  ): Promise<FastifyReply | void> => {
    if (!(await assertBettingAuth(request, reply))) {
      return reply;
    }
  };

  const bettingEventsAuthPreHandler = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<FastifyReply | void> => {
    if (!(await assertBettingAuth(request, reply))) {
      return reply;
    }
  };

  const handleBettingBootstrap = async (
    _request: FastifyRequest,
    reply: FastifyReply,
  ) => {
    if (reply.sent) {
      return reply;
    }

    const scheduler = getScheduler();
    if (!scheduler) {
      return reply.status(503).send({
        error: "Streaming mode not active",
        message: "The streaming duel scheduler is not running",
      });
    }

    await ensureBettingSourceEpoch();
    await externalStatusPoller?.refresh();
    await externalPlaybackProbePoller?.refresh();
    const latestFrame =
      captureBettingFrame(false) ??
      bettingReplayFrames[bettingReplayFrames.length - 1] ??
      captureBettingFrame(true);

    return reply.send(buildBettingBootstrapResponse(latestFrame ?? null));
  };

  const handleBettingEvents = async (
    request: FastifyRequest<{ Querystring: { since?: string } }>,
    reply: FastifyReply,
  ) => {
    if (reply.sent) {
      return reply;
    }

    const scheduler = getScheduler();
    if (!scheduler) {
      return reply.status(503).send({
        error: "Streaming mode not active",
        message: "The streaming duel scheduler is not running",
      });
    }

    await ensureBettingSourceEpoch();
    await externalStatusPoller?.refresh();
    await externalPlaybackProbePoller?.refresh();
    captureBettingFrame(false);
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

    const allocation = allocateNextBettingClientId(
      nextBettingClientId,
      bettingClients.keys(),
    );
    nextBettingClientId = allocation.nextCursor;
    const clientId = allocation.clientId;
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
  fastify.get(
    "/api/streaming/betting/bootstrap",
    {
      config: { rateLimit: bootstrapRateLimit },
      preHandler: bettingBootstrapAuthPreHandler,
    },
    handleBettingBootstrap,
  );

  // Canonical internal betting bootstrap route.
  fastify.get(
    "/api/internal/bet-sync/state",
    {
      config: { rateLimit: bootstrapRateLimit },
      preHandler: bettingBootstrapAuthPreHandler,
    },
    handleBettingBootstrap,
  );

  // Legacy compatibility alias. Canonical internal betting SSE route:
  // /api/internal/bet-sync/events
  fastify.get<{
    Querystring: { since?: string };
  }>(
    "/api/streaming/betting/events",
    {
      config: { rateLimit: eventsRateLimit },
      preHandler: bettingEventsAuthPreHandler,
    },
    handleBettingEvents,
  );

  // Canonical internal betting SSE route.
  fastify.get<{
    Querystring: { since?: string };
  }>(
    "/api/internal/bet-sync/events",
    {
      config: { rateLimit: eventsRateLimit },
      preHandler: bettingEventsAuthPreHandler,
    },
    handleBettingEvents,
  );

  fastify.addHook("onClose", async () => {
    closeRoutes();
  });

  return {
    close(): void {
      closeRoutes();
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

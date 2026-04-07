import fs from "node:fs/promises";
import type { StreamDeliveryInfo } from "../streaming/delivery-config.js";

/** A single RTMP destination entry from the external status file. */
export interface ExternalRtmpDestination {
  url?: string;
  status?: string;
  connected?: boolean;
  /** External encoders may include additional fields. */
  [key: string]: unknown;
}

/** Aggregate stream statistics from the external RTMP encoder. */
export interface ExternalRtmpStreamStats {
  bitrate?: number;
  fps?: number;
  uptime?: number;
  bytesReceived?: number;
  droppedFrames?: number;
  healthy?: boolean;
  /** External encoders may include additional fields. */
  [key: string]: unknown;
}

/** Renderer health blob written by the capture pipeline. */
export interface ExternalRendererHealthBlob {
  ready?: boolean;
  degradedReason?: string | null;
  updatedAt?: number | null;
  phase?: string | null;
}

export interface ExternalRendererMetricsBlob {
  captureFps?: number | null;
  encodeFps?: number | null;
  droppedFrames?: number | null;
  renderTick?: number | null;
  duelStateTick?: number | null;
  latestFrameAt?: number | null;
  latestRenderTickAt?: number | null;
  latestDuelStateTickAt?: number | null;
  latestVisualChangeAt?: number | null;
  visualChangeAgeMs?: number | null;
}

export interface ExternalHlsManifestBlob {
  updatedAt?: number | null;
  mediaSequence?: number | null;
}

/**
 * Typed snapshot from the external RTMP status file. Only allowlisted fields
 * are preserved after parsing — unknown keys in the source JSON are stripped
 * to prevent arbitrary data from being forwarded to API consumers.
 */
export interface ExternalRtmpStatusSnapshot {
  destinations: ExternalRtmpDestination[];
  stats: ExternalRtmpStreamStats;
  updatedAt: number;
  rendererHealth?: ExternalRendererHealthBlob;
  metrics?: ExternalRendererMetricsBlob;
  hlsManifest?: ExternalHlsManifestBlob;
  delivery?: StreamDeliveryInfo;
}

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

/**
 * Parse and validate the external RTMP status JSON, stripping unknown keys.
 *
 * Only `destinations`, `stats`, `updatedAt`, `rendererHealth`, `metrics`,
 * `hlsManifest`, and `delivery` are
 * forwarded. Any extra keys in the source file are silently dropped so
 * tampered files cannot inject arbitrary data into API responses.
 */
export function parseExternalRtmpStatusSnapshot(
  raw: string,
  externalStatusMaxAgeMs: number,
  options?: { allowStale?: boolean },
): ExternalRtmpStatusSnapshot | null {
  try {
    const normalized = raw.trim();
    if (!normalized) return null;
    const parsed = JSON.parse(normalized) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return null;
    if (!Array.isArray(parsed.destinations)) return null;
    if (typeof parsed.stats !== "object" || parsed.stats == null) return null;

    const updatedAt = asFiniteNumber(Number(parsed.updatedAt || 0)) ?? 0;
    if (
      !options?.allowStale &&
      updatedAt > 0 &&
      Date.now() - updatedAt > externalStatusMaxAgeMs
    ) {
      return null;
    }

    // Allowlist: only forward known fields.
    const snapshot: ExternalRtmpStatusSnapshot = {
      destinations: parsed.destinations as ExternalRtmpDestination[],
      stats: parsed.stats as ExternalRtmpStreamStats,
      updatedAt,
    };

    if (parsed.rendererHealth && typeof parsed.rendererHealth === "object") {
      snapshot.rendererHealth =
        parsed.rendererHealth as ExternalRendererHealthBlob;
    }
    if (parsed.metrics && typeof parsed.metrics === "object") {
      snapshot.metrics = parsed.metrics as ExternalRendererMetricsBlob;
    }
    if (parsed.hlsManifest && typeof parsed.hlsManifest === "object") {
      snapshot.hlsManifest = parsed.hlsManifest as ExternalHlsManifestBlob;
    }
    if (parsed.delivery && typeof parsed.delivery === "object") {
      snapshot.delivery = parsed.delivery as StreamDeliveryInfo;
    }

    return snapshot;
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
  } catch (error) {
    console.warn(
      `[ExternalRtmpStatus] Failed to read status file "${externalStatusFile}":`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
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

export function acquireExternalStatusPoller(
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

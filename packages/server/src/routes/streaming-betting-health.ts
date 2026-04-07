import type { StreamingGuardrailPhase } from "@hyperscape/shared";
import {
  deriveStreamingGuardrailReason,
  isActiveStreamingGuardrailPhase,
} from "@hyperscape/shared";
import type { StreamingDuelCycle } from "../systems/StreamingDuelScheduler/types.js";
import { getStreamCapture } from "../streaming/stream-capture.js";
import type { BettingFeedRendererHealth } from "./streaming-betting-feed.js";
import type {
  ExternalHlsManifestBlob,
  ExternalRendererMetricsBlob,
  ExternalRtmpStatusSnapshot,
} from "./streaming-external-status.js";

const RENDER_TICK_STALE_MS = 3_000;
const VISUAL_CHANGE_STALE_MS = 1_000;
const MIN_CAPTURE_FPS = 24;
const MIN_ENCODE_FPS = 24;

type NormalizedRendererMetrics = {
  captureFps: number | null;
  encodeFps: number | null;
  latestRenderTickAt: number | null;
  latestVisualChangeAt: number | null;
  visualChangeAgeMs: number | null;
};

type NormalizedHlsManifest = {
  updatedAt: number | null;
  mediaSequence: number | null;
};

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

function normalizeRendererMetrics(
  value: ExternalRendererMetricsBlob | undefined,
): NormalizedRendererMetrics | null {
  if (!value || typeof value !== "object") return null;
  return {
    captureFps: asFiniteNumber(value.captureFps),
    encodeFps: asFiniteNumber(value.encodeFps),
    latestRenderTickAt: asFiniteNumber(value.latestRenderTickAt),
    latestVisualChangeAt: asFiniteNumber(value.latestVisualChangeAt),
    visualChangeAgeMs: asFiniteNumber(value.visualChangeAgeMs),
  };
}

function normalizeHlsManifest(
  value: ExternalHlsManifestBlob | undefined,
): NormalizedHlsManifest | null {
  if (!value || typeof value !== "object") return null;
  return {
    updatedAt: asFiniteNumber(value.updatedAt),
    mediaSequence: asFiniteNumber(value.mediaSequence),
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

function phaseNeedsLiveRender(cycle: StreamingDuelCycle | null): boolean {
  return cycle?.phase != null && cycle.phase !== "IDLE";
}

function phaseNeedsVisualChange(cycle: StreamingDuelCycle | null): boolean {
  return cycle?.phase === "FIGHTING" || cycle?.phase === "RESOLUTION";
}

function deriveMetricsDegradedReason(params: {
  cycle: StreamingDuelCycle | null;
  metrics: NormalizedRendererMetrics | null;
  hlsManifest: NormalizedHlsManifest | null;
  nowMs: number;
  externalStatusMaxAgeMs: number;
}): string | null {
  const { cycle, metrics, hlsManifest, nowMs, externalStatusMaxAgeMs } = params;
  if (!phaseNeedsLiveRender(cycle)) {
    return null;
  }
  if (!metrics && !hlsManifest) {
    return null;
  }

  const renderTickAgeMs =
    metrics?.latestRenderTickAt != null
      ? Math.max(0, nowMs - metrics.latestRenderTickAt)
      : null;
  if (renderTickAgeMs == null || renderTickAgeMs > RENDER_TICK_STALE_MS) {
    return "render_tick_stale";
  }

  const manifestAgeMs =
    hlsManifest?.updatedAt != null
      ? Math.max(0, nowMs - hlsManifest.updatedAt)
      : null;
  if (
    manifestAgeMs == null ||
    manifestAgeMs > externalStatusMaxAgeMs ||
    hlsManifest?.mediaSequence == null
  ) {
    return "manifest_stale";
  }

  if (!phaseNeedsVisualChange(cycle)) {
    return null;
  }

  if (
    metrics?.visualChangeAgeMs == null ||
    metrics.visualChangeAgeMs > VISUAL_CHANGE_STALE_MS
  ) {
    return "visual_change_stale";
  }
  if (metrics.captureFps != null && metrics.captureFps < MIN_CAPTURE_FPS) {
    return "capture_fps_low";
  }
  if (metrics.encodeFps != null && metrics.encodeFps < MIN_ENCODE_FPS) {
    return "encoder_fps_low";
  }

  return null;
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
  const externalStatusMaxAgeMs = options?.externalStatusMaxAgeMs ?? 15_000;
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
  const externalRendererMetrics = normalizeRendererMetrics(
    externalSnapshot?.metrics,
  );
  const externalHlsManifest = normalizeHlsManifest(
    externalSnapshot?.hlsManifest,
  );
  const metricsReason = deriveMetricsDegradedReason({
    cycle,
    metrics: externalRendererMetrics,
    hlsManifest: externalHlsManifest,
    nowMs: updatedAt,
    externalStatusMaxAgeMs,
  });

  if (externalRendererHealth) {
    const ageMs =
      externalRendererHealth.updatedAt != null
        ? Math.max(0, updatedAt - externalRendererHealth.updatedAt)
        : null;
    if (
      externalRendererHealth.updatedAt != null &&
      ageMs != null &&
      ageMs > externalStatusMaxAgeMs
    ) {
      return {
        ready: false,
        degradedReason: "renderer_health_stale",
        updatedAt,
      };
    }

    if (metricsReason) {
      return {
        ready: false,
        degradedReason: metricsReason,
        updatedAt,
      };
    }

    if (
      !externalRendererHealth.ready &&
      externalRendererHealth.degradedReason &&
      externalRendererHealth.degradedReason !== "renderer_health_stale"
    ) {
      return externalRendererHealth;
    }

    if (
      externalRendererHealth.ready ||
      !phaseNeedsVisualChange(cycle)
    ) {
      return externalRendererHealth;
    }

    if (externalRendererMetrics || externalHlsManifest) {
      return {
        ready: true,
        degradedReason: null,
        updatedAt:
          externalRendererHealth.updatedAt ??
          externalHlsManifest?.updatedAt ??
          updatedAt,
      };
    }
  } else if (metricsReason) {
    return {
      ready: false,
      degradedReason: metricsReason,
      updatedAt,
    };
  }

  const captureStats = options?.captureStats ?? getStreamCapture().getStats();
  if (
    isActiveStreamingGuardrailPhase(cycle?.phase as StreamingGuardrailPhase)
  ) {
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

#!/usr/bin/env bun
/**
 * Stream to RTMP — CDP Screencast Capture
 *
 * High-performance streaming pipeline that uses Chrome DevTools Protocol (CDP)
 * Page.startScreencast to capture frames directly from the Chromium compositor
 * and pipes them to FFmpeg for H.264 encoding.
 *
 * This is ~2-3x faster than the legacy MediaRecorder → WebSocket path because:
 * - No browser-side VP8/VP9 encoding (MediaRecorder eliminated)
 * - No WebSocket serialization/transfer overhead
 * - Single encode step: raw JPEG → H.264 (hardware accelerated on Mac)
 * - CDP captures from compositor regardless of headless/headful mode
 *
 * Architecture:
 *   Chromium Compositor → CDP screencastFrame → Node.js → FFmpeg stdin (JPEG pipe) → RTMP fanout
 *
 * Falls back to WebCodecs when CDP capture fails. MediaRecorder remains an
 * explicit operator/debug path when STREAM_CAPTURE_MODE=mediarecorder is set.
 *
 * Usage:
 *   bun run stream:rtmp
 *   bun run packages/server/scripts/stream-to-rtmp.ts
 *
 * Environment Variables:
 *   STREAM_CAPTURE_MODE      - 'cdp' (default), 'webcodecs', or 'mediarecorder' (debug)
 *   STREAM_CAPTURE_HEADLESS  - 'true' for headless (default: false for better GPU rendering)
 *   STREAM_CAPTURE_CHANNEL   - Browser channel ('chrome', 'msedge', etc.)
 *   STREAM_CAPTURE_ANGLE     - ANGLE backend (default: metal on macOS, vulkan elsewhere)
 *   CAPTURE_DISABLE_SANDBOX  - 'true' to launch Chromium with --no-sandbox
 *   STREAM_CDP_QUALITY       - JPEG quality for CDP screencast (1-100, default: 80)
 *   STREAM_FPS               - Target frames per second (default: 30)
 *   TWITCH_STREAM_KEY / TWITCH_RTMP_STREAM_KEY - Twitch stream key
 *   TWITCH_STREAM_URL / TWITCH_RTMP_URL / TWITCH_RTMP_SERVER - Twitch ingest URL
 *   YOUTUBE_STREAM_KEY / YOUTUBE_RTMP_STREAM_KEY - YouTube stream key
 *   YOUTUBE_STREAM_URL / YOUTUBE_RTMP_URL - YouTube ingest URL
 *   KICK_STREAM_KEY          - Kick stream key
 *   PUMPFUN_RTMP_URL         - Pump.fun RTMP URL
 *   X_RTMP_URL               - X/Twitter RTMP URL
 *   RTMP_DESTINATIONS_JSON   - JSON array fanout config
 *   STREAMING_VIEWER_ACCESS_TOKEN - Optional token appended as #streamToken for gated viewer WS bootstrap
 *   GAME_URL                 - URL to Hyperscape (default: http://localhost:3333/?page=stream)
 *   GAME_FALLBACK_URLS       - Comma-separated fallback URLs
 *   RTMP_BRIDGE_PORT         - WebSocket port for legacy bridge (default: 8765)
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { chromium, type Browser, type Page, type CDPSession } from "playwright";
import {
  getRTMPBridge,
  startRTMPBridge,
  generateCaptureScript,
  generateWebCodecsCaptureScript,
} from "../src/streaming/index.js";
import {
  resolveStreamDeliveryInfo,
  type StreamDeliveryInfo,
} from "../src/streaming/delivery-config.js";
import type {
  BrowserCaptureStatusSnapshot,
  StreamSourceCaptureMode,
  StreamSourceDegradedReason,
  StreamSourceRuntime,
} from "../src/streaming/source-runtime.js";
import { resolveBrowserCaptureLastFrameAt } from "../src/streaming/source-runtime.js";
import {
  resolveStreamIngestSettings,
  type StreamIngestSettings,
} from "../src/streaming/ingest-config.js";
import {
  readLocalHlsManifestSnapshot,
  resolveExternalStatusFile,
  type HlsManifestSnapshot,
} from "../src/streaming/stream-status-artifacts.js";
import {
  buildDefaultCaptureLaunchArgs,
  resolveAllowedCaptureOrigins,
  resolveUnexpectedCaptureOrigin,
  shouldAcceptCaptureReadiness,
  type CaptureRendererHealthSnapshot,
} from "../src/streaming/captureBrowserPolicy.js";
import { redactStreamingSecretsFromUrl } from "../src/streaming/redactStreamingUrl.js";
import { errMsg } from "../src/shared/errMsg.ts";
import { getStreamLeakDiagnostics } from "../src/streaming/stream-leak-diagnostics.js";

// Auto-enable leak diagnostics if STREAM_LEAK_DIAGNOSTICS=true.
// Installed before any timers are allocated so the counts are accurate.
getStreamLeakDiagnostics();

// ── Configuration ──────────────────────────────────────────────────────────

const GAME_URL = process.env.GAME_URL || "http://localhost:3333/?page=stream";
const GAME_FALLBACK_URLS = (
  process.env.GAME_FALLBACK_URLS ||
  "http://localhost:3333/?embedded=true&mode=spectator,http://localhost:3333/"
)
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const STREAMING_VIEWER_ACCESS_TOKEN = (
  process.env.STREAMING_VIEWER_ACCESS_TOKEN || ""
).trim();

function normalizeCaptureGameUrl(rawUrl: string): string {
  if ((process.env.STREAM_CAPTURE_MODE?.trim() || "cdp") !== "cdp") {
    return rawUrl;
  }

  try {
    const url = new URL(rawUrl);
    // CDP capture reads frames directly from the compositor and does not
    // expose the legacy in-page WebSocket bridge. Leaving these params on the
    // stream URL makes the page repeatedly dial a bridge that will never exist.
    url.searchParams.delete("internalCapture");
    url.searchParams.delete("bridgeUrl");
    // Preserve an explicit source-capture hint so the stream entrypoint can
    // purge service workers/caches on Pages without re-enabling bridge capture.
    url.searchParams.set("streamCapture", "1");
    return url.toString();
  } catch {
    return rawUrl;
  }
}

function withViewerAccessToken(rawUrl: string): string {
  if (!STREAMING_VIEWER_ACCESS_TOKEN) return rawUrl;
  try {
    const url = new URL(rawUrl);
    const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
    hashParams.set("streamToken", STREAMING_VIEWER_ACCESS_TOKEN);
    url.hash = hashParams.toString();
    return url.toString();
  } catch {
    const separator = rawUrl.includes("#") ? "&" : "#";
    return `${rawUrl}${separator}streamToken=${encodeURIComponent(STREAMING_VIEWER_ACCESS_TOKEN)}`;
  }
}

const GAME_URL_CANDIDATES = Array.from(
  new Set(
    [GAME_URL, ...GAME_FALLBACK_URLS]
      .map(withViewerAccessToken)
      .map(normalizeCaptureGameUrl),
  ),
);
const ALLOWED_CAPTURE_ORIGINS =
  resolveAllowedCaptureOrigins(GAME_URL_CANDIDATES);

const BRIDGE_PORT = parseInt(process.env.RTMP_BRIDGE_PORT || "8765", 10);
const BRIDGE_URL = `ws://localhost:${BRIDGE_PORT}`;
const SPECTATOR_PORT = parseInt(process.env.SPECTATOR_PORT || "4180", 10);
const EXTERNAL_STATUS_FILE = resolveExternalStatusFile(process.env);
let externalStatusWriteErrored = false;

/**
 * Capture mode: 'cdp' is the production default, 'webcodecs' is the automatic
 * fallback, and 'mediarecorder' remains an explicit operator/debug mode.
 */
const CAPTURE_MODE = (process.env.STREAM_CAPTURE_MODE?.trim() || "cdp") as
  | "cdp"
  | "mediarecorder"
  | "webcodecs";
const STREAM_CAPTURE_HEADLESS = process.env.STREAM_CAPTURE_HEADLESS === "true";
const requestedCaptureChannel =
  process.env.STREAM_CAPTURE_CHANNEL?.trim() || "";
const STREAM_CAPTURE_CHANNEL =
  process.platform === "darwin" && requestedCaptureChannel === "chromium"
    ? "chrome"
    : requestedCaptureChannel;
const ANGLE_BACKEND =
  process.env.STREAM_CAPTURE_ANGLE?.trim() ||
  (process.platform === "darwin" ? "metal" : "vulkan");
const CAPTURE_DISABLE_SANDBOX = /^(1|true|yes|on)$/i.test(
  process.env.CAPTURE_DISABLE_SANDBOX || "",
);
const STREAM_CAPTURE_DISABLE_WEBGPU = /^(1|true|yes|on)$/i.test(
  process.env.STREAM_CAPTURE_DISABLE_WEBGPU || "",
);
if (STREAM_CAPTURE_DISABLE_WEBGPU) {
  throw new Error(
    "STREAM_CAPTURE_DISABLE_WEBGPU is not supported. Hyperscape capture is WebGPU-only.",
  );
}
const CDP_QUALITY = Math.min(
  100,
  Math.max(1, parseInt(process.env.STREAM_CDP_QUALITY || "80", 10)),
);
const TARGET_FPS = parseInt(process.env.STREAM_FPS || "30", 10);
const STREAM_CAPTURE_WARMUP_MS = Math.max(
  250,
  Number.parseInt(process.env.STREAM_CAPTURE_WARMUP_MS || "1000", 10) || 1000,
);
const REQUIRE_IN_PAGE_READY_PROBE =
  process.env.STREAM_CAPTURE_REQUIRE_READY_PROBE === "true";
const USE_TIMED_STREAM_WARMUP =
  !REQUIRE_IN_PAGE_READY_PROBE &&
  process.platform === "linux" &&
  !STREAM_CAPTURE_HEADLESS;
const STREAM_CAPTURE_POST_NAV_DELAY_MS = Math.max(
  0,
  Number.parseInt(
    process.env.STREAM_CAPTURE_POST_NAV_DELAY_MS ||
      (USE_TIMED_STREAM_WARMUP ? "250" : "5000"),
    10,
  ) || 0,
);

function parseEvenDimension(
  rawValue: string | undefined,
  fallback: number,
): number {
  const parsed = Number.parseInt(rawValue || "", 10);
  const candidate = Number.isFinite(parsed) ? parsed : fallback;
  const clamped = Math.max(2, candidate);
  return clamped % 2 === 0 ? clamped : clamped - 1;
}

// Viewport settings (default 720p for stream stability)
const VIEWPORT = {
  width: parseEvenDimension(process.env.STREAM_CAPTURE_WIDTH, 1280),
  height: parseEvenDimension(process.env.STREAM_CAPTURE_HEIGHT, 720),
};

let browser: Browser | null = null;
let page: Page | null = null;
let cdpSession: CDPSession | null = null;
let selectedGameUrl: string | null = null;
let latestSceneUrl: string | null = null;
let latestActiveBundle: string | null = null;
let launchTime = Date.now();
const BROWSER_RESTART_INTERVAL_MS = 1 * 60 * 60 * 1000; // 1 Hour
const CAPTURE_RECOVERY_TIMEOUT_MS = Math.max(
  10_000,
  Number.parseInt(
    process.env.STREAM_CAPTURE_RECOVERY_TIMEOUT_MS || "30000",
    10,
  ) || 30_000,
);
const CAPTURE_RECOVERY_MAX_FAILURES = Math.max(
  1,
  Number.parseInt(
    process.env.STREAM_CAPTURE_RECOVERY_MAX_FAILURES || "2",
    10,
  ) || 2,
);
const CDP_STARTUP_TIMEOUT_MS = Math.max(
  5_000,
  Number.parseInt(
    process.env.STREAM_CAPTURE_START_TIMEOUT_MS || "15_000",
    10,
  ) || 15_000,
);
const SOURCE_CAPTURE_STALL_MS = Math.max(
  5_000,
  Number.parseInt(process.env.STREAM_SOURCE_CAPTURE_STALL_MS || "10_000", 10) ||
    10_000,
);
const SOURCE_VISUAL_CHANGE_STALE_MS = Math.max(
  5_000,
  Number.parseInt(
    process.env.STREAM_SOURCE_VISUAL_CHANGE_STALE_MS || "10_000",
    10,
  ) || 10_000,
);
const SOURCE_DEGRADED_RESTART_POLLS = Math.max(
  2,
  Number.parseInt(
    process.env.STREAM_SOURCE_DEGRADED_RESTART_POLLS || "6",
    10,
  ) || 6,
);
const FATAL_WRITE_PAGE_STALL_THRESHOLD_MS = Math.max(
  2_000,
  Math.min(5_000, Math.floor(SOURCE_CAPTURE_STALL_MS / 2)),
);

// ── CDP Frame Rate Tracking ────────────────────────────────────────────────

let cdpFrameCount = 0;
let cdpFps = 0;
let cdpFpsIntervalId: ReturnType<typeof setInterval> | null = null;
let cdpDroppedFrames = 0;
let lastCaptureFrameAt: number | null = null;
let latestRenderTickAt: number | null = null;
let latestDuelStateTickAt: number | null = null;
let latestVisualChangeAt: number | null = null;
let lastVisualSampleHash: string | null = null;
let lastObservedRenderTick = 0;
let lastObservedDuelStateTick = 0;

function startFpsTracking() {
  if (cdpFpsIntervalId) clearInterval(cdpFpsIntervalId);
  cdpFrameCount = 0;
  cdpFps = 0;
  cdpFpsIntervalId = setInterval(() => {
    cdpFps = cdpFrameCount;
    cdpFrameCount = 0;
  }, 1000);
}

function stopFpsTracking() {
  if (cdpFpsIntervalId) {
    clearInterval(cdpFpsIntervalId);
    cdpFpsIntervalId = null;
  }
}

type ActiveCaptureMode = Exclude<StreamSourceCaptureMode, "none">;

type RendererHeartbeatSnapshot = {
  renderTick: number;
  latestRenderTickAt: number | null;
  duelStateTick: number;
  latestDuelStateTickAt: number | null;
};

type RendererMetricsSnapshot = {
  captureFps: number | null;
  encodeFps: number | null;
  droppedFrames: number;
  renderTick: number;
  duelStateTick: number;
  latestFrameAt: number | null;
  latestRenderTickAt: number | null;
  latestDuelStateTickAt: number | null;
  latestVisualChangeAt: number | null;
  visualChangeAgeMs: number | null;
};

type CaptureDiagnosticsFrameSnapshot = {
  at: number;
  size: number;
  cdpTimestamp: number | null;
};

type CaptureDiagnosticsBackpressureSnapshot = {
  at: number;
  backpressured: boolean;
};

type CaptureDiagnosticsFatalWriteSnapshot = {
  at: number;
  message: string;
  frameCount: number;
  droppedFrames: number;
  bytesReceived: number;
  backpressured: boolean;
  cdpDirectMode: boolean;
  uptimeMs: number;
};

type CaptureDiagnosticsSnapshot = {
  recentFrames: CaptureDiagnosticsFrameSnapshot[];
  recentFrameCadenceMs: number[];
  nonMonotonicCdpTimestampCount: number;
  backpressureTransitions: CaptureDiagnosticsBackpressureSnapshot[];
  firstFatalWriteError: CaptureDiagnosticsFatalWriteSnapshot | null;
  lastFatalWriteError: CaptureDiagnosticsFatalWriteSnapshot | null;
  pageStallBeforeLastFatalWrite: boolean | null;
  lastFrameAgeMs: number | null;
  captureSessionGeneration: string | null;
  browserCapture: {
    recording: boolean | null;
    wsConnected: boolean | null;
    chunkCount: number | null;
    bytesSent: number | null;
    lastChunkAt: number | null;
    lastChunkAgeMs: number | null;
    lastChunkMs: number | null;
  };
};

type RendererSmokeSnapshot = {
  currentSceneUrl: string | null;
  activeBundle: string | null;
  deliveryMode: StreamDeliveryInfo["mode"];
  captureFpsP50: number | null;
  captureFpsP95: number | null;
  encodeFpsP50: number | null;
  encodeFpsP95: number | null;
  updatedAt: number;
  ingest: RendererIngestSnapshot;
};

type RendererIngestSnapshot = {
  profile: StreamIngestSettings["profile"];
  transport: StreamIngestSettings["transport"];
  audioSampleRate: number;
  gopFrames: number;
  probeOnly: boolean;
};

type RendererHealthSnapshot = CaptureRendererHealthSnapshot & {
  updatedAt: number | null;
  phase: string | null;
};

type RendererCanvasRectSnapshot = {
  x: number;
  y: number;
  width: number;
  height: number;
} | null;

let latestRendererHealth: RendererHealthSnapshot = {
  ready: false,
  degradedReason: "capture_not_initialized",
  updatedAt: null,
  phase: null,
  diagnostics: null,
};
let rendererHealthProbeInFlight: Promise<RendererHealthSnapshot> | null = null;
let browserCaptureStatusProbeInFlight: Promise<BrowserCaptureStatus | null> | null =
  null;
let captureNavigationAbortInFlight = false;
let latestBrowserCaptureStatus: BrowserCaptureStatus | null = null;
let sourceRecoveryCount = 0;
let sourceLastRecoveryAt: number | null = null;
const FPS_SAMPLE_RETENTION_MS = 60_000;
const captureFpsSamples: Array<{ at: number; value: number }> = [];
const encodeFpsSamples: Array<{ at: number; value: number }> = [];

function pruneFpsSamples(nowMs: number): void {
  while (
    captureFpsSamples.length > 0 &&
    nowMs - captureFpsSamples[0]!.at > FPS_SAMPLE_RETENTION_MS
  ) {
    captureFpsSamples.shift();
  }
  while (
    encodeFpsSamples.length > 0 &&
    nowMs - encodeFpsSamples[0]!.at > FPS_SAMPLE_RETENTION_MS
  ) {
    encodeFpsSamples.shift();
  }
}

function recordFpsSample(
  samples: Array<{ at: number; value: number }>,
  value: number | null,
  nowMs: number,
): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return;
  }
  samples.push({ at: nowMs, value });
}

function percentileFromSamples(
  samples: ReadonlyArray<{ at: number; value: number }>,
  percentile: number,
): number | null {
  if (samples.length === 0) return null;
  const sorted = samples.map((sample) => sample.value).sort((a, b) => a - b);
  const clampedPercentile = Math.max(0, Math.min(1, percentile));
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.round((sorted.length - 1) * clampedPercentile)),
  );
  const value = sorted[index];
  return Number.isFinite(value) ? Number(value.toFixed(2)) : null;
}

function buildRendererMetricsSnapshot(
  bridge: ReturnType<typeof getRTMPBridge>,
  captureMode: ActiveCaptureMode,
): RendererMetricsSnapshot {
  const stats = bridge.getStats();
  const nowMs = Date.now();
  const captureFps = captureMode === "cdp" ? cdpFps : null;
  const encodeFps =
    typeof stats.encoderFps === "number" && Number.isFinite(stats.encoderFps)
      ? stats.encoderFps
      : null;
  recordFpsSample(captureFpsSamples, captureFps, nowMs);
  recordFpsSample(encodeFpsSamples, encodeFps, nowMs);
  pruneFpsSamples(nowMs);

  return {
    captureFps,
    encodeFps,
    droppedFrames: Math.max(stats.droppedFrames, cdpDroppedFrames),
    renderTick: lastObservedRenderTick,
    duelStateTick: lastObservedDuelStateTick,
    latestFrameAt: lastCaptureFrameAt,
    latestRenderTickAt,
    latestDuelStateTickAt,
    latestVisualChangeAt,
    visualChangeAgeMs:
      latestVisualChangeAt != null
        ? Math.max(0, Date.now() - latestVisualChangeAt)
        : null,
  };
}

function buildCaptureDiagnosticsSnapshot(
  bridge: ReturnType<typeof getRTMPBridge>,
): CaptureDiagnosticsSnapshot {
  const diagnostics = bridge.getCaptureDiagnostics();
  const lastFatalWriteError = diagnostics.lastFatalWriteError
    ? { ...diagnostics.lastFatalWriteError }
    : null;
  const latestFrameAt =
    typeof lastCaptureFrameAt === "number" &&
    Number.isFinite(lastCaptureFrameAt)
      ? lastCaptureFrameAt
      : null;

  return {
    recentFrames: diagnostics.recentFrames.map((sample) => ({
      at: sample.at,
      size: sample.size,
      cdpTimestamp: sample.cdpTimestamp,
    })),
    recentFrameCadenceMs: [...diagnostics.recentFrameCadenceMs],
    nonMonotonicCdpTimestampCount: diagnostics.nonMonotonicCdpTimestampCount,
    backpressureTransitions: diagnostics.backpressureTransitions.map(
      (transition) => ({
        at: transition.at,
        backpressured: transition.backpressured,
      }),
    ),
    firstFatalWriteError: diagnostics.firstFatalWriteError
      ? { ...diagnostics.firstFatalWriteError }
      : null,
    lastFatalWriteError,
    pageStallBeforeLastFatalWrite:
      lastFatalWriteError == null
        ? null
        : latestFrameAt == null
          ? true
          : lastFatalWriteError.at - latestFrameAt >=
            FATAL_WRITE_PAGE_STALL_THRESHOLD_MS,
    lastFrameAgeMs:
      latestFrameAt == null ? null : Math.max(0, Date.now() - latestFrameAt),
    captureSessionGeneration:
      latestBrowserCaptureStatus?.captureSessionGeneration ?? null,
    browserCapture: {
      recording:
        typeof latestBrowserCaptureStatus?.recording === "boolean"
          ? latestBrowserCaptureStatus.recording
          : null,
      wsConnected:
        typeof latestBrowserCaptureStatus?.wsConnected === "boolean"
          ? latestBrowserCaptureStatus.wsConnected
          : null,
      chunkCount:
        typeof latestBrowserCaptureStatus?.chunkCount === "number" &&
        Number.isFinite(latestBrowserCaptureStatus.chunkCount)
          ? latestBrowserCaptureStatus.chunkCount
          : null,
      bytesSent:
        typeof latestBrowserCaptureStatus?.bytesSent === "number" &&
        Number.isFinite(latestBrowserCaptureStatus.bytesSent)
          ? latestBrowserCaptureStatus.bytesSent
          : null,
      lastChunkAt:
        typeof latestBrowserCaptureStatus?.lastChunkAt === "number" &&
        Number.isFinite(latestBrowserCaptureStatus.lastChunkAt)
          ? latestBrowserCaptureStatus.lastChunkAt
          : null,
      lastChunkAgeMs:
        typeof latestBrowserCaptureStatus?.lastChunkAgeMs === "number" &&
        Number.isFinite(latestBrowserCaptureStatus.lastChunkAgeMs)
          ? latestBrowserCaptureStatus.lastChunkAgeMs
          : null,
      lastChunkMs:
        typeof latestBrowserCaptureStatus?.lastChunkMs === "number" &&
        Number.isFinite(latestBrowserCaptureStatus.lastChunkMs)
          ? latestBrowserCaptureStatus.lastChunkMs
          : null,
    },
  };
}

function buildRendererSmokeSnapshot(
  delivery: StreamDeliveryInfo,
): RendererSmokeSnapshot {
  const nowMs = Date.now();
  const ingest = resolveStreamIngestSettings(process.env);
  pruneFpsSamples(nowMs);
  return {
    currentSceneUrl: resolveStatusSceneUrl(),
    activeBundle: latestActiveBundle,
    deliveryMode: delivery.mode,
    captureFpsP50: percentileFromSamples(captureFpsSamples, 0.5),
    captureFpsP95: percentileFromSamples(captureFpsSamples, 0.95),
    encodeFpsP50: percentileFromSamples(encodeFpsSamples, 0.5),
    encodeFpsP95: percentileFromSamples(encodeFpsSamples, 0.95),
    updatedAt: nowMs,
    ingest: {
      profile: ingest.profile,
      transport: ingest.transport,
      audioSampleRate: ingest.audioSampleRate,
      gopFrames: ingest.gopFrames,
      probeOnly: ingest.probeOnly,
    },
  };
}

function recordSourceRecovery(reason: string): void {
  sourceRecoveryCount += 1;
  sourceLastRecoveryAt = Date.now();
  console.log(`[Main] Source recovery recorded: ${reason}`);
}

function mapRendererReasonToSourceDegradedReason(
  degradedReason: string | null | undefined,
): StreamSourceDegradedReason | null {
  const normalized = (degradedReason ?? "").trim().toLowerCase();
  if (!normalized) return null;
  if (
    normalized === "capture_page_missing" ||
    normalized === "loading_overlay_active" ||
    normalized === "canvas_missing" ||
    normalized === "initialization_failed" ||
    normalized === "asset_origin_incomplete" ||
    normalized === "socket_disconnected" ||
    normalized === "stream_state_missing" ||
    normalized === "waiting_for_duel_data" ||
    normalized === "world_not_ready" ||
    normalized === "terrain_not_ready" ||
    normalized === "camera_target_unresolved" ||
    normalized === "avatar_not_ready" ||
    normalized === "initializing" ||
    normalized === "agents_missing" ||
    normalized === "invalid_agent_hp" ||
    normalized === "arena_positions_invalid" ||
    normalized.startsWith("probe_failed:")
  ) {
    return "page_not_ready";
  }
  if (
    normalized === "render_tick_stale" ||
    normalized === "visual_change_stale" ||
    normalized === "capture_fps_low"
  ) {
    return "capture_stalled";
  }
  return null;
}

function rendererPhaseNeedsVisualChange(
  phase: string | null | undefined,
): boolean {
  const normalized = (phase ?? "").trim().toUpperCase();
  return (
    normalized === "COUNTDOWN" ||
    normalized === "FIGHTING" ||
    normalized === "RESOLUTION"
  );
}

function sourceVisualChangeIsStale(nowMs: number): boolean {
  if (!rendererPhaseNeedsVisualChange(latestRendererHealth.phase)) {
    return false;
  }

  const latestVisualChangeAgeMs =
    latestVisualChangeAt == null
      ? null
      : Math.max(0, nowMs - latestVisualChangeAt);
  return (
    latestVisualChangeAgeMs == null ||
    latestVisualChangeAgeMs > SOURCE_VISUAL_CHANGE_STALE_MS
  );
}

function resolveStatusSceneUrl(): string | null {
  const sceneUrl = latestSceneUrl ?? selectedGameUrl;
  return sceneUrl ? redactStreamingSecretsFromUrl(sceneUrl) : null;
}

function hashVisualSample(buffer: Uint8Array): string {
  return createHash("sha256").update(buffer).digest("hex").slice(0, 16);
}

function resolveVisualSampleClip(
  canvasRect: RendererCanvasRectSnapshot | unknown,
  viewport: { width: number; height: number } | null,
): { x: number; y: number; width: number; height: number } | null {
  if (!viewport || !canvasRect || typeof canvasRect !== "object") {
    return null;
  }
  const rect = canvasRect as Partial<NonNullable<RendererCanvasRectSnapshot>>;
  const x = Number(rect.x);
  const y = Number(rect.y);
  const width = Number(rect.width);
  const height = Number(rect.height);
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width < 96 ||
    height < 96
  ) {
    return null;
  }

  const sampleX = Math.max(0, x + width * 0.15);
  const sampleY = Math.max(0, y + height * 0.2);
  const sampleWidth = Math.min(width * 0.7, viewport.width - sampleX);
  const sampleHeight = Math.min(height * 0.6, viewport.height - sampleY);
  if (sampleWidth < 64 || sampleHeight < 64) {
    return null;
  }
  return {
    x: sampleX,
    y: sampleY,
    width: sampleWidth,
    height: sampleHeight,
  };
}

function resolveSourceRuntimeSnapshot(
  bridge: ReturnType<typeof getRTMPBridge>,
  captureMode: ActiveCaptureMode,
): StreamSourceRuntime {
  const nowMs = Date.now();
  const bridgeStatus = bridge.getStatus();
  const ingest = resolveStreamIngestSettings(process.env);
  const hlsManifest = readLocalHlsManifestSnapshot(process.env);
  const browserCaptureLastFrameAt = resolveBrowserCaptureLastFrameAt(
    latestBrowserCaptureStatus as BrowserCaptureStatusSnapshot | null,
    nowMs,
  );
  const lastFrameAt =
    captureMode === "cdp" ? lastCaptureFrameAt : browserCaptureLastFrameAt;
  const rendererReason = mapRendererReasonToSourceDegradedReason(
    latestRendererHealth.degradedReason,
  );
  const visualChangeStale = sourceVisualChangeIsStale(nowMs);

  let degradedReason: StreamSourceDegradedReason | null = null;
  if (captureNavigationAbortInFlight) {
    degradedReason = "unexpected_navigation";
  } else if (!browser || !page || page.isClosed()) {
    degradedReason = "browser_missing";
  } else if (rendererReason) {
    degradedReason = rendererReason;
  } else if (visualChangeStale) {
    degradedReason = "capture_stalled";
  } else if (bridgeStatus.ffmpegRunning !== true) {
    degradedReason = "encoder_stalled";
  } else if (
    captureMode === "cdp" &&
    (lastCaptureFrameAt == null ||
      nowMs - lastCaptureFrameAt > SOURCE_CAPTURE_STALL_MS)
  ) {
    degradedReason = "capture_stalled";
  } else if (
    captureMode !== "cdp" &&
    !latestBrowserCaptureStatus?.captureSessionGeneration
  ) {
    degradedReason = "page_not_ready";
  } else if (
    captureMode !== "cdp" &&
    (bridgeStatus.clientConnected !== true ||
      latestBrowserCaptureStatus?.recording !== true ||
      latestBrowserCaptureStatus?.wsConnected !== true ||
      lastFrameAt == null ||
      nowMs - lastFrameAt > SOURCE_CAPTURE_STALL_MS)
  ) {
    degradedReason = "capture_stalled";
  } else if (
    !ingest.probeOnly &&
    typeof hlsManifest?.updatedAt === "number" &&
    Number.isFinite(hlsManifest.updatedAt) &&
    nowMs - hlsManifest.updatedAt > SOURCE_CAPTURE_STALL_MS
  ) {
    degradedReason = "manifest_stale";
  }

  return {
    ready: degradedReason == null,
    statusSource: "external_worker",
    captureMode,
    degradedReason,
    currentSceneUrl: resolveStatusSceneUrl(),
    activeBundle: latestActiveBundle,
    lastFrameAt,
    lastRenderTickAt: latestRenderTickAt,
    lastVisualChangeAt: latestVisualChangeAt,
    lastRecoveryAt: sourceLastRecoveryAt,
    recoveryCount: sourceRecoveryCount,
    workerHeartbeatAt: nowMs,
  };
}

function writeExternalStatusSnapshot(
  bridge: ReturnType<typeof getRTMPBridge>,
  captureMode: ActiveCaptureMode,
): StreamSourceRuntime | null {
  const sourceRuntime = resolveSourceRuntimeSnapshot(bridge, captureMode);
  if (!EXTERNAL_STATUS_FILE) return sourceRuntime;

  const bridgeStatus = bridge.getStatus();
  const stats = bridge.getStats();
  const processMemory = process.memoryUsage();
  const delivery: StreamDeliveryInfo = resolveStreamDeliveryInfo(process.env);
  const ingest = resolveStreamIngestSettings(process.env);
  const hlsManifest = readLocalHlsManifestSnapshot(process.env);
  const metrics = buildRendererMetricsSnapshot(bridge, captureMode);
  const captureDiagnostics = buildCaptureDiagnosticsSnapshot(bridge);
  const smoke = buildRendererSmokeSnapshot(delivery);
  const payload = {
    ...bridgeStatus,
    stats: {
      bytesReceived: stats.bytesReceived,
      bytesReceivedMB: (stats.bytesReceived / 1024 / 1024).toFixed(2),
      uptimeSeconds: Math.floor(stats.uptime / 1000),
      destinations: stats.destinations,
      healthy: stats.healthy,
      droppedFrames: stats.droppedFrames,
      encoderFps: stats.encoderFps,
      backpressured: stats.backpressured,
      spectators: stats.spectators,
      processMemory: stats.processMemory,
    },
    captureMode,
    metrics,
    hlsManifest,
    delivery,
    ingest: {
      profile: ingest.profile,
      transport: ingest.transport,
      audioSampleRate: ingest.audioSampleRate,
      gopFrames: ingest.gopFrames,
      probeOnly: ingest.probeOnly,
    },
    smoke,
    sourceRuntime,
    captureDiagnostics,
    processRssBytes: processMemory.rss,
    rendererHealth: latestRendererHealth,
    updatedAt: Date.now(),
    source: "external-rtmp-bridge",
  };

  try {
    fs.mkdirSync(path.dirname(EXTERNAL_STATUS_FILE), { recursive: true });
    fs.writeFileSync(EXTERNAL_STATUS_FILE, JSON.stringify(payload));
    externalStatusWriteErrored = false;
  } catch (err) {
    if (!externalStatusWriteErrored) {
      externalStatusWriteErrored = true;
      console.warn(
        `[Main] Failed to write RTMP status file (${EXTERNAL_STATUS_FILE}):`,
        err,
      );
    }
  }
  return sourceRuntime;
}

function clearExternalStatusSnapshot(): void {
  if (!EXTERNAL_STATUS_FILE) return;
  try {
    fs.unlinkSync(EXTERNAL_STATUS_FILE);
  } catch {
    // Ignore stale/missing status file cleanup errors.
  }
}

// ── Utilities ──────────────────────────────────────────────────────────────

function isTransientPageEvalError(err: unknown): boolean {
  const message = errMsg(err);
  return (
    message.includes("Execution context was destroyed") ||
    message.includes("Cannot find context with specified id") ||
    message.includes("Most likely because of a navigation") ||
    message.includes("Target page, context or browser has been closed")
  );
}

function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    operation
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function hasConfiguredOutput(): boolean {
  const hasTwitchKey = Boolean(
    process.env.TWITCH_STREAM_KEY || process.env.TWITCH_RTMP_STREAM_KEY,
  );
  const hasYoutubeKey = Boolean(
    process.env.YOUTUBE_STREAM_KEY || process.env.YOUTUBE_RTMP_STREAM_KEY,
  );
  return Boolean(
    process.env.RTMP_MULTIPLEXER_URL ||
    hasTwitchKey ||
    hasYoutubeKey ||
    process.env.KICK_STREAM_KEY ||
    process.env.PUMPFUN_RTMP_URL ||
    process.env.X_RTMP_URL ||
    process.env.RTMP_DESTINATIONS_JSON,
  );
}

async function probeRendererHealth(
  pageRef: Page,
): Promise<RendererHealthSnapshot> {
  const probedAt = Date.now();
  const probe = await pageRef.evaluate(() => {
    // This shape mirrors StreamingWindowRendererHealth from the client bundle.
    // Playwright evaluate runs in the browser context, so runtime imports are
    // intentionally avoided here.
    const win = window as unknown as {
      __HYPERSCAPE_STREAM_READY__?: boolean;
      __HYPERSCAPE_STREAM_RENDERER_HEALTH__?: {
        ready?: boolean;
        degradedReason?: string | null;
        updatedAt?: number | null;
        phase?: string | null;
      } | null;
      __HYPERSCAPE_STREAM_HEARTBEAT__?: {
        renderTick?: number;
        latestRenderTickAt?: number | null;
        duelStateTick?: number;
        latestDuelStateTickAt?: number | null;
      } | null;
      __HYPERSCAPE_STREAM_BOOT_STATUS__?: string | null;
    };
    const activeBundle =
      Array.from(
        document.querySelectorAll<HTMLScriptElement>("script[src]"),
      ).find(
        (script) =>
          script.src.includes("StreamingMode-") ||
          script.src.includes("framework.client-"),
      )?.src ?? null;
    const explicitHealth =
      win.__HYPERSCAPE_STREAM_RENDERER_HEALTH__ &&
      typeof win.__HYPERSCAPE_STREAM_RENDERER_HEALTH__ === "object"
        ? {
            ready: win.__HYPERSCAPE_STREAM_RENDERER_HEALTH__.ready === true,
            degradedReason:
              typeof win.__HYPERSCAPE_STREAM_RENDERER_HEALTH__
                .degradedReason === "string"
                ? win.__HYPERSCAPE_STREAM_RENDERER_HEALTH__.degradedReason
                : null,
            updatedAt:
              typeof win.__HYPERSCAPE_STREAM_RENDERER_HEALTH__.updatedAt ===
                "number" &&
              Number.isFinite(
                win.__HYPERSCAPE_STREAM_RENDERER_HEALTH__.updatedAt,
              )
                ? win.__HYPERSCAPE_STREAM_RENDERER_HEALTH__.updatedAt
                : null,
            phase:
              typeof win.__HYPERSCAPE_STREAM_RENDERER_HEALTH__.phase ===
              "string"
                ? win.__HYPERSCAPE_STREAM_RENDERER_HEALTH__.phase
                : null,
          }
        : null;

    // Read boot status from a lightweight window global instead of
    // document.body.textContent which forces full text computation of
    // the game DOM every probe interval and can cause layout thrashing.
    const bootStatus =
      typeof win.__HYPERSCAPE_STREAM_BOOT_STATUS__ === "string"
        ? win.__HYPERSCAPE_STREAM_BOOT_STATUS__
        : null;

    const hasStreamingBootUi =
      !explicitHealth &&
      bootStatus !== null &&
      !bootStatus.startsWith("error:");
    const hasCriticalErrorUi =
      !explicitHealth && bootStatus !== null && bootStatus.startsWith("error:");
    const heartbeat =
      win.__HYPERSCAPE_STREAM_HEARTBEAT__ &&
      typeof win.__HYPERSCAPE_STREAM_HEARTBEAT__ === "object"
        ? {
            renderTick:
              typeof win.__HYPERSCAPE_STREAM_HEARTBEAT__.renderTick ===
                "number" &&
              Number.isFinite(win.__HYPERSCAPE_STREAM_HEARTBEAT__.renderTick)
                ? win.__HYPERSCAPE_STREAM_HEARTBEAT__.renderTick
                : 0,
            latestRenderTickAt:
              typeof win.__HYPERSCAPE_STREAM_HEARTBEAT__.latestRenderTickAt ===
                "number" &&
              Number.isFinite(
                win.__HYPERSCAPE_STREAM_HEARTBEAT__.latestRenderTickAt,
              )
                ? win.__HYPERSCAPE_STREAM_HEARTBEAT__.latestRenderTickAt
                : null,
            duelStateTick:
              typeof win.__HYPERSCAPE_STREAM_HEARTBEAT__.duelStateTick ===
                "number" &&
              Number.isFinite(win.__HYPERSCAPE_STREAM_HEARTBEAT__.duelStateTick)
                ? win.__HYPERSCAPE_STREAM_HEARTBEAT__.duelStateTick
                : 0,
            latestDuelStateTickAt:
              typeof win.__HYPERSCAPE_STREAM_HEARTBEAT__
                .latestDuelStateTickAt === "number" &&
              Number.isFinite(
                win.__HYPERSCAPE_STREAM_HEARTBEAT__.latestDuelStateTickAt,
              )
                ? win.__HYPERSCAPE_STREAM_HEARTBEAT__.latestDuelStateTickAt
                : null,
          }
        : null;
    let frameHash: string | null = null;
    const preferredCanvas =
      document.querySelector("#hyperscape-world-canvas") ??
      document.querySelector("#game-canvas canvas") ??
      document.querySelector("[data-component='viewport'] canvas");
    const canvasCandidates = Array.from(
      document.querySelectorAll("canvas"),
    ).filter(
      (candidate): candidate is HTMLCanvasElement =>
        candidate instanceof HTMLCanvasElement,
    );
    const largestCanvas = canvasCandidates.slice().sort((left, right) => {
      const leftRect = left.getBoundingClientRect();
      const rightRect = right.getBoundingClientRect();
      const leftArea =
        Math.max(leftRect.width, left.width) *
        Math.max(leftRect.height, left.height);
      const rightArea =
        Math.max(rightRect.width, right.width) *
        Math.max(rightRect.height, right.height);
      return rightArea - leftArea;
    })[0];
    const canvas =
      preferredCanvas instanceof HTMLCanvasElement
        ? preferredCanvas
        : (largestCanvas ?? null);
    const canvasRect =
      canvas instanceof HTMLCanvasElement
        ? (() => {
            const rect = canvas.getBoundingClientRect();
            const x = Number(rect.x);
            const y = Number(rect.y);
            const width = Number(rect.width);
            const height = Number(rect.height);
            return Number.isFinite(x) &&
              Number.isFinite(y) &&
              Number.isFinite(width) &&
              Number.isFinite(height) &&
              width > 0 &&
              height > 0
              ? { x, y, width, height }
              : null;
          })()
        : null;
    if (canvas instanceof HTMLCanvasElement) {
      const sampleCanvas = document.createElement("canvas");
      sampleCanvas.width = 32;
      sampleCanvas.height = 18;
      const context = sampleCanvas.getContext("2d", {
        willReadFrequently: true,
      });
      if (context) {
        try {
          context.drawImage(
            canvas,
            0,
            0,
            sampleCanvas.width,
            sampleCanvas.height,
          );
          const imageData = context.getImageData(
            0,
            0,
            sampleCanvas.width,
            sampleCanvas.height,
          ).data;
          let hash = 2166136261;
          for (let i = 0; i < imageData.length; i += 16) {
            hash ^= imageData[i] ?? 0;
            hash = Math.imul(hash, 16777619);
            hash ^= imageData[i + 1] ?? 0;
            hash = Math.imul(hash, 16777619);
            hash ^= imageData[i + 2] ?? 0;
            hash = Math.imul(hash, 16777619);
          }
          frameHash = (hash >>> 0).toString(16);
        } catch {
          frameHash = null;
        }
      }
    }
    return {
      explicitHealth,
      hasCanvas: canvasCandidates.length > 0,
      readyFlag: win.__HYPERSCAPE_STREAM_READY__ === true,
      hasStreamingBootUi,
      hasCriticalErrorUi,
      heartbeat,
      frameHash,
      canvasRect,
      currentSceneUrl: window.location.href,
      activeBundle,
    };
  });

  let visualSampleHash =
    typeof probe.frameHash === "string" && probe.frameHash.length > 0
      ? `canvas:${probe.frameHash}`
      : null;
  try {
    const clip = resolveVisualSampleClip(
      probe.canvasRect as RendererCanvasRectSnapshot | unknown,
      pageRef.viewportSize(),
    );
    if (clip) {
      const screenshot = await pageRef.screenshot({
        type: "jpeg",
        quality: 30,
        fullPage: false,
        scale: "css",
        clip,
      });
      visualSampleHash = `screenshot:${hashVisualSample(screenshot)}`;
    }
  } catch {
    // Fall back to the in-page canvas sample. Some capture sessions briefly
    // reject screenshots while Chromium is navigating or restarting.
  }

  const heartbeat =
    probe.heartbeat && typeof probe.heartbeat === "object"
      ? (probe.heartbeat as RendererHeartbeatSnapshot)
      : null;
  if (heartbeat) {
    lastObservedRenderTick = heartbeat.renderTick;
    lastObservedDuelStateTick = heartbeat.duelStateTick;
    latestRenderTickAt = heartbeat.latestRenderTickAt;
    latestDuelStateTickAt = heartbeat.latestDuelStateTickAt;
  }
  latestSceneUrl =
    typeof probe.currentSceneUrl === "string" &&
    probe.currentSceneUrl.length > 0
      ? probe.currentSceneUrl
      : selectedGameUrl;
  latestActiveBundle =
    typeof probe.activeBundle === "string" && probe.activeBundle.length > 0
      ? probe.activeBundle
      : null;
  if (visualSampleHash) {
    if (visualSampleHash !== lastVisualSampleHash) {
      lastVisualSampleHash = visualSampleHash;
      latestVisualChangeAt = probedAt;
    } else if (latestVisualChangeAt === null) {
      latestVisualChangeAt = probedAt;
    }
  }

  const explicitHealth =
    probe.explicitHealth && typeof probe.explicitHealth === "object"
      ? probe.explicitHealth
      : null;

  if (explicitHealth) {
    const criticalUiVisible = probe.hasCriticalErrorUi === true;
    return {
      ready: criticalUiVisible ? false : explicitHealth.ready === true,
      degradedReason: criticalUiVisible
        ? normalizedCriticalErrorReason(probe)
        : typeof explicitHealth.degradedReason === "string"
          ? explicitHealth.degradedReason
          : null,
      updatedAt:
        typeof explicitHealth.updatedAt === "number"
          ? explicitHealth.updatedAt
          : probedAt,
      phase:
        typeof explicitHealth.phase === "string" ? explicitHealth.phase : null,
      diagnostics: {
        hasCanvas: probe.hasCanvas === true,
        hasStreamingBootUi: probe.hasStreamingBootUi === true,
        hasCriticalErrorUi: criticalUiVisible,
        readyFlag: probe.readyFlag === true,
      },
    };
  }

  return {
    ready:
      !probe.hasCriticalErrorUi &&
      (probe.readyFlag === true ||
        (probe.hasCanvas && !probe.hasStreamingBootUi)),
    degradedReason:
      !probe.hasCriticalErrorUi &&
      (probe.readyFlag === true ||
        (probe.hasCanvas && !probe.hasStreamingBootUi))
        ? null
        : probe.hasCriticalErrorUi
          ? normalizedCriticalErrorReason(probe)
          : probe.hasStreamingBootUi
            ? "loading_overlay_active"
            : "canvas_missing",
    updatedAt: probedAt,
    phase: null,
    diagnostics: {
      hasCanvas: probe.hasCanvas === true,
      hasStreamingBootUi: probe.hasStreamingBootUi === true,
      hasCriticalErrorUi: probe.hasCriticalErrorUi === true,
      readyFlag: probe.readyFlag === true,
    },
  };
}

function normalizedCriticalErrorReason(probe: {
  hasCriticalErrorUi?: boolean;
  explicitHealth?: { degradedReason?: string | null } | null;
}): string {
  const explicitReason = probe.explicitHealth?.degradedReason;
  if (typeof explicitReason === "string" && explicitReason.trim().length > 0) {
    return explicitReason;
  }
  return probe.hasCriticalErrorUi ? "initialization_failed" : "canvas_missing";
}

function assertAllowedCaptureNavigation(rawUrl: string): void {
  const unexpectedOrigin = resolveUnexpectedCaptureOrigin(
    rawUrl,
    ALLOWED_CAPTURE_ORIGINS,
  );
  if (!unexpectedOrigin) {
    return;
  }

  throw new Error(
    `Capture browser navigated outside the allowed origin set (${ALLOWED_CAPTURE_ORIGINS.join(", ")}): ${unexpectedOrigin}`,
  );
}

async function abortCaptureForUnexpectedNavigation(
  rawUrl: string,
): Promise<void> {
  if (captureNavigationAbortInFlight) {
    return;
  }
  captureNavigationAbortInFlight = true;
  console.error(
    `[Main] Refusing to capture unexpected navigation target ${redactStreamingSecretsFromUrl(rawUrl)}. Allowed origins: ${ALLOWED_CAPTURE_ORIGINS.join(", ")}`,
  );
  try {
    await cleanup();
  } finally {
    process.exit(1);
  }
}

async function refreshRendererHealthSnapshot(
  pageRef: Page | null,
): Promise<RendererHealthSnapshot> {
  if (!pageRef) {
    latestRendererHealth = {
      ready: false,
      degradedReason: "capture_page_missing",
      updatedAt: Date.now(),
      phase: null,
      diagnostics: null,
    };
    return latestRendererHealth;
  }

  if (rendererHealthProbeInFlight) {
    return rendererHealthProbeInFlight;
  }

  rendererHealthProbeInFlight = (async () => {
    try {
      latestRendererHealth = await probeRendererHealth(pageRef);
    } catch (err) {
      latestRendererHealth = {
        ready: false,
        degradedReason: `probe_failed:${errMsg(err)}`.slice(0, 180),
        updatedAt: Date.now(),
        phase: null,
        diagnostics: null,
      };
    }
    return latestRendererHealth;
  })().finally(() => {
    rendererHealthProbeInFlight = null;
  });

  return rendererHealthProbeInFlight;
}

async function waitForStreamReadiness(
  pageRef: Page,
  timeoutMs: number,
): Promise<boolean> {
  const startedAt = Date.now();
  const deadline = startedAt + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const probe = await refreshRendererHealthSnapshot(pageRef);
      if (
        shouldAcceptCaptureReadiness({
          snapshot: probe,
          startedAt,
          nowMs: Date.now(),
        })
      ) {
        return true;
      }
    } catch (err) {
      if (!isTransientPageEvalError(err)) {
        console.warn("[Main] Stream readiness probe failed:", errMsg(err));
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  return false;
}

// ── Browser Launch ─────────────────────────────────────────────────────────

async function launchCaptureBrowser() {
  const featureFlags = "--enable-features=Vulkan,UseSkiaRenderer,WebGPU";
  const launchConfig = {
    headless: STREAM_CAPTURE_HEADLESS,
    args: buildDefaultCaptureLaunchArgs({
      angleBackend: ANGLE_BACKEND,
      featureFlags,
      disableSandbox: CAPTURE_DISABLE_SANDBOX,
    }),
  };

  if (CAPTURE_DISABLE_SANDBOX) {
    console.warn(
      "[Main] CAPTURE_DISABLE_SANDBOX=true: Chromium sandboxing is disabled for this capture session.",
    );
  }

  if (STREAM_CAPTURE_CHANNEL) {
    console.log(
      `[Main] Launching with explicit browser channel: ${STREAM_CAPTURE_CHANNEL}`,
    );
    return await chromium.launch({
      ...launchConfig,
      channel: STREAM_CAPTURE_CHANNEL,
    });
  }

  try {
    return await chromium.launch(launchConfig);
  } catch (err) {
    const message = errMsg(err);
    const likelyMissingBrowser =
      message.includes("Executable doesn't exist") ||
      message.includes("browser executable") ||
      message.includes("Please run the following command");

    if (!likelyMissingBrowser) {
      throw err;
    }

    console.warn(
      "[Main] Playwright Chromium is missing. Installing bundled Chromium...",
    );
    const install = spawnSync(
      process.platform === "win32" ? "bunx.cmd" : "bunx",
      ["playwright", "install", "chromium"],
      {
        stdio: "inherit",
        env: process.env,
      },
    );
    if (install.status !== 0) {
      throw new Error(
        `Failed to install Playwright Chromium (exit ${install.status ?? "unknown"}).`,
      );
    }

    console.log("[Main] Chromium installed. Retrying browser launch...");
    return chromium.launch(launchConfig);
  }
}

async function setupBrowser(forceReselect = false) {
  if (browser) await cleanup();
  if (forceReselect) {
    selectedGameUrl = null;
  }

  console.log(
    `[Main] Launching browser (headless=${STREAM_CAPTURE_HEADLESS}, angle=${ANGLE_BACKEND}${STREAM_CAPTURE_CHANNEL ? `, channel=${STREAM_CAPTURE_CHANNEL}` : ""}, mode=${CAPTURE_MODE})...`,
  );
  browser = await launchCaptureBrowser();

  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
  });
  page = await context.newPage();

  // Keep compositor frames flowing for CDP screencast even when the scene is
  // visually static (e.g. waiting overlays), otherwise some Chromium builds
  // emit sparse frames and stall downstream HLS/RTMP cadence.
  await page.addInitScript(() => {
    const win = window as unknown as {
      __HYPERSCAPE_REPAINT_TICKER__?: boolean;
    };
    if (win.__HYPERSCAPE_REPAINT_TICKER__) return;
    win.__HYPERSCAPE_REPAINT_TICKER__ = true;

    const ticker = document.createElement("div");
    ticker.id = "__hyperscape-repaint-ticker";
    ticker.style.position = "fixed";
    ticker.style.right = "0";
    ticker.style.bottom = "0";
    ticker.style.width = "2px";
    ticker.style.height = "2px";
    ticker.style.opacity = "0.015";
    ticker.style.backgroundColor = "#000000";
    ticker.style.mixBlendMode = "difference";
    ticker.style.zIndex = "2147483647";
    ticker.style.pointerEvents = "none";
    ticker.style.willChange = "transform,opacity,background-color";

    const attach = () => {
      const root = document.body || document.documentElement;
      if (root && !root.contains(ticker)) {
        root.appendChild(ticker);
      }
    };

    attach();
    let phase = 0;
    const tick = () => {
      phase = (phase + 1) & 3;
      ticker.style.transform =
        phase & 1 ? "translate3d(0.5px,0.5px,0)" : "translate3d(0,0,0)";
      ticker.style.backgroundColor = phase >= 2 ? "#010101" : "#000000";
      ticker.style.opacity = phase & 1 ? "0.02" : "0.015";
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    window.addEventListener("DOMContentLoaded", attach, { once: true });
  });

  page.on("console", (msg) => {
    const type = msg.type();
    const text = msg.text();
    if (type === "error") {
      console.error("[Browser]", text);
    } else if (text.includes("[Capture]") || text.includes("[StreamingMode]")) {
      console.log("[Browser]", text);
    }
  });

  page.on("framenavigated", (frame) => {
    if (frame !== page?.mainFrame()) {
      return;
    }
    const navigatedUrl = frame.url();
    if (!navigatedUrl || navigatedUrl === "about:blank") {
      return;
    }
    const unexpectedOrigin = resolveUnexpectedCaptureOrigin(
      navigatedUrl,
      ALLOWED_CAPTURE_ORIGINS,
    );
    if (!unexpectedOrigin) {
      return;
    }
    void abortCaptureForUnexpectedNavigation(navigatedUrl);
  });

  if (!selectedGameUrl) {
    for (const candidateUrl of GAME_URL_CANDIDATES) {
      const redactedCandidateUrl = redactStreamingSecretsFromUrl(candidateUrl);
      console.log(`[Main] Navigating to ${redactedCandidateUrl}...`);
      try {
        await page.goto(candidateUrl, {
          timeout: 120_000,
          waitUntil: "domcontentloaded",
        });
        assertAllowedCaptureNavigation(page.url());
      } catch (err) {
        console.warn(`[Main] Failed to load ${redactedCandidateUrl}:`, err);
        continue;
      }

      if (USE_TIMED_STREAM_WARMUP) {
        console.log(
          `[Main] Using timed warmup (${STREAM_CAPTURE_WARMUP_MS}ms) for ${redactedCandidateUrl}; skipping in-page readiness probe on headed Linux CDP capture.`,
        );
        await page.waitForTimeout(STREAM_CAPTURE_WARMUP_MS);
        selectedGameUrl = candidateUrl;
        break;
      }

      console.log(
        `[Main] Waiting for stream readiness on ${redactedCandidateUrl}...`,
      );
      const isReady = await waitForStreamReadiness(page, 90_000);
      if (isReady) {
        selectedGameUrl = candidateUrl;
        break;
      }
      console.warn(
        `[Main] Stream readiness not detected on ${redactedCandidateUrl}, trying fallback...`,
      );
    }
  } else {
    try {
      await page.goto(selectedGameUrl, {
        timeout: 120_000,
        waitUntil: "domcontentloaded",
      });
      assertAllowedCaptureNavigation(page.url());
    } catch (err) {
      console.error(
        `[Main] Failed to reload configured URL ${redactStreamingSecretsFromUrl(selectedGameUrl)}`,
        err,
      );
    }
  }

  if (!selectedGameUrl) {
    console.error(
      `[Main] Could not find a game canvas on any candidate URL: ${GAME_URL_CANDIDATES.map(redactStreamingSecretsFromUrl).join(", ")}`,
    );
    console.error(
      "[Main] Make sure the game client is running and supports stream/spectator mode.",
    );
    await cleanup();
    process.exit(1);
  }

  console.log(
    `[Main] Using game page: ${redactStreamingSecretsFromUrl(selectedGameUrl)}`,
  );
  if (STREAM_CAPTURE_POST_NAV_DELAY_MS > 0) {
    console.log(
      `[Main] Waiting ${STREAM_CAPTURE_POST_NAV_DELAY_MS}ms before starting capture...`,
    );
    await page.waitForTimeout(STREAM_CAPTURE_POST_NAV_DELAY_MS);
  }

  launchTime = Date.now();
}

// ── CDP Screencast Capture ─────────────────────────────────────────────────

async function startCdpCapture(bridge: ReturnType<typeof getRTMPBridge>) {
  if (!page) throw new Error("No page available for CDP capture");

  // Create CDP session
  cdpSession = await page.context().newCDPSession(page);

  console.log(
    `[CDP] Starting screencast capture (quality=${CDP_QUALITY}, fps=${TARGET_FPS}, ${VIEWPORT.width}x${VIEWPORT.height})...`,
  );

  // Start FFmpeg in direct mode (JPEG piping)
  bridge.startFFmpegDirect();

  startFpsTracking();

  // Handle incoming frames from CDP
  cdpSession.on("Page.screencastFrame", async (params) => {
    const { sessionId, data: base64Data } = params;

    // Acknowledge the frame immediately to request the next one
    try {
      await cdpSession?.send("Page.screencastFrameAck", { sessionId });
    } catch {
      // Session may have been destroyed during page navigation
    }

    // Decode base64 JPEG and feed to FFmpeg
    const jpegBuffer = Buffer.from(base64Data, "base64");
    const frameAt = Date.now();
    const metadataRecord =
      params.metadata && typeof params.metadata === "object"
        ? (params.metadata as Record<string, unknown>)
        : null;
    const cdpTimestamp =
      metadataRecord &&
      typeof metadataRecord.timestamp === "number" &&
      Number.isFinite(metadataRecord.timestamp)
        ? metadataRecord.timestamp
        : null;
    lastCaptureFrameAt = frameAt;
    const written = bridge.feedFrame(jpegBuffer, {
      frameAt,
      cdpTimestamp,
    });

    if (written) {
      cdpFrameCount++;
    } else {
      cdpDroppedFrames++;
    }
  });

  // Start the screencast
  await cdpSession.send("Page.startScreencast", {
    format: "jpeg",
    quality: CDP_QUALITY,
    maxWidth: VIEWPORT.width,
    maxHeight: VIEWPORT.height,
    everyNthFrame: 1, // Capture every frame
  });

  console.log("[CDP] ✅ Screencast capture started — frames piping to FFmpeg");
}

async function stopCdpCapture() {
  stopFpsTracking();

  if (cdpSession) {
    try {
      await cdpSession.send("Page.stopScreencast");
      await cdpSession.detach();
    } catch {
      // Session may already be closed
    }
    cdpSession = null;
  }
}

// ── Legacy MediaRecorder Capture ───────────────────────────────────────────

async function startLegacyCapture(bridge: ReturnType<typeof getRTMPBridge>) {
  if (!page) return;

  // Start WebSocket bridge for MediaRecorder chunks
  bridge.start(BRIDGE_PORT);

  const streamPageMayAlreadyCapture =
    !REQUIRE_IN_PAGE_READY_PROBE && selectedGameUrl?.includes("?page=stream");
  if (streamPageMayAlreadyCapture) {
    console.log(
      "[Main] Stream page capture bridge may already be active; will inject MediaRecorder only if the in-page bridge is inactive.",
    );
  }

  const captureScript = generateCaptureScript({
    bridgeUrl: BRIDGE_URL,
    fps: TARGET_FPS,
    bitrate: 6000000,
  });

  const ensureCaptureRunning = async (reason: string) => {
    if (!page || page.isClosed()) return;

    let state: {
      hasCanvas: boolean;
      hasControl: boolean;
      recording: boolean;
      wsConnected: boolean;
    };
    try {
      state = await page.evaluate(() => {
        const control = (
          window as unknown as {
            __captureControl__?: { getStatus: () => unknown };
          }
        ).__captureControl__;
        const status = (control?.getStatus?.() || {}) as {
          recording?: boolean;
          wsConnected?: boolean;
        };
        return {
          hasCanvas: document.querySelector("canvas") !== null,
          hasControl: Boolean(control),
          recording: status.recording === true,
          wsConnected: status.wsConnected === true,
        };
      });
    } catch (err) {
      if (isTransientPageEvalError(err)) return;
      throw err;
    }

    if (!state.hasCanvas) return;
    if (state.hasControl && state.recording && state.wsConnected) return;

    console.log(
      `[Main] Legacy capture inactive (reason=${reason}), injecting script...`,
    );
    try {
      await page.evaluate(captureScript);
      await page.waitForTimeout(1500);
    } catch (err) {
      if (isTransientPageEvalError(err)) return;
      throw err;
    }
  };

  // Inject and verify capture
  try {
    await ensureCaptureRunning("initial");
  } catch (err) {
    console.warn("[Main] Initial capture injection failed:", err);
  }

  // Watchdog to recover from page reloads
  return setInterval(() => {
    void ensureCaptureRunning("watchdog").catch((err) => {
      console.warn("[Main] Capture watchdog error:", err);
    });
  }, 5000);
}

// ── WebCodecs Canvas Capture ───────────────────────────────────────────────

async function startWebCodecsCapture(bridge: ReturnType<typeof getRTMPBridge>) {
  if (!page) return;

  // Start WebSocket bridge for WebCodecs NAL chunks (stream copy)
  bridge.startWebCodecs(BRIDGE_PORT);

  const captureScript = generateWebCodecsCaptureScript({
    bridgeUrl: BRIDGE_URL,
    fps: TARGET_FPS,
    bitrate: 6000000,
  });

  const ensureCaptureRunning = async (reason: string) => {
    if (!page || page.isClosed()) return;

    let state: {
      hasCanvas: boolean;
      hasControl: boolean;
      recording: boolean;
      wsConnected: boolean;
    };
    try {
      state = await page.evaluate(() => {
        const control = (
          window as unknown as {
            __captureControl__?: { getStatus: () => unknown };
          }
        ).__captureControl__;
        const status = (control?.getStatus?.() || {}) as {
          recording?: boolean;
          wsConnected?: boolean;
        };
        return {
          hasCanvas: document.querySelector("canvas") !== null,
          hasControl: Boolean(control),
          recording: status.recording === true,
          wsConnected: status.wsConnected === true,
        };
      });
    } catch (err) {
      if (isTransientPageEvalError(err)) return;
      throw err;
    }

    if (!state.hasCanvas) return;
    if (state.hasControl && state.recording && state.wsConnected) return;

    console.log(
      `[Main] WebCodecs capture inactive (reason=${reason}), injecting script...`,
    );
    try {
      await page.evaluate(captureScript);
      await page.waitForTimeout(1500);
    } catch (err) {
      if (isTransientPageEvalError(err)) return;
      throw err;
    }
  };

  // Inject and verify capture
  try {
    await ensureCaptureRunning("initial");
  } catch (err) {
    console.warn("[Main] Initial WebCodecs capture injection failed:", err);
  }

  // Watchdog to recover from page reloads
  return setInterval(() => {
    void ensureCaptureRunning("watchdog").catch((err) => {
      console.warn("[Main] Capture watchdog error:", err);
    });
  }, 5000);
}

type BrowserCaptureStatus = {
  recording?: boolean;
  wsConnected?: boolean;
  chunkCount?: number;
  bytesSent?: number;
  uptime?: number;
  lastChunkAt?: number | null;
  lastChunkAgeMs?: number | null;
  lastChunkMs?: number | null;
  captureFps?: number;
  captureSessionGeneration?: string | null;
};

async function getBrowserCaptureStatus(): Promise<BrowserCaptureStatus | null> {
  if (!page || page.isClosed()) return null;

  try {
    return (await page.evaluate(() => {
      const win = window as unknown as {
        __captureControl__?: { getStatus: () => unknown };
        __HYPERSCAPE_STREAM_CAPTURE_SESSION_GENERATION__?: string | null;
      };
      const captureStatus =
        (win.__captureControl__?.getStatus?.() as Record<string, unknown>) ??
        {};
      return {
        ...captureStatus,
        captureSessionGeneration:
          typeof win.__HYPERSCAPE_STREAM_CAPTURE_SESSION_GENERATION__ ===
          "string"
            ? win.__HYPERSCAPE_STREAM_CAPTURE_SESSION_GENERATION__
            : null,
      };
    })) as BrowserCaptureStatus | null;
  } catch (err) {
    if (isTransientPageEvalError(err)) return null;
    throw err;
  }
}

async function refreshBrowserCaptureStatusSnapshot(): Promise<BrowserCaptureStatus | null> {
  if (browserCaptureStatusProbeInFlight) {
    return browserCaptureStatusProbeInFlight;
  }

  browserCaptureStatusProbeInFlight = getBrowserCaptureStatus()
    .then((status) => {
      latestBrowserCaptureStatus = status;
      return latestBrowserCaptureStatus;
    })
    .catch((err) => {
      if (!isTransientPageEvalError(err)) {
        throw err;
      }
      return null;
    })
    .finally(() => {
      browserCaptureStatusProbeInFlight = null;
    });

  return browserCaptureStatusProbeInFlight;
}

async function stopInPageCaptureControl(): Promise<void> {
  if (!page || page.isClosed()) return;

  try {
    await page.evaluate(() => {
      (
        window as unknown as { __captureControl__?: { stop: () => void } }
      ).__captureControl__?.stop?.();
    });
  } catch (err) {
    if (!isTransientPageEvalError(err)) {
      console.warn("[Main] Failed to stop in-page capture control:", err);
    }
  }
}

async function waitForCaptureTraffic(
  bridge: ReturnType<typeof getRTMPBridge>,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const captureStatus = await refreshBrowserCaptureStatusSnapshot();
    const bridgeStats = bridge.getStats();
    const captureActive =
      captureStatus?.recording === true && captureStatus?.wsConnected === true;
    const hasTraffic = bridgeStats.bytesReceived > 0;

    if (captureActive && hasTraffic) {
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return false;
}

// ── Main Entry Point ───────────────────────────────────────────────────────

async function main() {
  console.log("=".repeat(60));
  console.log(`Hyperscape RTMP Streaming (${CAPTURE_MODE.toUpperCase()} mode)`);
  console.log("=".repeat(60));
  console.log("");

  // Check if any destinations are configured
  if (!hasConfiguredOutput()) {
    console.warn("");
    console.warn("WARNING: No RTMP outputs configured!");
    console.warn("Set environment variables:");
    console.warn("  - TWITCH_STREAM_KEY (or TWITCH_RTMP_STREAM_KEY)");
    console.warn(
      "  - Optional Twitch URL: TWITCH_STREAM_URL / TWITCH_RTMP_URL / TWITCH_RTMP_SERVER",
    );
    console.warn("  - YOUTUBE_STREAM_KEY (or YOUTUBE_RTMP_STREAM_KEY)");
    console.warn(
      "  - Optional YouTube URL: YOUTUBE_STREAM_URL / YOUTUBE_RTMP_URL",
    );
    console.warn("  - KICK_STREAM_KEY");
    console.warn("  - PUMPFUN_RTMP_URL");
    console.warn("  - X_RTMP_URL");
    console.warn("  - RTMP_DESTINATIONS_JSON");
    console.warn("");
    console.warn("Streaming will run but output will be discarded.");
    console.warn("");
  }

  // Get bridge instance
  const bridge = getRTMPBridge();

  // Start Spectator Server for zero-latency WebSockets stream
  bridge.startSpectatorServer(SPECTATOR_PORT);

  // Setup browser
  await setupBrowser();

  let captureWatchdog: ReturnType<typeof setInterval> | null = null;
  let activeCaptureMode: "cdp" | "webcodecs" | "mediarecorder" = CAPTURE_MODE;
  let cdpStalledIntervals = 0;
  let lastCdpBytesReceived = 0;
  let cdpRecoveryInFlight = false;
  let cdpRecoveryFailures = 0;
  let sourceDegradedPolls = 0;

  if (CAPTURE_MODE === "cdp") {
    // ── CDP Mode: Direct screencast frame piping ──
    try {
      await withTimeout(
        startCdpCapture(bridge),
        CDP_STARTUP_TIMEOUT_MS,
        "CDP screencast startup",
      );
    } catch (err) {
      console.warn(
        `[Main] CDP startup failed; falling back to WebCodecs capture: ${errMsg(err)}`,
      );
      await withTimeout(
        stopCdpCapture(),
        5_000,
        "Stop failed CDP capture",
      ).catch(() => undefined);
      bridge.stop();
      bridge.startSpectatorServer(SPECTATOR_PORT);
      captureWatchdog = (await startWebCodecsCapture(bridge)) ?? null;
      activeCaptureMode = "webcodecs";
      recordSourceRecovery("cdp_startup_failed_to_webcodecs");

      const healthy = await waitForCaptureTraffic(bridge, 20_000);
      if (!healthy) {
        throw new Error(
          "WebCodecs fallback produced no media within 20s after CDP startup failure.",
        );
      }
    }
  } else if (CAPTURE_MODE === "webcodecs") {
    // ── WebCodecs Mode: Native VideoEncoder API to FFmpeg -c:v copy ──
    captureWatchdog = (await startWebCodecsCapture(bridge)) ?? null;
    const healthy = await waitForCaptureTraffic(bridge, 20000);
    if (!healthy) {
      console.warn(
        "[Main] WebCodecs capture produced no media within 20s; falling back to CDP screencast capture.",
      );
      if (captureWatchdog) {
        clearInterval(captureWatchdog);
        captureWatchdog = null;
      }
      await stopInPageCaptureControl();
      bridge.stop();
      bridge.startSpectatorServer(SPECTATOR_PORT);
      await startCdpCapture(bridge);
      activeCaptureMode = "cdp";
      recordSourceRecovery("webcodecs_startup_failed_to_cdp");
    }
  } else {
    // ── Legacy Mode: MediaRecorder + WebSocket ──
    captureWatchdog = (await startLegacyCapture(bridge)) ?? null;
    activeCaptureMode = "mediarecorder";
  }

  console.log("");
  console.log("=".repeat(60));
  console.log("Streaming active! Press Ctrl+C to stop.");
  console.log("=".repeat(60));
  console.log("");

  await refreshRendererHealthSnapshot(page);
  writeExternalStatusSnapshot(bridge, activeCaptureMode);
  const statusSnapshotInterval = setInterval(() => {
    void refreshRendererHealthSnapshot(page)
      .then(() =>
        activeCaptureMode === "cdp"
          ? Promise.resolve<BrowserCaptureStatus | null>(null)
          : refreshBrowserCaptureStatusSnapshot(),
      )
      .catch(() => undefined)
      .finally(() => {
        const sourceRuntime = writeExternalStatusSnapshot(
          bridge,
          activeCaptureMode,
        );
        const degradedReason = sourceRuntime?.degradedReason ?? null;
        const withinLaunchGrace =
          Date.now() - launchTime <
          Math.max(CDP_STARTUP_TIMEOUT_MS, SOURCE_CAPTURE_STALL_MS);
        const shouldRestartForDegradation =
          !withinLaunchGrace &&
          (degradedReason === "browser_missing" ||
            degradedReason === "page_not_ready" ||
            degradedReason === "unexpected_navigation" ||
            degradedReason === "capture_stalled" ||
            degradedReason === "encoder_stalled" ||
            degradedReason === "manifest_stale");
        if (shouldRestartForDegradation) {
          sourceDegradedPolls += 1;
        } else {
          sourceDegradedPolls = 0;
        }
        if (
          shouldRestartForDegradation &&
          sourceDegradedPolls >= SOURCE_DEGRADED_RESTART_POLLS
        ) {
          console.error(
            `[Main] Source remained degraded (${degradedReason}) for ${sourceDegradedPolls} consecutive health polls; restarting worker.`,
          );
          sourceDegradedPolls = 0;
          void shutdown(1);
        }
      });
  }, 2000);

  // Status updates every 30 seconds
  const statusInterval = setInterval(async () => {
    const bridgeStatus = bridge.getStatus();
    const stats = bridge.getStats();
    const processMemory = process.memoryUsage();

    console.log("[Status] Active:", bridgeStatus.active);
    console.log(
      "[Status] Bytes received:",
      (stats.bytesReceived / 1024 / 1024).toFixed(2),
      "MB",
    );
    console.log(
      "[Status] Process RSS:",
      (processMemory.rss / 1024 / 1024).toFixed(1),
      "MB",
      "| Heap:",
      (processMemory.heapUsed / 1024 / 1024).toFixed(1),
      "MB",
    );
    console.log("[Status] Uptime:", Math.floor(stats.uptime / 1000), "seconds");
    console.log(
      "[Status] Destinations:",
      bridgeStatus.destinations
        .map((d) => `${d.name}: ${d.connected ? "OK" : "ERROR"}`)
        .join(", ") || "(none configured)",
    );
    if (!latestRendererHealth.ready) {
      console.warn(
        `[Stream Health] Renderer degraded: ${latestRendererHealth.degradedReason || "unknown"}`,
      );
    }

    if (activeCaptureMode === "cdp") {
      console.log(
        `[Stream Health] CDP FPS: ${cdpFps} | Frames: ${bridge.getDirectFrameCount()} | Dropped: ${cdpDroppedFrames} | BridgeDrops: ${stats.droppedFrames} | Backpressure: ${stats.backpressured ? "ON" : "off"}`,
      );

      // CDP can occasionally stall after initial page setup on remote GPU stacks.
      // Detect sustained no-traffic periods and recover automatically.
      const bytesDelta = stats.bytesReceived - lastCdpBytesReceived;
      lastCdpBytesReceived = stats.bytesReceived;
      const hasMeaningfulTraffic = bytesDelta > 16 * 1024;
      if (hasMeaningfulTraffic || !bridgeStatus.clientConnected) {
        cdpStalledIntervals = 0;
      } else {
        cdpStalledIntervals += 1;
      }

      if (cdpStalledIntervals >= 2) {
        if (cdpRecoveryInFlight) {
          console.warn(
            "[Main] CDP recovery already in progress; skipping duplicate stall recovery attempt.",
          );
          console.log("");
          return;
        }

        console.warn(
          `[Main] CDP capture stalled (${cdpStalledIntervals} intervals without traffic). Attempting recovery...`,
        );
        cdpStalledIntervals = 0;
        cdpRecoveryInFlight = true;

        let recovered = false;
        try {
          await withTimeout(
            (async () => {
              await stopCdpCapture();
              await setupBrowser(cdpRecoveryFailures > 0);
              await startCdpCapture(bridge);
            })(),
            CAPTURE_RECOVERY_TIMEOUT_MS,
            "CDP restart",
          );
          recovered = true;
          cdpRecoveryFailures = 0;
          lastCdpBytesReceived = bridge.getStats().bytesReceived;
          recordSourceRecovery("cdp_stall_recovery");
          console.log("[Main] CDP capture restarted successfully");
        } catch (err) {
          cdpRecoveryFailures += 1;
          console.warn(
            `[Main] CDP restart failed (${cdpRecoveryFailures}/${CAPTURE_RECOVERY_MAX_FAILURES}):`,
            errMsg(err),
          );
        } finally {
          cdpRecoveryInFlight = false;
        }

        if (
          !recovered &&
          cdpRecoveryFailures >= CAPTURE_RECOVERY_MAX_FAILURES
        ) {
          console.warn(
            "[Main] Falling back to WebCodecs capture mode after CDP stall.",
          );
          try {
            // Clear any existing watchdog before starting a new one.
            if (captureWatchdog) {
              clearInterval(captureWatchdog);
              captureWatchdog = null;
            }
            await withTimeout(
              stopCdpCapture(),
              5_000,
              "Stop stalled CDP capture",
            ).catch(() => undefined);
            bridge.stop();
            bridge.startSpectatorServer(SPECTATOR_PORT);
            captureWatchdog = (await startWebCodecsCapture(bridge)) ?? null;
            activeCaptureMode = "webcodecs";
            lastCdpBytesReceived = bridge.getStats().bytesReceived;
            cdpRecoveryFailures = 0;
            recordSourceRecovery("cdp_stall_fallback_to_webcodecs");
            console.log("[Main] Fallback to WebCodecs mode complete");
          } catch (fallbackErr) {
            console.error(
              "[Main] WebCodecs fallback failed:",
              errMsg(fallbackErr),
            );
            void shutdown(1);
          }
        }
      }
    } else {
      try {
        const captureStatus = await refreshBrowserCaptureStatusSnapshot();
        if (captureStatus) {
          console.log("[Status] Capture:", captureStatus);
          if (typeof captureStatus.captureFps === "number") {
            const uptime = captureStatus.uptime ?? 0;
            const chunkCount = captureStatus.chunkCount ?? 0;
            const chunksPerSec =
              uptime > 0 ? (chunkCount / (uptime / 1000)).toFixed(1) : "0";
            console.log(
              `[Stream Health] Capture FPS: ${captureStatus.captureFps} | Latency: ${captureStatus.lastChunkMs}ms | Chunks/sec: ${chunksPerSec}`,
            );
          }
        }
        console.log(
          `[Stream Health] BridgeDrops: ${stats.droppedFrames} | Backpressure: ${stats.backpressured ? "ON" : "off"}`,
        );
      } catch {
        console.log("[Status] Capture: unavailable");
      }
    }
    console.log("");

    // Check for periodic restart to clear memory leaks
    if (Date.now() - launchTime > BROWSER_RESTART_INTERVAL_MS) {
      // Guard: skip rotation if a CDP recovery is already in flight.
      if (cdpRecoveryInFlight) {
        console.warn(
          "[Main] Skipping scheduled browser rotation — CDP recovery in progress.",
        );
      } else {
        console.log(
          "[Main] 🔄 Scheduled browser rotation to prevent WebGL memory leaks.",
        );
        try {
          if (activeCaptureMode === "cdp") {
            await stopCdpCapture();
          } else {
            if (captureWatchdog) {
              clearInterval(captureWatchdog);
              captureWatchdog = null;
            }
            await stopInPageCaptureControl();
          }
          await setupBrowser();
          if (activeCaptureMode === "cdp") {
            await startCdpCapture(bridge);
          } else if (activeCaptureMode === "webcodecs") {
            captureWatchdog = (await startWebCodecsCapture(bridge)) ?? null;
          } else if (activeCaptureMode === "mediarecorder") {
            captureWatchdog = (await startLegacyCapture(bridge)) ?? null;
          }
          recordSourceRecovery("scheduled_browser_rotation");
        } catch (err) {
          console.error("[Main] Failed to rotate browser!", err);
        }
      }
    }
  }, 30000);

  // Handle shutdown
  const shutdown = async (exitCodeOrSignal: number | NodeJS.Signals = 0) => {
    const exitCode =
      typeof exitCodeOrSignal === "number" ? exitCodeOrSignal : 0;
    console.log("\n[Main] Shutting down...");
    if (captureWatchdog) clearInterval(captureWatchdog);
    clearInterval(statusSnapshotInterval);
    clearInterval(statusInterval);
    await stopCdpCapture();
    getRTMPBridge().stop();
    clearExternalStatusSnapshot();
    await cleanup();

    // Final leak report: print and validate that no timers were orphaned.
    const diag = getStreamLeakDiagnostics();
    if (diag) {
      diag.printReport();
      try {
        diag.assertNoLeaks("after shutdown");
        console.log("[StreamLeakDiagnostics] ✅ No timer leaks detected.");
      } catch (leakErr) {
        console.error(String(leakErr));
      }
      diag.uninstall();
    }

    process.exit(exitCode);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Keep process alive
  await new Promise(() => {});
}

async function cleanup() {
  console.log("[Main] Cleaning up...");

  if (page) {
    try {
      await page.evaluate(() => {
        (
          window as unknown as { __captureControl__?: { stop: () => void } }
        ).__captureControl__?.stop?.();
      });
    } catch {
      // Page might already be closed
    }
  }

  const bridge = getRTMPBridge();
  bridge.stopProcessing();

  if (browser) {
    await browser.close();
    browser = null;
  }

  page = null;
  latestBrowserCaptureStatus = null;
  latestSceneUrl = null;
  latestActiveBundle = null;

  clearExternalStatusSnapshot();
  console.log("[Main] Cleanup complete");
}

// Run
main().catch((err) => {
  console.error("[Main] Fatal error:", err);
  cleanup().then(() => process.exit(1));
});

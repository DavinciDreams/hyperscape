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
 * Falls back to the legacy MediaRecorder + WebSocket path if CDP capture fails
 * or STREAM_CAPTURE_MODE=mediarecorder is set.
 *
 * Usage:
 *   bun run stream:rtmp
 *   bun run packages/server/scripts/stream-to-rtmp.ts
 *
 * Environment Variables:
 *   STREAM_CAPTURE_MODE      - 'cdp' (default) or 'mediarecorder' (legacy)
 *   STREAM_CAPTURE_HEADLESS  - 'true' for headless (default: false for better GPU rendering)
 *   STREAM_CAPTURE_CHANNEL   - Browser channel ('chrome', 'msedge', etc.)
 *   STREAM_CAPTURE_ANGLE     - Optional ANGLE backend override ('metal', 'gl', etc.); use 'default' or unset to let Chrome choose
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
 *   STREAMING_VIEWER_ACCESS_TOKEN - Optional token appended as streamToken for gated viewer WS
 *   GAME_URL                 - URL to Hyperscape (default: http://localhost:3333/?page=stream)
 *   GAME_FALLBACK_URLS       - Comma-separated fallback URLs
 *   RTMP_BRIDGE_PORT         - WebSocket port for legacy bridge (default: 8765)
 */

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  chromium,
  type Browser,
  type BrowserContext,
  type CDPSession,
  type Page,
} from "playwright";
import {
  getRTMPBridge,
  startRTMPBridge,
  generateCaptureScript,
  generateWebCodecsCaptureScript,
} from "../src/streaming/index.js";
import {
  isStreamDestinationEnabled,
  resolveEnabledStreamDestinations,
} from "../src/streaming/stream-destinations.js";
import { resolveStreamingViewerAccessToken } from "../src/streaming/stream-viewer-access-token.js";
import { errMsg } from "../src/shared/errMsg.ts";
import { getStreamLeakDiagnostics } from "../src/streaming/stream-leak-diagnostics.js";

// Auto-enable leak diagnostics if STREAM_LEAK_DIAGNOSTICS=true.
// Installed before any timers are allocated so the counts are accurate.
getStreamLeakDiagnostics();

// ── Configuration ──────────────────────────────────────────────────────────

const GAME_URL = process.env.GAME_URL || "http://localhost:3333/stream.html";
const GAME_FALLBACK_URLS = (
  process.env.GAME_FALLBACK_URLS ||
  "http://localhost:3333/?page=stream,http://localhost:3333/?embedded=true&mode=spectator,http://localhost:3333/"
)
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const STREAMING_VIEWER_ACCESS_TOKEN = resolveStreamingViewerAccessToken();

function withViewerAccessToken(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    url.searchParams.set("internalCapture", "1");
    if (STREAMING_VIEWER_ACCESS_TOKEN) {
      url.searchParams.set("streamToken", STREAMING_VIEWER_ACCESS_TOKEN);
    }
    return url.toString();
  } catch {
    if (!STREAMING_VIEWER_ACCESS_TOKEN) {
      const separator = rawUrl.includes("?") ? "&" : "?";
      return `${rawUrl}${separator}internalCapture=1`;
    }
    const separator = rawUrl.includes("?") ? "&" : "?";
    return `${rawUrl}${separator}internalCapture=1&streamToken=${encodeURIComponent(STREAMING_VIEWER_ACCESS_TOKEN)}`;
  }
}

const GAME_URL_CANDIDATES = Array.from(
  new Set([GAME_URL, ...GAME_FALLBACK_URLS].map(withViewerAccessToken)),
);

const BRIDGE_PORT = parseInt(process.env.RTMP_BRIDGE_PORT || "8765", 10);
const BRIDGE_URL = `ws://127.0.0.1:${BRIDGE_PORT}`;
const SPECTATOR_PORT = parseInt(process.env.SPECTATOR_PORT || "4180", 10);
const EXTERNAL_STATUS_FILE = (process.env.RTMP_STATUS_FILE || "").trim();
const ENABLED_STREAM_DESTINATIONS = resolveEnabledStreamDestinations(
  process.env.STREAM_ENABLED_DESTINATIONS ||
    process.env.DUEL_STREAM_DESTINATIONS,
);
let externalStatusWriteErrored = false;

/** Capture mode: 'cdp' (fast) or 'mediarecorder' (legacy) or 'webcodecs' (holy grail) */
const STREAM_CAPTURE_HEADLESS = process.env.STREAM_CAPTURE_HEADLESS === "true";
const DEFAULT_CAPTURE_MODE = "cdp";
const CAPTURE_MODE = (process.env.STREAM_CAPTURE_MODE?.trim() ||
  DEFAULT_CAPTURE_MODE) as "cdp" | "mediarecorder" | "webcodecs";
const requestedCaptureChannel =
  process.env.STREAM_CAPTURE_CHANNEL?.trim() || "";
const STREAM_CAPTURE_CHANNEL =
  process.platform === "darwin" && requestedCaptureChannel === "chromium"
    ? "chrome"
    : requestedCaptureChannel;
const requestedAngleBackend = process.env.STREAM_CAPTURE_ANGLE?.trim() || "";
const ANGLE_BACKEND =
  requestedAngleBackend && requestedAngleBackend.toLowerCase() !== "default"
    ? requestedAngleBackend
    : process.platform === "darwin"
      ? "metal"
      : "vulkan";

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
let browserContext: BrowserContext | null = null;
let page: Page | null = null;
let cdpSession: CDPSession | null = null;
let selectedGameUrl: string | null = null;
let webgpuProbed = false;
let persistentUserDataDir: string | null = null;
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

// ── CDP Frame Rate Tracking ────────────────────────────────────────────────

let cdpFrameCount = 0;
let cdpFps = 0;
let cdpFpsIntervalId: ReturnType<typeof setInterval> | null = null;
let cdpDroppedFrames = 0;

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

type ActiveCaptureMode = "cdp" | "webcodecs" | "mediarecorder";

function writeExternalStatusSnapshot(
  bridge: ReturnType<typeof getRTMPBridge>,
  captureMode: ActiveCaptureMode,
): void {
  if (!EXTERNAL_STATUS_FILE) return;

  const bridgeStatus = bridge.getStatus();
  const stats = bridge.getStats();
  const processMemory = process.memoryUsage();
  const payload = {
    ...bridgeStatus,
    stats: {
      bytesReceived: stats.bytesReceived,
      bytesReceivedMB: (stats.bytesReceived / 1024 / 1024).toFixed(2),
      uptimeSeconds: Math.floor(stats.uptime / 1000),
      destinations: stats.destinations,
      healthy: stats.healthy,
      droppedFrames: stats.droppedFrames,
      backpressured: stats.backpressured,
      spectators: stats.spectators,
      processMemory: stats.processMemory,
    },
    captureMode,
    processRssBytes: processMemory.rss,
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
  const hasTwitchKey =
    isStreamDestinationEnabled(ENABLED_STREAM_DESTINATIONS, "twitch") &&
    Boolean(
      process.env.TWITCH_STREAM_KEY || process.env.TWITCH_RTMP_STREAM_KEY,
    );
  const hasYoutubeKey =
    isStreamDestinationEnabled(ENABLED_STREAM_DESTINATIONS, "youtube") &&
    Boolean(
      process.env.YOUTUBE_STREAM_KEY || process.env.YOUTUBE_RTMP_STREAM_KEY,
    );
  const hasKickKey =
    isStreamDestinationEnabled(ENABLED_STREAM_DESTINATIONS, "kick") &&
    Boolean(process.env.KICK_STREAM_KEY);
  const hasPumpfunUrl =
    isStreamDestinationEnabled(ENABLED_STREAM_DESTINATIONS, "pumpfun") &&
    Boolean(process.env.PUMPFUN_RTMP_URL);
  const hasXUrl =
    isStreamDestinationEnabled(ENABLED_STREAM_DESTINATIONS, "x") &&
    Boolean(process.env.X_RTMP_URL);
  const hasMultiplexerUrl =
    isStreamDestinationEnabled(ENABLED_STREAM_DESTINATIONS, "multiplexer") &&
    Boolean(process.env.RTMP_MULTIPLEXER_URL);
  const hasCustomDestinations =
    isStreamDestinationEnabled(ENABLED_STREAM_DESTINATIONS, "custom") &&
    Boolean(process.env.RTMP_DESTINATIONS_JSON);
  return Boolean(
    hasMultiplexerUrl ||
    hasTwitchKey ||
    hasYoutubeKey ||
    hasKickKey ||
    hasPumpfunUrl ||
    hasXUrl ||
    hasCustomDestinations,
  );
}

async function waitForStreamReadiness(
  pageRef: Page,
  timeoutMs: number,
): Promise<boolean> {
  const startedAt = Date.now();
  const deadline = startedAt + timeoutMs;
  const hardFallbackMs = Math.max(10_000, Math.min(timeoutMs - 5_000, 30_000));

  while (Date.now() < deadline) {
    try {
      const probe = await pageRef.evaluate(() => {
        const win = window as unknown as {
          __HYPERSCAPE_STREAM_READY__?: boolean;
        };
        const text = (document.body?.innerText || "").slice(0, 512);
        const normalizedText = text.toLowerCase();
        const hasStreamingBootUi =
          normalizedText.includes("waiting for duel data") ||
          normalizedText.includes("initializing world systems") ||
          normalizedText.includes("initializing") ||
          normalizedText.includes("loading assets") ||
          normalizedText.includes("finalizing");
        return {
          hasCanvas: document.querySelector("canvas") !== null,
          readyFlag: win.__HYPERSCAPE_STREAM_READY__ === true,
          hasStreamingBootUi,
        };
      });

      if (probe.readyFlag) {
        return true;
      }

      // Streaming is better than waiting forever for a "perfect" ready state.
      // Once a canvas exists, allow a short boot window and then start capture
      // even if the loading UI is still present.
      if (
        probe.hasCanvas &&
        (!probe.hasStreamingBootUi || Date.now() - startedAt >= 5_000)
      ) {
        return true;
      }

      // Final fallback in case the page never exposes a canvas but the boot UI
      // is clearly alive.
      if (
        probe.hasStreamingBootUi &&
        Date.now() - startedAt >= hardFallbackMs
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
  // On Linux dual-GPU laptops (Intel iGPU + NVIDIA dGPU), ensure Chrome uses
  // the discrete NVIDIA GPU for WebGPU.
  if (process.platform === "linux") {
    process.env.__NV_PRIME_RENDER_OFFLOAD = "1";
    process.env.__NV_PRIME_RENDER_OFFLOAD_PROVIDER = "NVIDIA-G0";
    process.env.__GLX_VENDOR_LIBRARY_NAME = "nvidia";
    process.env.__VK_LAYER_NV_optimus = "NVIDIA_only";
    process.env.DRI_PRIME = "1";
  }

  // Merge Playwright's CDPScreenshotNewSurface with our WebGPU features in a
  // single --enable-features flag. UnsafeWebGPU ensures navigator.gpu is
  // available on non-HTTPS origins (localhost).
  // On Linux with NVIDIA, ANGLE GL (OpenGL ES) fails with "Invalid visual ID"
  // during EGL init. ANGLE Vulkan (via feature flags) is required for WebGPU.
  // This is ANGLE's Vulkan backend — NOT native --use-vulkan (which crashes).
  const isLinux = process.platform === "linux";
  const featureFlags = [
    "CDPScreenshotNewSurface",
    "WebGPU",
    "UnsafeWebGPU",
    "WebGPUDeveloperFeatures",
    ...(isLinux ? ["DefaultANGLEVulkan", "Vulkan", "VulkanFromANGLE"] : []),
  ].join(",");

  const launchArgs = [
    "--use-gl=angle",
    ...(isLinux
      ? ["--use-angle=vulkan"]
      : ANGLE_BACKEND
        ? [`--use-angle=${ANGLE_BACKEND}`]
        : []),
    // Force X11 platform on Linux for proper display/GPU context
    ...(process.platform === "linux" ? ["--ozone-platform=x11"] : []),
    `--enable-features=${featureFlags}`,
    // Some Chrome builds require standalone flags in addition to --enable-features
    "--enable-unsafe-webgpu",
    "--enable-webgpu-developer-features",
    "--ignore-gpu-blocklist",
    "--enable-gpu-rasterization",
    "--enable-gpu-service-logging",
    // Sandbox & stability
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-web-security",
    "--autoplay-policy=no-user-gesture-required",
    // Prevent DPI scaling on HiDPI displays (ensures 1:1 pixel mapping)
    "--force-device-scale-factor=1",
    // Prevent Chromium from throttling rendering/timers
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--disable-hang-monitor",
  ];

  // Playwright unconditionally injects --enable-unsafe-swiftshader on Linux,
  // forcing software rendering. We strip that and --disable-gpu.
  // NOTE: We intentionally do NOT strip --use-gl=disabled — see comment above.
  const ignoreArgs = [
    "--enable-unsafe-swiftshader",
    "--disable-gpu",
    "--disable-field-trial-config",
  ];

  const usePersistentContext =
    process.platform === "linux" && STREAM_CAPTURE_HEADLESS === false;

  if (usePersistentContext) {
    persistentUserDataDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "hyperscape-stream-profile-"),
    );
    const persistentLaunchConfig = {
      headless: false as const,
      args: [
        ...launchArgs,
        `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
        "--window-position=0,0",
      ],
      ignoreDefaultArgs: ignoreArgs,
      viewport: VIEWPORT,
      deviceScaleFactor: 1,
      serviceWorkers: "block" as const,
    };

    console.log(
      "[Main] Launching persistent browser context for visible X11 window capture...",
    );

    if (STREAM_CAPTURE_CHANNEL) {
      return await chromium.launchPersistentContext(persistentUserDataDir, {
        ...persistentLaunchConfig,
        channel: STREAM_CAPTURE_CHANNEL,
      });
    }

    return await chromium.launchPersistentContext(
      persistentUserDataDir,
      persistentLaunchConfig,
    );
  }

  // Non-Linux or headless: use standard Playwright launch.
  const launchConfig = {
    headless: STREAM_CAPTURE_HEADLESS,
    args: launchArgs,
    ignoreDefaultArgs: ignoreArgs,
  };

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

async function setupBrowser() {
  if (browser || browserContext) await cleanup();
  webgpuProbed = false;

  const streamReadyTimeoutMs = Math.max(
    10_000,
    Number.parseInt(process.env.STREAM_READY_TIMEOUT_MS || "30000", 10) ||
      30_000,
  );

  console.log(
    `[Main] Launching browser (headless=${STREAM_CAPTURE_HEADLESS}, angle=${ANGLE_BACKEND}${STREAM_CAPTURE_CHANNEL ? `, channel=${STREAM_CAPTURE_CHANNEL}` : ""}, mode=${CAPTURE_MODE})...`,
  );
  const launched = await launchCaptureBrowser();

  if ("newPage" in launched && "pages" in launched) {
    browserContext = launched as BrowserContext;
    browser = browserContext.browser();
    page = browserContext.pages()[0] ?? (await browserContext.newPage());
  } else {
    browser = launched as Browser;
    browserContext = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 1,
      serviceWorkers: "block",
    });
    page = await browserContext.newPage();
  }

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
  page.on("pageerror", (err) => {
    console.error("[Browser][PageError]", errMsg(err));
  });

  if (!selectedGameUrl) {
    for (const candidateUrl of GAME_URL_CANDIDATES) {
      console.log(`[Main] Navigating to ${candidateUrl}...`);
      try {
        await page.goto(candidateUrl, {
          timeout: 120_000,
          waitUntil: "domcontentloaded",
        });
      } catch (err) {
        console.warn(`[Main] Failed to load ${candidateUrl}:`, err);
        continue;
      }

      // Probe WebGPU availability on the first successfully loaded page.
      // WebGPU requires a secure context — localhost qualifies but about:blank
      // does NOT, so the probe must run after navigating to a real page.
      if (!webgpuProbed) {
        webgpuProbed = true;
        const webgpuAvailable = await page.evaluate(async () => {
          if (!navigator.gpu)
            return { available: false, reason: "navigator.gpu is undefined" };
          try {
            const adapter = await navigator.gpu.requestAdapter();
            if (!adapter)
              return {
                available: false,
                reason: "requestAdapter() returned null",
              };
            const info = (
              adapter as unknown as {
                info?: { vendor?: string; architecture?: string };
              }
            ).info;
            return {
              available: true,
              reason: `adapter OK — vendor=${info?.vendor ?? "unknown"}, arch=${info?.architecture ?? "unknown"}`,
            };
          } catch (e) {
            return { available: false, reason: `requestAdapter() threw: ${e}` };
          }
        });
        if (webgpuAvailable.available) {
          console.log(`[Main] WebGPU probe: ${webgpuAvailable.reason}`);
        } else {
          console.error(
            `[Main] WebGPU probe FAILED: ${webgpuAvailable.reason}`,
          );
          console.error(
            "[Main] WebGPU is REQUIRED. Ensure: headful mode (not headless), " +
              "GPU drivers installed, DISPLAY set (Xvfb on Linux), " +
              "--use-gl=angle + --use-angle=vulkan, --enable-features=DefaultANGLEVulkan,Vulkan,VulkanFromANGLE,WebGPU,UnsafeWebGPU.",
          );
        }
      }

      if (USE_TIMED_STREAM_WARMUP) {
        console.log(
          `[Main] Using timed warmup (${STREAM_CAPTURE_WARMUP_MS}ms) for ${candidateUrl}; skipping in-page readiness probe on headed Linux CDP capture.`,
        );
        await page.waitForTimeout(STREAM_CAPTURE_WARMUP_MS);
        selectedGameUrl = candidateUrl;
        break;
      }

      console.log(`[Main] Waiting for stream readiness on ${candidateUrl}...`);
      const isReady = await waitForStreamReadiness(page, streamReadyTimeoutMs);
      if (isReady) {
        selectedGameUrl = candidateUrl;
        break;
      }
      console.warn(
        `[Main] Stream readiness not detected on ${candidateUrl}, trying fallback...`,
      );
    }
  } else {
    try {
      await page.goto(selectedGameUrl, {
        timeout: 120_000,
        waitUntil: "domcontentloaded",
      });
    } catch (err) {
      console.error(
        `[Main] Failed to reload configured URL ${selectedGameUrl}`,
        err,
      );
    }
  }

  if (!selectedGameUrl) {
    console.error(
      `[Main] Could not find a game canvas on any candidate URL: ${GAME_URL_CANDIDATES.join(", ")}`,
    );
    console.error(
      "[Main] Make sure the game client is running and supports stream/spectator mode.",
    );
    await cleanup();
    process.exit(1);
  }

  console.log(`[Main] Using game page: ${selectedGameUrl}`);
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
  cdpSession.on("Page.screencastFrame", (params) => {
    void (async () => {
      try {
        const { sessionId, data: base64Data } = params;

        // Acknowledge the frame immediately to request the next one
        try {
          await cdpSession?.send("Page.screencastFrameAck", { sessionId });
        } catch {
          // Session may have been destroyed during page navigation
        }

        // Decode base64 JPEG and feed to FFmpeg
        const jpegBuffer = Buffer.from(base64Data, "base64");
        const written = bridge.feedFrame(jpegBuffer);

        if (written) {
          cdpFrameCount++;
        } else {
          cdpDroppedFrames++;
        }
      } catch (err) {
        if (!isTransientPageEvalError(err)) {
          console.warn("[CDP] Frame handling error:", errMsg(err));
        }
      }
    })();
  });

  // Start the screencast
  await withTimeout(
    cdpSession.send("Page.startScreencast", {
      format: "jpeg",
      quality: CDP_QUALITY,
      maxWidth: VIEWPORT.width,
      maxHeight: VIEWPORT.height,
      everyNthFrame: 1, // Capture every frame
    }),
    10_000,
    "Page.startScreencast",
  );

  console.log("[CDP] ✅ Screencast capture started — frames piping to FFmpeg");
}

async function startCdpCaptureWithRecovery(
  bridge: ReturnType<typeof getRTMPBridge>,
): Promise<void> {
  try {
    await startCdpCapture(bridge);
  } catch (err) {
    if (!isTransientPageEvalError(err)) {
      throw err;
    }

    console.warn(
      `[CDP] Initial screencast setup failed (${errMsg(err)}); retrying with a fresh browser session...`,
    );
    await stopCdpCapture().catch(() => undefined);
    await setupBrowser();
    await startCdpCaptureWithRecovery(bridge);
  }
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

  if (
    !REQUIRE_IN_PAGE_READY_PROBE &&
    selectedGameUrl?.includes("?page=stream") &&
    !selectedGameUrl.includes("disableBridgeCapture=1")
  ) {
    console.log(
      "[Main] Relying on built-in stream-page bridge capture; skipping Playwright MediaRecorder injection.",
    );
    return null;
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
  lastChunkMs?: number;
  captureFps?: number;
};

async function getBrowserCaptureStatus(): Promise<BrowserCaptureStatus | null> {
  if (!page || page.isClosed()) return null;

  try {
    return (await page.evaluate(() => {
      return (
        window as unknown as {
          __captureControl__?: { getStatus: () => unknown };
        }
      ).__captureControl__?.getStatus?.();
    })) as BrowserCaptureStatus | null;
  } catch (err) {
    if (isTransientPageEvalError(err)) return null;
    throw err;
  }
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
    const captureStatus = await getBrowserCaptureStatus();
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
  let activeCaptureMode: ActiveCaptureMode = CAPTURE_MODE;
  let statusSnapshotInterval: ReturnType<typeof setInterval> | null = null;

  // Start Spectator Server for zero-latency WebSockets stream
  bridge.startSpectatorServer(SPECTATOR_PORT);
  writeExternalStatusSnapshot(bridge, activeCaptureMode);
  statusSnapshotInterval = setInterval(() => {
    writeExternalStatusSnapshot(bridge, activeCaptureMode);
  }, 2000);

  // Setup browser
  await setupBrowser();

  let captureWatchdog: ReturnType<typeof setInterval> | null = null;
  let cdpStalledIntervals = 0;
  let lastCdpBytesReceived = 0;
  let cdpRecoveryInFlight = false;
  let cdpRecoveryFailures = 0;
  let browserCaptureStalledIntervals = 0;
  let lastBrowserBytesReceived = 0;
  let browserCaptureRecoveryInFlight = false;

  const fallbackBrowserCaptureToCdp = async (
    reason: string,
  ): Promise<boolean> => {
    if (browserCaptureRecoveryInFlight) {
      console.warn(
        "[Main] Browser capture fallback already in progress; skipping duplicate request.",
      );
      return false;
    }

    browserCaptureRecoveryInFlight = true;
    console.warn(`[Main] ${reason} Falling back to CDP capture.`);

    try {
      if (captureWatchdog) {
        clearInterval(captureWatchdog);
        captureWatchdog = null;
      }
      await withTimeout(
        stopInPageCaptureControl(),
        5_000,
        "Stop browser capture control",
      ).catch(() => undefined);
      bridge.stop();
      bridge.startSpectatorServer(SPECTATOR_PORT);
      await withTimeout(
        (async () => {
          await setupBrowser();
          await startCdpCaptureWithRecovery(bridge);
        })(),
        CAPTURE_RECOVERY_TIMEOUT_MS,
        "Browser capture fallback to CDP",
      );
      activeCaptureMode = "cdp";
      cdpStalledIntervals = 0;
      cdpRecoveryFailures = 0;
      browserCaptureStalledIntervals = 0;
      lastBrowserBytesReceived = 0;
      lastCdpBytesReceived = bridge.getStats().bytesReceived;
      console.log("[Main] Browser capture fallback to CDP complete");
      return true;
    } catch (err) {
      console.error(
        "[Main] Browser capture fallback to CDP failed:",
        errMsg(err),
      );
      return false;
    } finally {
      browserCaptureRecoveryInFlight = false;
    }
  };

  if (CAPTURE_MODE === "cdp") {
    // ── CDP Mode: Direct screencast frame piping ──
    try {
      await startCdpCaptureWithRecovery(bridge);
    } catch (err) {
      const canFallbackToLegacy =
        process.platform === "linux" && !STREAM_CAPTURE_HEADLESS;
      if (!canFallbackToLegacy) {
        throw err;
      }
      console.warn(
        `[Main] CDP capture unavailable (${errMsg(err)}). Falling back to MediaRecorder bridge capture.`,
      );
      await stopCdpCapture().catch(() => undefined);
      bridge.stopProcessing();
      captureWatchdog = (await startLegacyCapture(bridge)) ?? null;
      activeCaptureMode = "mediarecorder";
    }
  } else if (CAPTURE_MODE === "webcodecs") {
    // ── WebCodecs Mode: Native VideoEncoder API to FFmpeg -c:v copy ──
    captureWatchdog = (await startWebCodecsCapture(bridge)) ?? null;
    const healthy = await waitForCaptureTraffic(bridge, 20000);
    if (!healthy) {
      await fallbackBrowserCaptureToCdp(
        "WebCodecs capture produced no media within 20s.",
      );
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
              await setupBrowser();
              await startCdpCaptureWithRecovery(bridge);
            })(),
            CAPTURE_RECOVERY_TIMEOUT_MS,
            "CDP restart",
          );
          recovered = true;
          cdpRecoveryFailures = 0;
          lastCdpBytesReceived = bridge.getStats().bytesReceived;
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
            "[Main] Falling back to MediaRecorder capture mode after CDP stall.",
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
            captureWatchdog = (await startLegacyCapture(bridge)) ?? null;
            activeCaptureMode = "mediarecorder";
            lastCdpBytesReceived = bridge.getStats().bytesReceived;
            cdpRecoveryFailures = 0;
            console.log("[Main] Fallback to MediaRecorder mode complete");
          } catch (fallbackErr) {
            console.error(
              "[Main] MediaRecorder fallback failed:",
              errMsg(fallbackErr),
            );
          }
        }
      }
    } else {
      try {
        const captureStatus = await getBrowserCaptureStatus();
        const bytesDelta = stats.bytesReceived - lastBrowserBytesReceived;
        lastBrowserBytesReceived = stats.bytesReceived;
        const hasMeaningfulTraffic = bytesDelta > 16 * 1024;
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

        if (activeCaptureMode === "webcodecs") {
          const captureLooksConnected =
            captureStatus?.recording === true ||
            captureStatus?.wsConnected === true;
          const captureLooksHealthy =
            bridgeStatus.ffmpegRunning && hasMeaningfulTraffic;
          if (captureLooksHealthy || !captureLooksConnected) {
            browserCaptureStalledIntervals = 0;
          } else {
            browserCaptureStalledIntervals += 1;
          }

          if (browserCaptureStalledIntervals >= 2) {
            browserCaptureStalledIntervals = 0;
            await fallbackBrowserCaptureToCdp(
              "WebCodecs capture stalled after startup.",
            );
          }
        }
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
            await startCdpCaptureWithRecovery(bridge);
          } else if (activeCaptureMode === "mediarecorder") {
            captureWatchdog = (await startLegacyCapture(bridge)) ?? null;
          }
        } catch (err) {
          console.error("[Main] Failed to rotate browser!", err);
        }
      }
    }
  }, 30000);

  // Handle shutdown
  const shutdown = async () => {
    console.log("\n[Main] Shutting down...");
    if (captureWatchdog) clearInterval(captureWatchdog);
    if (statusSnapshotInterval) clearInterval(statusSnapshotInterval);
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

    process.exit(0);
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
    if (browserContext) {
      await browserContext.close();
      browserContext = null;
      browser = null;
    } else {
      await browser.close();
      browser = null;
    }
  } else if (browserContext) {
    await browserContext.close();
    browserContext = null;
  }

  if (persistentUserDataDir) {
    try {
      fs.rmSync(persistentUserDataDir, { recursive: true, force: true });
    } catch {
      // Ignore temporary profile cleanup failures.
    }
    persistentUserDataDir = null;
    browser = null;
  }

  clearExternalStatusSnapshot();
  console.log("[Main] Cleanup complete");
}

// Run
main().catch((err) => {
  console.error("[Main] Fatal error:", err);
  cleanup().then(() => process.exit(1));
});

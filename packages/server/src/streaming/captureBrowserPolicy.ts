type CaptureReadinessDiagnostics = {
  hasCanvas: boolean;
  hasStreamingBootUi: boolean;
  hasCriticalErrorUi: boolean;
  readyFlag: boolean;
  bootDiagnostics?: unknown;
};

export type CaptureRendererHealthSnapshot = {
  ready: boolean;
  degradedReason: string | null;
  diagnostics: CaptureReadinessDiagnostics | null;
};

export function buildDefaultCaptureLaunchArgs(params: {
  angleBackend: string;
  featureFlags: string;
  disableSandbox?: boolean;
}): string[] {
  return [
    "--use-gl=angle",
    `--use-angle=${params.angleBackend}`,
    "--enable-webgl",
    "--enable-unsafe-webgpu",
    params.featureFlags,
    "--ignore-gpu-blocklist",
    "--enable-gpu-rasterization",
    ...(params.disableSandbox ? ["--no-sandbox"] : []),
    "--disable-dev-shm-usage",
    "--autoplay-policy=no-user-gesture-required",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--disable-hang-monitor",
    // Persist browser profile so IndexedDB (VRM model cache), Service
    // Worker cache, and WebGPU shader cache survive Tier-3 browser
    // restarts. On cold boot the profile is empty and populates during
    // the first session; on warm Tier-2 restarts the browser stays alive
    // so this dir is already warm. On Tier-3 (browser crash → relaunch)
    // the profile directory persists on disk and Chrome reloads it.
    "--user-data-dir=/tmp/hyperscape-capture-profile",
    // Remove compositor frame-rate ceiling so the WebGPU renderer can
    // produce as many unique frames as the scene allows. Without this,
    // Xvfb virtual displays that report 0 Hz cause Chrome to render at
    // <5 fps. With it, rendering is limited only by GPU/CPU capacity.
    "--disable-frame-rate-limit",
  ];
}

export function resolveAllowedCaptureOrigins(
  rawUrls: readonly string[],
): string[] {
  const origins = new Set<string>();
  for (const rawUrl of rawUrls) {
    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        origins.add(parsed.origin);
      }
    } catch {
      // Ignore malformed candidate URLs here; startup will fail when it tries
      // to navigate to them.
    }
  }
  return [...origins];
}

export function resolveUnexpectedCaptureOrigin(
  rawUrl: string,
  allowedOrigins: readonly string[],
): string | null {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return parsed.origin;
    }
    return allowedOrigins.includes(parsed.origin) ? null : parsed.origin;
  } catch {
    return rawUrl;
  }
}

export function shouldAcceptCaptureReadiness(params: {
  snapshot: CaptureRendererHealthSnapshot;
  startedAt: number;
  nowMs: number;
  bootUiGraceMs?: number;
}): boolean {
  const { snapshot, startedAt, nowMs } = params;
  if (snapshot.ready) {
    return true;
  }

  if (snapshot.diagnostics?.hasCriticalErrorUi) {
    return false;
  }

  if (
    snapshot.degradedReason &&
    snapshot.degradedReason !== "loading_overlay_active"
  ) {
    return false;
  }

  return (
    snapshot.diagnostics?.hasStreamingBootUi === true &&
    nowMs - startedAt >= (params.bootUiGraceMs ?? 180_000)
  );
}

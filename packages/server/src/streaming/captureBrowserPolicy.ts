type CaptureReadinessDiagnostics = {
  hasCanvas: boolean;
  hasStreamingBootUi: boolean;
  hasCriticalErrorUi: boolean;
  readyFlag: boolean;
};

export type CaptureRendererHealthSnapshot = {
  ready: boolean;
  degradedReason: string | null;
  diagnostics: CaptureReadinessDiagnostics | null;
};

const CAPTURE_BOOT_GRACE_MS = 60_000;

function isNonFatalBootReason(reason: string | null): boolean {
  return (
    reason === "loading_overlay_active" ||
    reason === "waiting_for_duel_data" ||
    reason === "stream_state_missing" ||
    reason === "world_not_ready" ||
    reason === "terrain_not_ready" ||
    reason === "camera_target_unresolved" ||
    reason === "avatar_not_ready"
  );
}

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

  if (!isNonFatalBootReason(snapshot.degradedReason)) {
    return false;
  }

  return (
    snapshot.diagnostics?.hasCanvas === true &&
    nowMs - startedAt >= (params.bootUiGraceMs ?? CAPTURE_BOOT_GRACE_MS)
  );
}

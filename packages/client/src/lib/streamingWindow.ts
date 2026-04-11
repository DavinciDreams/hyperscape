export type PublicRuntimeEnv = {
  PUBLIC_CDN_URL?: string;
  PUBLIC_ASSETS_URL?: string;
  PUBLIC_WS_URL?: string;
  PUBLIC_API_URL?: string;
  PUBLIC_APP_URL?: string;
  PUBLIC_EMBED_ALLOWED_ORIGINS?: string;
  PUBLIC_STREAMING_VIEWER_ACCESS_TOKEN?: string;
};

export type StreamingWindowRendererHealth = {
  ready: boolean;
  degradedReason: string | null;
  updatedAt: number;
  phase: string | null;
};

export type StreamingWindowHeartbeat = {
  renderTick: number;
  latestRenderTickAt: number | null;
  duelStateTick: number;
  latestDuelStateTickAt: number | null;
};

export type StreamingWindowBootDiagnostics = {
  updatedAt: number;
  connected: boolean;
  worldReady: boolean;
  terrainReady: boolean;
  terrainStalled: boolean;
  terrain: {
    systemPresent: boolean;
    isReady: boolean | null;
    initialized: boolean | null;
    activeChunks: number | null;
    pendingChunks: number | null;
    loadedTiles: number | null;
  };
  cameraTarget: string | null;
  cameraLocked: boolean;
  targetEntityPresent: boolean | null;
  needsCameraLock: boolean;
  needsTargetAvatar: boolean;
  targetAvatarReady: boolean;
  targetAvatarGraceExpired: boolean;
  phase: string | null;
  hasStreamingState: boolean;
};

export type CaptureControlStatus = {
  recording?: boolean;
  wsConnected?: boolean;
  chunkCount?: number;
  bytesSent?: number;
  uptime?: number;
  lastChunkAt?: number | null;
  lastChunkAgeMs?: number | null;
  lastChunkMs?: number | null;
  wsBufferedAmount?: number;
  heapUsedBytes?: number | null;
  heapLimitBytes?: number | null;
};

export type StreamingWindow = Window & {
  env?: PublicRuntimeEnv;
  __CDN_URL?: string;
  __ASSETS_URL?: string;
  __HYPERSCAPE_STREAM_READY__?: boolean;
  __HYPERSCAPE_STREAM_RENDERER_HEALTH__?: StreamingWindowRendererHealth | null;
  __HYPERSCAPE_STREAM_HEARTBEAT__?: StreamingWindowHeartbeat | null;
  __HYPERSCAPE_STREAM_BOOT_DIAGNOSTICS__?: StreamingWindowBootDiagnostics | null;
  __HYPERSCAPE_STREAM_CAPTURE_SESSION_GENERATION__?: string | null;
  /**
   * Boot/loading phase indicator read by the capture pipeline's renderer
   * health probe. Set during the loading overlay lifecycle and cleared once
   * the stream is fully ready. Values match the probe's detection categories:
   * - "connecting" | "initializing" | "loading_assets" | "finalizing"
   * - "error:webgpu_required" | "error:init_failed" | "error:http"
   * - null when boot is complete
   */
  __HYPERSCAPE_STREAM_BOOT_STATUS__?: string | null;
  /** In-page capture control exposed for deduplication and status queries. */
  __captureControl__?: {
    stop?: () => void;
    getStatus?: () => CaptureControlStatus;
  };
  __captureStatus__?: CaptureControlStatus;
};

function normalizeBaseUrl(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function isProblematicCaptureAssetHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname === "::1" ||
    hostname.endsWith(".sslip.io")
  );
}

export function resolveCaptureAssetBase(
  assetBaseUrl: string | undefined,
  apiBaseUrl: string | undefined,
  pageUrl: string,
): string | null {
  if (!assetBaseUrl) return null;

  try {
    const page = new URL(pageUrl);
    const asset = new URL(assetBaseUrl, page);
    if (
      asset.origin !== page.origin &&
      isProblematicCaptureAssetHost(asset.hostname) &&
      apiBaseUrl
    ) {
      const api = new URL(apiBaseUrl, page);
      return normalizeBaseUrl(new URL("/game-assets", api.origin).toString());
    }
    return normalizeBaseUrl(asset.toString());
  } catch {
    return normalizeBaseUrl(assetBaseUrl);
  }
}

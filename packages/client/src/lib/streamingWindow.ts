export type PublicRuntimeEnv = {
  PUBLIC_CDN_URL?: string;
  PUBLIC_ASSETS_URL?: string;
  PUBLIC_WS_URL?: string;
  PUBLIC_API_URL?: string;
  PUBLIC_APP_URL?: string;
  PUBLIC_EMBED_ALLOWED_ORIGINS?: string;
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

export type CaptureControlStatus = {
  recording?: boolean;
  wsConnected?: boolean;
  chunkCount?: number;
  bytesSent?: number;
  uptime?: number;
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

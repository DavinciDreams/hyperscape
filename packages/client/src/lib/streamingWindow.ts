export type PublicRuntimeEnv = {
  PUBLIC_CDN_URL?: string;
  PUBLIC_WS_URL?: string;
  PUBLIC_API_URL?: string;
};

export type StreamingWindowRendererHealth = {
  ready: boolean;
  degradedReason: string | null;
  updatedAt: number;
  phase: string | null;
};

export type StreamingWindowCaptureStatus = {
  recording: boolean;
  wsConnected: boolean;
  chunkCount: number;
  bytesSent: number;
  uptime: number;
  lastChunkMs: number | null;
  wsBufferedAmount: number;
  heapUsedBytes: number | null;
  heapLimitBytes: number | null;
};

export type StreamingWindowCaptureControl = {
  stop?: () => void;
  getStatus?: () => StreamingWindowCaptureStatus;
};

export type StreamingWindow = Window & {
  env?: PublicRuntimeEnv;
  __CDN_URL?: string;
  __HYPERSCAPE_STREAM_READY__?: boolean;
  __HYPERSCAPE_STREAM_RENDERER_HEALTH__?: StreamingWindowRendererHealth | null;
  __HYPERSCAPE_STREAM_BOOT_STATUS__?: string | null;
  __captureControl__?: StreamingWindowCaptureControl;
  __captureStatus__?: StreamingWindowCaptureStatus;
};

export type StreamDeliveryMode = "self_hls" | "external_hls";

export type StreamDeliveryInfo = {
  mode: StreamDeliveryMode;
  provider: string | null;
  playbackUrl: string | null;
  hlsUrl: string | null;
  llhlsUrl: string | null;
  ingestUrl: string | null;
};

function asNonEmptyString(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeDeliveryMode(
  rawValue: string | undefined,
  options: {
    hasExternalPlayback: boolean;
    hasExternalIngest: boolean;
  },
): StreamDeliveryMode {
  const normalized = (rawValue || "").trim().toLowerCase();
  if (normalized === "external_hls") {
    return "external_hls";
  }
  if (normalized === "self_hls") {
    return "self_hls";
  }
  if (options.hasExternalPlayback || options.hasExternalIngest) {
    return "external_hls";
  }
  return "self_hls";
}

export function resolveStreamDeliveryInfo(
  env: NodeJS.ProcessEnv = process.env,
): StreamDeliveryInfo {
  const hlsUrl = asNonEmptyString(env.STREAM_PLAYBACK_HLS_URL);
  const llhlsUrl = asNonEmptyString(env.STREAM_PLAYBACK_LLHLS_URL);
  const ingestUrl = asNonEmptyString(env.STREAM_INGEST_RTMPS_URL);
  const mode = normalizeDeliveryMode(env.STREAM_DELIVERY_MODE, {
    hasExternalPlayback: Boolean(hlsUrl || llhlsUrl),
    hasExternalIngest: Boolean(ingestUrl),
  });

  return {
    mode,
    provider: asNonEmptyString(env.STREAM_DELIVERY_PROVIDER),
    playbackUrl:
      mode === "external_hls" ? llhlsUrl ?? hlsUrl : hlsUrl ?? llhlsUrl,
    hlsUrl,
    llhlsUrl,
    ingestUrl,
  };
}

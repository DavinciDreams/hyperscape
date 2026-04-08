export type StreamDeliveryMode = "self_hls" | "external_hls";
export type StreamDestinationRole = "canonical" | "fallback" | "mirror";
export type StreamDestinationProvider =
  | "cloudflare_stream"
  | "self_hls"
  | "twitch"
  | "kick"
  | "youtube"
  | "custom";
export type StreamDeliveryTransport =
  | "llhls"
  | "hls"
  | "rtmps"
  | "srt"
  | "unknown";
export type StreamManifestStatus = "ok" | "stale" | "missing" | "unknown";
export type StreamPublicReadiness = {
  ready: boolean;
  reason: string | null;
  updatedAt: number | null;
};
export type StreamDestinationState = {
  id: string;
  name: string;
  role: StreamDestinationRole;
  provider: StreamDestinationProvider;
  transport: StreamDeliveryTransport;
  playbackUrl: string | null;
  ingestUrl: string | null;
  connected: boolean;
  transportHealthy: boolean;
  playbackReady: boolean;
  manifestStatus: StreamManifestStatus;
  lastError: string | null;
  updatedAt: number | null;
};
export type StreamChannelState = {
  id: string;
  mode: "always_on";
  presentationDelayMs: number;
  activeDuelId: string | null;
  activeDuelKey: string | null;
  canonicalDestinationId: string;
  fallbackDestinationId: string | null;
  publicPlaybackUrl: string | null;
  publicReadiness: StreamPublicReadiness;
  destinations: StreamDestinationState[];
};

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

function normalizePrefix(value: string | null): string {
  if (!value) return "live/";
  const trimmed = value.trim().replace(/^\/+/, "").replace(/\/+$/, "");
  return trimmed ? `${trimmed}/` : "live/";
}

function normalizeDeliveryMode(
  rawValue: string | undefined,
  options: {
    hasExternalPlayback: boolean;
  },
): StreamDeliveryMode {
  const normalized = (rawValue || "").trim().toLowerCase();
  if (normalized === "external_hls" && options.hasExternalPlayback) {
    return "external_hls";
  }
  if (normalized === "self_hls") {
    return "self_hls";
  }
  if (options.hasExternalPlayback) {
    return "external_hls";
  }
  return "self_hls";
}

export function resolveStreamDeliveryInfo(
  env: NodeJS.ProcessEnv = process.env,
): StreamDeliveryInfo {
  const playbackUrl = asNonEmptyString(env.STREAM_PLAYBACK_URL);
  const hlsUrl = asNonEmptyString(env.STREAM_PLAYBACK_HLS_URL);
  const llhlsUrl = asNonEmptyString(env.STREAM_PLAYBACK_LLHLS_URL);
  const ingestUrl = asNonEmptyString(env.STREAM_INGEST_RTMPS_URL);
  const hasExternalPlayback = Boolean(hlsUrl || llhlsUrl);
  const mode = normalizeDeliveryMode(env.STREAM_DELIVERY_MODE, {
    hasExternalPlayback,
  });

  return {
    mode,
    provider:
      mode === "external_hls"
        ? asNonEmptyString(env.STREAM_DELIVERY_PROVIDER)
        : null,
    playbackUrl:
      mode === "external_hls"
        ? llhlsUrl ?? hlsUrl
        : playbackUrl ?? (hasExternalPlayback ? null : hlsUrl ?? llhlsUrl),
    hlsUrl: mode === "external_hls" ? hlsUrl : null,
    llhlsUrl: mode === "external_hls" ? llhlsUrl : null,
    ingestUrl: mode === "external_hls" ? ingestUrl : null,
  };
}

export function normalizeStreamDestinationProvider(
  value: string | null | undefined,
  name: string | null | undefined = null,
): StreamDestinationProvider {
  const normalized = (value || name || "").trim().toLowerCase();
  if (!normalized) return "custom";
  if (
    normalized.includes("cloudflare") ||
    normalized.includes("cloudflare_stream")
  ) {
    return "cloudflare_stream";
  }
  if (normalized.includes("self_hls") || normalized.includes("self-hls")) {
    return "self_hls";
  }
  if (normalized.includes("twitch")) {
    return "twitch";
  }
  if (normalized.includes("kick")) {
    return "kick";
  }
  if (normalized.includes("youtube")) {
    return "youtube";
  }
  return "custom";
}

export function inferStreamDeliveryTransport(params: {
  playbackUrl?: string | null;
  ingestUrl?: string | null;
}): StreamDeliveryTransport {
  const playbackUrl = params.playbackUrl?.trim().toLowerCase() ?? "";
  const ingestUrl = params.ingestUrl?.trim().toLowerCase() ?? "";
  if (playbackUrl.includes("protocol=llhls")) {
    return "llhls";
  }
  if (playbackUrl.endsWith(".m3u8")) {
    return "hls";
  }
  if (ingestUrl.startsWith("srt://")) {
    return "srt";
  }
  if (ingestUrl.startsWith("rtmp://") || ingestUrl.startsWith("rtmps://")) {
    return "rtmps";
  }
  return "unknown";
}

function slugify(value: string | null | undefined, fallback: string): string {
  const normalized = (value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

export function buildStreamDestinationId(params: {
  role: StreamDestinationRole;
  provider: StreamDestinationProvider;
  name?: string | null;
}): string {
  const { role, provider, name } = params;
  if (role === "canonical" && provider === "cloudflare_stream") {
    return "canonical-cloudflare";
  }
  if (role === "fallback" && provider === "self_hls") {
    return "fallback-self-hls";
  }
  if (role === "mirror" && provider === "twitch") {
    return "mirror-twitch";
  }
  if (role === "mirror" && provider === "kick") {
    return "mirror-kick";
  }
  if (role === "mirror" && provider === "youtube") {
    return "mirror-youtube";
  }
  return `${role}-${slugify(name ?? provider, provider)}`;
}

export function resolveSelfHostedStreamPlaybackUrl(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const explicit = asNonEmptyString(env.STREAM_PLAYBACK_URL);
  if (explicit) {
    return explicit;
  }

  const publicUrl = asNonEmptyString(env.HLS_CDN_PUBLIC_URL);
  if (publicUrl) {
    const prefix = normalizePrefix(asNonEmptyString(env.HLS_CDN_PREFIX));
    return `${publicUrl.replace(/\/$/, "")}/${prefix}stream.m3u8`;
  }

  return "/live/stream.m3u8";
}

export function resolveStreamPresentationDelayMs(
  env: NodeJS.ProcessEnv = process.env,
  mode: StreamDeliveryMode = resolveStreamDeliveryInfo(env).mode,
): number {
  const parsed = Number(env.STREAM_PRESENTATION_DELAY_MS);
  if (Number.isFinite(parsed)) {
    return Math.max(0, parsed);
  }
  return mode === "external_hls" ? 4_000 : 0;
}

export type StreamIngestProfile = "default" | "cloudflare_live";
export type StreamIngestTransport = "rtmps" | "srt";

export type StreamIngestSettings = {
  profile: StreamIngestProfile;
  transport: StreamIngestTransport;
  audioSampleRate: number;
  gopFrames: number;
  probeOnly: boolean;
  srtUrl: string | null;
  srtStreamId: string | null;
  srtPassphrase: string | null;
};

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value == null) return fallback;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return fallback;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function parsePositiveInt(
  value: string | undefined,
  fallback: number,
  minValue: number,
): number {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minValue, parsed);
}

function asNonEmptyString(value: string | undefined): string | null {
  const trimmed = value?.trim() || "";
  return trimmed.length > 0 ? trimmed : null;
}

export function resolveStreamIngestSettings(
  env: NodeJS.ProcessEnv,
): StreamIngestSettings {
  const profile =
    env.STREAM_INGEST_PROFILE?.trim() === "cloudflare_live"
      ? "cloudflare_live"
      : "default";
  const transport =
    env.STREAM_INGEST_TRANSPORT?.trim().toLowerCase() === "srt"
      ? "srt"
      : "rtmps";
  const defaultFps = parsePositiveInt(env.STREAM_FPS, 30, 1);
  const defaultGopFrames =
    profile === "cloudflare_live"
      ? Math.max(2, defaultFps * 2)
      : parsePositiveInt(env.STREAM_GOP_SIZE, defaultFps, 1);
  const gopFrames = parsePositiveInt(
    env.STREAM_GOP_SIZE,
    defaultGopFrames,
    1,
  );
  const audioSampleRate = parsePositiveInt(
    env.STREAM_AUDIO_SAMPLE_RATE,
    profile === "cloudflare_live" ? 48_000 : 44_100,
    8_000,
  );

  return {
    profile,
    transport,
    audioSampleRate,
    gopFrames,
    probeOnly: parseBoolean(env.STREAM_CLOUDFLARE_PROBE_ONLY, false),
    srtUrl: asNonEmptyString(env.STREAM_INGEST_SRT_URL),
    srtStreamId: asNonEmptyString(env.STREAM_INGEST_SRT_STREAM_ID),
    srtPassphrase: asNonEmptyString(env.STREAM_INGEST_SRT_PASSPHRASE),
  };
}


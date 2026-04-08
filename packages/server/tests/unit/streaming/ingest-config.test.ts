import { describe, expect, it } from "vitest";
import { resolveStreamIngestSettings } from "../../../src/streaming/ingest-config.js";

describe("resolveStreamIngestSettings", () => {
  it("defaults cloudflare_live to 2-second GOP and 48k audio", () => {
    const settings = resolveStreamIngestSettings({
      STREAM_INGEST_PROFILE: "cloudflare_live",
      STREAM_FPS: "30",
    });

    expect(settings).toMatchObject({
      profile: "cloudflare_live",
      transport: "rtmps",
      audioSampleRate: 48_000,
      gopFrames: 60,
      probeOnly: false,
    });
  });

  it("resolves explicit SRT transport settings", () => {
    const settings = resolveStreamIngestSettings({
      STREAM_INGEST_PROFILE: "cloudflare_live",
      STREAM_INGEST_TRANSPORT: "srt",
      STREAM_INGEST_SRT_URL: "srt://live.cloudflare.com:778",
      STREAM_INGEST_SRT_STREAM_ID: "abc123",
      STREAM_INGEST_SRT_PASSPHRASE: "secret",
      STREAM_CLOUDFLARE_PROBE_ONLY: "true",
      STREAM_AUDIO_SAMPLE_RATE: "48000",
      STREAM_GOP_SIZE: "60",
    });

    expect(settings).toMatchObject({
      profile: "cloudflare_live",
      transport: "srt",
      audioSampleRate: 48_000,
      gopFrames: 60,
      probeOnly: true,
      srtUrl: "srt://live.cloudflare.com:778",
      srtStreamId: "abc123",
      srtPassphrase: "secret",
    });
  });
});


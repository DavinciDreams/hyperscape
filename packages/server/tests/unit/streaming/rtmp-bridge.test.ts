import { afterEach, describe, expect, it } from "vitest";
import { RTMPBridge } from "../../../src/streaming/rtmp-bridge.js";

const ENV_KEYS = [
  "FFMPEG_HWACCEL",
  "STREAM_INGEST_PROFILE",
  "STREAM_INGEST_TRANSPORT",
  "STREAM_AUDIO_SAMPLE_RATE",
  "STREAM_GOP_SIZE",
  "STREAM_CLOUDFLARE_PROBE_ONLY",
  "STREAM_FPS",
  "STREAM_DELIVERY_MODE",
  "STREAM_DELIVERY_PROVIDER",
  "STREAM_PLAYBACK_URL",
  "STREAM_PLAYBACK_HLS_URL",
  "STREAM_PLAYBACK_LLHLS_URL",
  "STREAM_INGEST_RTMPS_URL",
  "STREAM_INGEST_STREAM_KEY",
  "STREAM_INGEST_SRT_URL",
  "STREAM_INGEST_SRT_STREAM_ID",
  "STREAM_INGEST_SRT_PASSPHRASE",
  "HLS_OUTPUT_PATH",
  "HLS_SEGMENT_PATTERN",
] as const;

const ORIGINAL_ENV = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]]),
) as Record<(typeof ENV_KEYS)[number], string | undefined>;

function restoreEnv(): void {
  for (const key of ENV_KEYS) {
    const value = ORIGINAL_ENV[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

afterEach(() => {
  restoreEnv();
});

describe("RTMPBridge Cloudflare ingest profile", () => {
  it("builds Cloudflare-safe NVENC args", () => {
    process.env.FFMPEG_HWACCEL = "nvidia";
    process.env.STREAM_INGEST_PROFILE = "cloudflare_live";
    process.env.STREAM_AUDIO_SAMPLE_RATE = "48000";
    process.env.STREAM_GOP_SIZE = "60";
    process.env.STREAM_FPS = "30";

    const bridge = new RTMPBridge();
    const videoArgs = (bridge as any).buildVideoEncoderArgs() as string[];
    const audioArgs = (bridge as any).buildAudioArgs() as string[];

    expect(videoArgs).toEqual(
      expect.arrayContaining([
        "-c:v",
        "h264_nvenc",
        "-preset",
        "llhq",
        "-rc",
        "cbr",
        "-multipass",
        "disabled",
        "-g",
        "60",
        "-bf",
        "0",
        "-forced-idr",
        "1",
        "-zerolatency",
        "1",
        "-strict_gop",
        "1",
        "-rc-lookahead",
        "0",
        "-profile:v",
        "high",
        "-level",
        "4.1",
      ]),
    );
    expect(audioArgs).toEqual(
      expect.arrayContaining(["-ar", "48000", "-c:a", "aac"]),
    );
  });

  it("builds Cloudflare-safe libx264 args", () => {
    process.env.FFMPEG_HWACCEL = "cpu";
    process.env.STREAM_INGEST_PROFILE = "cloudflare_live";
    process.env.STREAM_AUDIO_SAMPLE_RATE = "48000";
    process.env.STREAM_GOP_SIZE = "60";
    process.env.STREAM_FPS = "30";

    const bridge = new RTMPBridge();
    const videoArgs = (bridge as any).buildVideoEncoderArgs() as string[];
    const audioInputArgs = (bridge as any).buildBridgeAudioInputArgs() as string[];

    expect(videoArgs).toEqual(
      expect.arrayContaining([
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-tune",
        "zerolatency",
        "-g",
        "60",
        "-keyint_min",
        "60",
        "-sc_threshold",
        "0",
        "-bf",
        "0",
        "-forced-idr",
        "1",
        "-profile:v",
        "high",
        "-level",
        "4.1",
        "-x264-params",
        "nal-hrd=cbr:force-cfr=1:open-gop=0",
      ]),
    );
    expect(audioInputArgs).toEqual(
      expect.arrayContaining(["-i", "anullsrc=r=48000:cl=stereo"]),
    );
  });

  it("removes local HLS tee output in probe-only mode", () => {
    process.env.STREAM_INGEST_PROFILE = "cloudflare_live";
    process.env.STREAM_CLOUDFLARE_PROBE_ONLY = "true";
    process.env.STREAM_DELIVERY_MODE = "external_hls";
    process.env.STREAM_DELIVERY_PROVIDER = "cloudflare_stream";
    process.env.STREAM_PLAYBACK_URL =
      "https://videodelivery.net/test/manifest/video.m3u8";
    process.env.STREAM_PLAYBACK_HLS_URL =
      "https://videodelivery.net/test/manifest/video.m3u8";
    process.env.STREAM_PLAYBACK_LLHLS_URL =
      "https://videodelivery.net/test/manifest/video.m3u8?protocol=llhls";
    process.env.STREAM_INGEST_RTMPS_URL = "rtmps://live.cloudflare.com:443/live";
    process.env.STREAM_INGEST_STREAM_KEY = "stream-key";
    process.env.HLS_OUTPUT_PATH = "/tmp/hyperscape/live/stream.m3u8";

    const bridge = new RTMPBridge();
    (bridge as any).initOutputs();
    const outputString = (bridge as any).buildOutputString() as string;

    expect(outputString).toContain(
      "rtmps://live.cloudflare.com:443/live/stream-key",
    );
    expect(outputString).not.toContain("f=hls");
    expect(outputString).not.toContain("stream.m3u8");
  });

  it("adds MPEG-TS-sized packets to SRT Cloudflare output", () => {
    process.env.STREAM_INGEST_PROFILE = "cloudflare_live";
    process.env.STREAM_INGEST_TRANSPORT = "srt";
    process.env.STREAM_CLOUDFLARE_PROBE_ONLY = "true";
    process.env.STREAM_DELIVERY_MODE = "external_hls";
    process.env.STREAM_DELIVERY_PROVIDER = "cloudflare_stream";
    process.env.STREAM_PLAYBACK_URL =
      "https://videodelivery.net/test/manifest/video.m3u8?protocol=llhls";
    process.env.STREAM_PLAYBACK_HLS_URL =
      "https://videodelivery.net/test/manifest/video.m3u8";
    process.env.STREAM_PLAYBACK_LLHLS_URL =
      "https://videodelivery.net/test/manifest/video.m3u8?protocol=llhls";
    process.env.STREAM_INGEST_RTMPS_URL = "rtmps://live.cloudflare.com:443/live";
    process.env.STREAM_INGEST_SRT_URL = "srt://live.cloudflare.com:778";
    process.env.STREAM_INGEST_SRT_STREAM_ID = "stream-id";
    process.env.STREAM_INGEST_SRT_PASSPHRASE = "stream-passphrase";

    const bridge = new RTMPBridge();
    (bridge as any).initOutputs();
    const outputString = (bridge as any).buildOutputString() as string;

    expect(outputString).toContain("pkt_size=1316");
    expect(outputString).toContain("streamid=stream-id");
    expect(outputString).toContain("passphrase=stream-passphrase");
  });

  it("uses direct MPEG-TS output for a single SRT destination", () => {
    process.env.STREAM_INGEST_PROFILE = "cloudflare_live";
    process.env.STREAM_INGEST_TRANSPORT = "srt";
    process.env.STREAM_CLOUDFLARE_PROBE_ONLY = "true";
    process.env.STREAM_DELIVERY_MODE = "external_hls";
    process.env.STREAM_DELIVERY_PROVIDER = "cloudflare_stream";
    process.env.STREAM_PLAYBACK_URL =
      "https://videodelivery.net/test/manifest/video.m3u8?protocol=llhls";
    process.env.STREAM_PLAYBACK_HLS_URL =
      "https://videodelivery.net/test/manifest/video.m3u8";
    process.env.STREAM_PLAYBACK_LLHLS_URL =
      "https://videodelivery.net/test/manifest/video.m3u8?protocol=llhls";
    process.env.STREAM_INGEST_RTMPS_URL = "rtmps://live.cloudflare.com:443/live";
    process.env.STREAM_INGEST_SRT_URL = "srt://live.cloudflare.com:778";
    process.env.STREAM_INGEST_SRT_STREAM_ID = "stream-id";
    process.env.STREAM_INGEST_SRT_PASSPHRASE = "stream-passphrase";

    const bridge = new RTMPBridge();
    (bridge as any).initOutputs();
    const outputArgs = (bridge as any).buildDirectOutputArgs() as string[] | null;

    expect(outputArgs).toEqual([
      "-f",
      "mpegts",
      "-mpegts_flags",
      "+resend_headers",
      "-muxdelay",
      "0",
      "-muxpreload",
      "0",
      expect.stringContaining("srt://live.cloudflare.com:778"),
    ]);
  });

  it("omits global headers for SRT transport", () => {
    process.env.STREAM_INGEST_PROFILE = "cloudflare_live";
    process.env.STREAM_INGEST_TRANSPORT = "srt";

    const bridge = new RTMPBridge();
    const audioArgs = (bridge as any).buildAudioArgs() as string[];

    expect(audioArgs).toEqual(
      expect.arrayContaining(["-c:a", "aac", "-ar", "48000"]),
    );
    expect(audioArgs).not.toContain("+global_header");
  });
});

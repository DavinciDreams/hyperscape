import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
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
  "STREAM_CANONICAL_PROVIDER_PRIORITY",
  "STREAM_EXTERNAL_DELIVERY_PROVIDER",
  "STREAM_EXTERNAL_PLAYBACK_HLS_URL",
  "STREAM_EXTERNAL_PLAYBACK_LLHLS_URL",
  "STREAM_EXTERNAL_INGEST_RTMPS_URL",
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
  "HLS_TIME_SECONDS",
  "HLS_LIST_SIZE",
  "HLS_DELETE_THRESHOLD",
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
  vi.useRealTimers();
  restoreEnv();
});

function createFakeFfmpegProcess() {
  const proc = new EventEmitter() as any;
  proc.exitCode = null;
  proc.signalCode = null;
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.stdin = new EventEmitter();
  proc.stdin.end = vi.fn();
  proc.kill = vi.fn(() => true);
  return proc;
}

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
    const audioInputArgs = (
      bridge as any
    ).buildBridgeAudioInputArgs() as string[];

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
    process.env.STREAM_INGEST_RTMPS_URL =
      "rtmps://live.cloudflare.com:443/live";
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

  it("uses minimal SRT query credentials for Cloudflare output", () => {
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
    process.env.STREAM_INGEST_RTMPS_URL =
      "rtmps://live.cloudflare.com:443/live";
    process.env.STREAM_INGEST_SRT_URL = "srt://live.cloudflare.com:778";
    process.env.STREAM_INGEST_SRT_STREAM_ID = "stream-id";
    process.env.STREAM_INGEST_SRT_PASSPHRASE = "stream-passphrase";

    const bridge = new RTMPBridge();
    (bridge as any).initOutputs();
    const outputString = (bridge as any).buildOutputString() as string;

    expect(outputString).toContain("streamid=stream-id");
    expect(outputString).toContain("passphrase=stream-passphrase");
    expect(outputString).not.toContain("pkt_size=");
    expect(outputString).not.toContain("transtype=");
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
    process.env.STREAM_INGEST_RTMPS_URL =
      "rtmps://live.cloudflare.com:443/live";
    process.env.STREAM_INGEST_SRT_URL = "srt://live.cloudflare.com:778";
    process.env.STREAM_INGEST_SRT_STREAM_ID = "stream-id";
    process.env.STREAM_INGEST_SRT_PASSPHRASE = "stream-passphrase";

    const bridge = new RTMPBridge();
    (bridge as any).initOutputs();
    const outputArgs = (bridge as any).buildDirectOutputArgs() as
      | string[]
      | null;

    expect(outputArgs).toEqual([
      "-f",
      "mpegts",
      "-mpegts_flags",
      "+resend_headers",
      expect.stringContaining("srt://live.cloudflare.com:778"),
    ]);
  });

  it("redacts SRT and RTMP credentials from FFmpeg log text", () => {
    const redact = (RTMPBridge as any).redactSensitiveFfmpegText as (
      value: string,
    ) => string;

    const redacted = redact(
      "Output #0 to 'srt://live.cloudflare.com:778?streamid=stream-id&passphrase=stream-passphrase' and rtmps://live.cloudflare.com:443/live/stream-key",
    );

    expect(redacted).toContain("streamid=***REDACTED***");
    expect(redacted).toContain("passphrase=***REDACTED***");
    expect(redacted).toContain(
      "rtmps://live.cloudflare.com:443/***REDACTED***",
    );
    expect(redacted).not.toContain("stream-id");
    expect(redacted).not.toContain("stream-passphrase");
    expect(redacted).not.toContain("stream-key");
  });

  it("marks destinations connected after FFmpeg reports progress", () => {
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
    process.env.STREAM_INGEST_RTMPS_URL =
      "rtmps://live.cloudflare.com:443/live";
    process.env.STREAM_INGEST_STREAM_KEY = "stream-key";

    const bridge = new RTMPBridge();
    (bridge as any).initOutputs();
    (bridge as any).status.destinations = [
      {
        id: "canonical-cloudflare",
        name: "External Delivery",
        role: "canonical",
        provider: "cloudflare_stream",
        transport: "rtmps",
        playbackUrl: "https://videodelivery.net/test/manifest/video.m3u8",
        ingestUrl: "rtmps://live.cloudflare.com:443/live",
        connected: false,
        bytesWritten: 0,
        startedAt: 123,
      },
    ];

    (bridge as any).parseFFmpegOutput("frame=   42 fps=29.97");

    expect((bridge as any).status.destinations[0]?.connected).toBe(true);
    expect((bridge as any).status.destinations[0]?.error).toBeUndefined();
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

  it("warms external delivery while self-hls remains canonical", () => {
    process.env.STREAM_INGEST_PROFILE = "cloudflare_live";
    process.env.STREAM_INGEST_TRANSPORT = "srt";
    process.env.STREAM_CLOUDFLARE_PROBE_ONLY = "false";
    process.env.STREAM_DELIVERY_MODE = "self_hls";
    process.env.STREAM_PLAYBACK_URL = "https://self.example/live/stream.m3u8";
    process.env.STREAM_PLAYBACK_HLS_URL = "https://video.example/live.m3u8";
    process.env.STREAM_PLAYBACK_LLHLS_URL =
      "https://video.example/live.m3u8?protocol=llhls";
    process.env.STREAM_DELIVERY_PROVIDER = "cloudflare_stream";
    process.env.STREAM_CANONICAL_PROVIDER_PRIORITY =
      "self_hls,cloudflare_stream";
    process.env.STREAM_INGEST_SRT_URL = "srt://live.cloudflare.com:778";
    process.env.STREAM_INGEST_SRT_STREAM_ID = "stream-id";
    process.env.STREAM_INGEST_SRT_PASSPHRASE = "stream-passphrase";
    process.env.HLS_OUTPUT_PATH = "/tmp/hyperscape/live/stream.m3u8";

    const bridge = new RTMPBridge();
    (bridge as any).initOutputs();
    const outputString = (bridge as any).buildOutputString() as string;
    const destinations = (bridge as any).destinations as Array<{
      id?: string;
      role?: string;
      provider?: string;
    }>;

    expect(outputString).toContain("streamid=stream-id");
    expect(outputString).not.toContain("pkt_size=1316");
    expect(outputString).toContain("f=hls");
    expect(destinations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "fallback-external-delivery",
          role: "fallback",
          provider: "cloudflare_stream",
          transport: "srt",
        }),
      ]),
    );
  });

  it("cleans stale local HLS artifacts before starting a new output", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "rtmp-hls-"));
    try {
      process.env.HLS_OUTPUT_PATH = path.join(tempDir, "stream.m3u8");
      fs.writeFileSync(process.env.HLS_OUTPUT_PATH, "#EXTM3U\n");
      fs.writeFileSync(path.join(tempDir, "stream-000000001.ts"), "old");
      fs.writeFileSync(path.join(tempDir, "stream-000000002.ts.tmp"), "old");
      fs.writeFileSync(path.join(tempDir, "unrelated.ts"), "keep");

      const bridge = new RTMPBridge();
      const outputString = (bridge as any).buildOutputString() as string;

      expect(outputString).toContain("f=hls");
      expect(fs.existsSync(process.env.HLS_OUTPUT_PATH)).toBe(false);
      expect(fs.existsSync(path.join(tempDir, "stream-000000001.ts"))).toBe(
        false,
      );
      expect(fs.existsSync(path.join(tempDir, "stream-000000002.ts.tmp"))).toBe(
        false,
      );
      expect(fs.existsSync(path.join(tempDir, "unrelated.ts"))).toBe(true);
    } finally {
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it("waits for FFmpeg process close during stopProcessing", async () => {
    const bridge = new RTMPBridge();
    const proc = createFakeFfmpegProcess();
    (bridge as any).ffmpeg = proc;
    (bridge as any).status.ffmpegRunning = true;

    const stopPromise = bridge.stopProcessing();

    expect(proc.stdin.end).toHaveBeenCalledOnce();
    expect(proc.kill).toHaveBeenCalledWith("SIGTERM");
    expect((bridge as any).status.ffmpegRunning).toBe(false);

    proc.emit("close", 0, null);
    await stopPromise;

    expect(proc.kill).not.toHaveBeenCalledWith("SIGKILL");
  });

  it("force-kills FFmpeg when graceful stop exceeds the bounded timeout", async () => {
    vi.useFakeTimers();
    const bridge = new RTMPBridge();
    const proc = createFakeFfmpegProcess();
    (bridge as any).ffmpeg = proc;
    (bridge as any).status.ffmpegRunning = true;

    const stopPromise = bridge.stopProcessing();
    await vi.advanceTimersByTimeAsync(751);

    expect(proc.kill).toHaveBeenCalledWith("SIGTERM");
    expect(proc.kill).toHaveBeenCalledWith("SIGKILL");

    await vi.advanceTimersByTimeAsync(3_000);
    await stopPromise;
  });
});

import { describe, expect, it } from "vitest";
import { parseExternalRtmpStatusSnapshot } from "../../../src/routes/streaming-external-status.js";

describe("parseExternalRtmpStatusSnapshot", () => {
  it("allowlists the additive smoke summary fields", () => {
    const parsed = parseExternalRtmpStatusSnapshot(
      JSON.stringify({
        destinations: [],
        stats: {},
        updatedAt: Date.now(),
        captureMode: "cdp",
        smoke: {
          currentSceneUrl: "https://staging.example/stream",
          activeBundle:
            "https://staging.example/assets/StreamingMode-abc123.js",
          deliveryMode: "external_hls",
          captureFpsP50: 29.5,
          captureFpsP95: 30,
          encodeFpsP50: 28.5,
          encodeFpsP95: 29,
          updatedAt: 1234,
          ingest: {
            profile: "cloudflare_live",
            transport: "rtmps",
            audioSampleRate: 48_000,
            gopFrames: 60,
            probeOnly: true,
          },
        },
        ingest: {
          profile: "cloudflare_live",
          transport: "rtmps",
          audioSampleRate: 48_000,
          gopFrames: 60,
          probeOnly: true,
        },
        sourceRuntime: {
          ready: true,
          statusSource: "external_worker",
          captureMode: "cdp",
          degradedReason: null,
          currentSceneUrl: "https://staging.example/stream",
          activeBundle:
            "https://staging.example/assets/StreamingMode-abc123.js",
          lastFrameAt: 1230,
          lastRenderTickAt: 1231,
          lastVisualChangeAt: 1232,
          lastRecoveryAt: 1000,
          recoveryCount: 2,
          workerHeartbeatAt: 1234,
        },
        captureDiagnostics: {
          recentFrames: [
            {
              at: 1230,
              size: 2048,
              cdpTimestamp: 12.5,
            },
          ],
          recentFrameCadenceMs: [33],
          nonMonotonicCdpTimestampCount: 0,
          backpressureTransitions: [
            {
              at: 1231,
              backpressured: true,
            },
          ],
          firstFatalWriteError: {
            at: 1229,
            message: "Broken pipe",
            frameCount: 4,
            droppedFrames: 1,
            bytesReceived: 8192,
            backpressured: false,
            cdpDirectMode: true,
            uptimeMs: 900,
          },
          lastFatalWriteError: {
            at: 1232,
            message: "Input/output error",
            frameCount: 5,
            droppedFrames: 2,
            bytesReceived: 12288,
            backpressured: true,
            cdpDirectMode: true,
            uptimeMs: 1000,
          },
          pageStallBeforeLastFatalWrite: false,
          lastFrameAgeMs: 4,
          captureSessionGeneration: "capture-123",
          manifestStatus: "ok",
        },
        unexpected: {
          foo: "bar",
        },
      }),
      15_000,
      { allowStale: true },
    );

    expect(parsed?.captureMode).toBe("cdp");
    expect(parsed?.smoke).toEqual({
      currentSceneUrl: "https://staging.example/stream",
      activeBundle: "https://staging.example/assets/StreamingMode-abc123.js",
      deliveryMode: "external_hls",
      captureFpsP50: 29.5,
      captureFpsP95: 30,
      encodeFpsP50: 28.5,
      encodeFpsP95: 29,
      updatedAt: 1234,
      ingest: {
        profile: "cloudflare_live",
        transport: "rtmps",
        audioSampleRate: 48_000,
        gopFrames: 60,
        probeOnly: true,
      },
    });
    expect(parsed?.ingest).toEqual({
      profile: "cloudflare_live",
      transport: "rtmps",
      audioSampleRate: 48_000,
      gopFrames: 60,
      probeOnly: true,
    });
    expect(parsed?.sourceRuntime).toEqual({
      ready: true,
      statusSource: "external_worker",
      captureMode: "cdp",
      degradedReason: null,
      currentSceneUrl: "https://staging.example/stream",
      activeBundle: "https://staging.example/assets/StreamingMode-abc123.js",
      lastFrameAt: 1230,
      lastRenderTickAt: 1231,
      lastVisualChangeAt: 1232,
      lastRecoveryAt: 1000,
      recoveryCount: 2,
      workerHeartbeatAt: 1234,
    });
    expect(parsed?.captureDiagnostics).toEqual({
      recentFrames: [
        {
          at: 1230,
          size: 2048,
          cdpTimestamp: 12.5,
        },
      ],
      recentFrameCadenceMs: [33],
      nonMonotonicCdpTimestampCount: 0,
      backpressureTransitions: [
        {
          at: 1231,
          backpressured: true,
        },
      ],
      firstFatalWriteError: {
        at: 1229,
        message: "Broken pipe",
        frameCount: 4,
        droppedFrames: 1,
        bytesReceived: 8192,
        backpressured: false,
        cdpDirectMode: true,
        uptimeMs: 900,
      },
      lastFatalWriteError: {
        at: 1232,
        message: "Input/output error",
        frameCount: 5,
        droppedFrames: 2,
        bytesReceived: 12288,
        backpressured: true,
        cdpDirectMode: true,
        uptimeMs: 1000,
      },
      pageStallBeforeLastFatalWrite: false,
      lastFrameAgeMs: 4,
      captureSessionGeneration: "capture-123",
      manifestStatus: "ok",
    });
    expect(parsed).not.toHaveProperty("unexpected");
  });

  it("validates stats field-by-field and drops malformed values", () => {
    const parsed = parseExternalRtmpStatusSnapshot(
      JSON.stringify({
        destinations: [],
        stats: {
          bitrate: 4_000,
          fps: "30",
          uptime: 12,
          bytesReceived: 8_192,
          droppedFrames: "2",
          healthy: true,
          injected: "nope",
        },
        updatedAt: Date.now(),
      }),
      15_000,
      { allowStale: true },
    );

    expect(parsed?.stats).toEqual({
      bitrate: 4_000,
      uptime: 12,
      bytesReceived: 8_192,
      healthy: true,
    });
  });
});

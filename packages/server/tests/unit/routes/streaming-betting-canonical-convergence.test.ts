import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerStreamingBettingRoutes } from "../../../src/routes/streaming-betting-routes.js";

const stubbedEnv = new Map<string, string | undefined>();

function stubEnv(key: string, value: string): void {
  if (!stubbedEnv.has(key)) {
    stubbedEnv.set(key, process.env[key]);
  }
  process.env[key] = value;
}

function restoreStubbedEnvs(): void {
  for (const [key, value] of stubbedEnv.entries()) {
    if (value === undefined) {
      delete process.env[key];
      continue;
    }
    process.env[key] = value;
  }
  stubbedEnv.clear();
}

function createRouteOptions(
  overrides: Partial<Parameters<typeof registerStreamingBettingRoutes>[0]> = {},
) {
  return {
    fastify: Fastify(),
    world: {
      getSystem: () => null,
    } as never,
    replayBuffer: 16,
    replayMaxBytes: 64 * 1024,
    pushIntervalMs: 250,
    heartbeatMs: 5000,
    maxPendingBytes: 64 * 1024,
    maxClients: 1,
    bootstrapRateLimit: {
      max: 10,
      timeWindow: "1 minute",
    },
    eventsRateLimit: {
      max: 10,
      timeWindow: "1 minute",
    },
    internalAllowedOrigin: null,
    externalStatusFile: null,
    externalStatusMaxAgeMs: 15_000,
    getStreamingDuelScheduler: () => ({
      getCurrentCycle: () => null,
    }),
    getStreamCaptureStats: () => ({
      clientConnected: true,
      ffmpegRunning: true,
    }),
    ...overrides,
  };
}

describe("streaming-betting canonical convergence", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    restoreStubbedEnvs();
  });

  it("marks canonical playback ready when the probe is healthy even if worker connected is stale false", async () => {
    stubEnv("BETTING_FEED_ACCESS_TOKEN", "bet-secret");
    stubEnv("STREAM_DELIVERY_MODE", "external_hls");
    stubEnv("STREAM_DELIVERY_PROVIDER", "cloudflare_stream");
    stubEnv("STREAM_PLAYBACK_HLS_URL", "https://customer.example/live.m3u8");
    stubEnv(
      "STREAM_PLAYBACK_LLHLS_URL",
      "https://customer.example/live.m3u8?protocol=llhls",
    );
    stubEnv("STREAM_INGEST_RTMPS_URL", "srt://live.cloudflare.example/input");

    const now = Date.now();
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "streaming-betting-canonical-"),
    );
    const externalStatusFile = path.join(tempDir, "rtmp-status.json");
    fs.writeFileSync(
      externalStatusFile,
      JSON.stringify({
        active: true,
        ffmpegRunning: true,
        clientConnected: true,
        destinations: [
          {
            id: "canonical-cloudflare",
            role: "canonical",
            provider: "cloudflare_stream",
            name: "External Delivery",
            transport: "srt",
            playbackUrl: "https://customer.example/live.m3u8",
            connected: false,
            error: "stale worker error",
            startedAt: now - 500,
          },
        ],
        stats: {
          healthy: true,
        },
        updatedAt: now,
        rendererHealth: {
          ready: true,
          degradedReason: null,
          updatedAt: now,
        },
        sourceRuntime: {
          ready: true,
          statusSource: "external_worker",
          captureMode: "cdp",
          degradedReason: null,
          currentSceneUrl: "https://staging.example/stream",
          activeBundle: "https://staging.example/assets/StreamingMode-abc123.js",
          lastFrameAt: now,
          lastRenderTickAt: now,
          lastVisualChangeAt: now,
          lastRecoveryAt: now - 1000,
          recoveryCount: 1,
          workerHeartbeatAt: now,
        },
      }),
    );

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response("", { status: 200 }));

    const options = createRouteOptions({
      externalStatusFile,
    });
    const routes = registerStreamingBettingRoutes(options);

    for (let attempt = 0; attempt < 20 && fetchSpy.mock.calls.length === 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(fetchSpy).toHaveBeenCalled();
    await new Promise((resolve) => setTimeout(resolve, 10));

    const response = await options.fastify.inject({
      method: "GET",
      url: "/api/internal/bet-sync/state",
      headers: {
        authorization: "Bearer bet-secret",
      },
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    const canonicalDestination = payload.channel.destinations.find(
      (destination: { role?: string }) => destination.role === "canonical",
    );
    expect(payload.channel.publicReadiness).toMatchObject({
      ready: true,
      reason: null,
    });
    expect(canonicalDestination).toMatchObject({
      id: "canonical-cloudflare",
      connected: true,
      transportHealthy: true,
      playbackReady: true,
      lastError: null,
      manifestStatus: "ok",
    });

    routes.close();
    await options.fastify.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("refreshes bootstrap renderer health when replay exists but external status has advanced", async () => {
    stubEnv("BETTING_FEED_ACCESS_TOKEN", "bet-secret");
    stubEnv("STREAM_DELIVERY_MODE", "external_hls");
    stubEnv("STREAM_DELIVERY_PROVIDER", "cloudflare_stream");
    stubEnv("STREAM_PLAYBACK_HLS_URL", "https://customer.example/live.m3u8");
    stubEnv(
      "STREAM_PLAYBACK_LLHLS_URL",
      "https://customer.example/live.m3u8?protocol=llhls",
    );
    stubEnv("STREAM_INGEST_RTMPS_URL", "srt://live.cloudflare.example/input");

    const now = Date.now();
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "streaming-betting-bootstrap-refresh-"),
    );
    const externalStatusFile = path.join(tempDir, "rtmp-status.json");

    const writeStatus = (rendererReady: boolean, updatedAt: number) => {
      fs.writeFileSync(
        externalStatusFile,
        JSON.stringify({
          active: true,
          ffmpegRunning: true,
          clientConnected: true,
          destinations: [
            {
              id: "canonical-cloudflare",
              role: "canonical",
              provider: "cloudflare_stream",
              name: "External Delivery",
              transport: "srt",
              playbackUrl: "https://customer.example/live.m3u8",
              connected: true,
              startedAt: updatedAt - 500,
            },
          ],
          stats: {
            healthy: true,
          },
          updatedAt,
          rendererHealth: {
            ready: rendererReady,
            degradedReason: rendererReady ? null : "render_tick_stale",
            updatedAt,
          },
          metrics: {
            captureFps: 60,
            encodeFps: 60,
            latestFrameAt: updatedAt,
            latestRenderTickAt: updatedAt,
            latestVisualChangeAt: updatedAt,
            visualChangeAgeMs: 0,
          },
          sourceRuntime: {
            ready: true,
            statusSource: "external_worker",
            captureMode: "cdp",
            degradedReason: null,
            currentSceneUrl: "https://staging.example/stream",
            activeBundle: "https://staging.example/assets/StreamingMode-abc123.js",
            lastFrameAt: updatedAt,
            lastRenderTickAt: updatedAt,
            lastVisualChangeAt: updatedAt,
            lastRecoveryAt: updatedAt - 1000,
            recoveryCount: 1,
            workerHeartbeatAt: updatedAt,
          },
        }),
      );
    };

    writeStatus(false, now);

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response("", { status: 200 }));

    const options = createRouteOptions({
      externalStatusFile,
    });
    const routes = registerStreamingBettingRoutes(options);

    for (let attempt = 0; attempt < 20 && fetchSpy.mock.calls.length === 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(fetchSpy).toHaveBeenCalled();
    await new Promise((resolve) => setTimeout(resolve, 10));

    const initialResponse = await options.fastify.inject({
      method: "GET",
      url: "/api/internal/bet-sync/state",
      headers: {
        authorization: "Bearer bet-secret",
      },
    });

    expect(initialResponse.statusCode).toBe(200);
    expect(initialResponse.json().rendererHealth).toMatchObject({
      ready: false,
      degradedReason: "render_tick_stale",
    });

    writeStatus(true, now + 5_000);

    let refreshedPayload: Record<string, unknown> | null = null;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      const response = await options.fastify.inject({
        method: "GET",
        url: "/api/internal/bet-sync/state",
        headers: {
          authorization: "Bearer bet-secret",
        },
      });
      expect(response.statusCode).toBe(200);
      const payload = response.json();
      if (payload.rendererHealth?.ready === true) {
        refreshedPayload = payload;
        break;
      }
    }

    expect(refreshedPayload).not.toBeNull();
    expect((refreshedPayload as any).rendererHealth).toMatchObject({
      ready: true,
      degradedReason: null,
    });

    routes.close();
    await options.fastify.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("prefers self-hls as canonical when provider priority ranks it first", async () => {
    stubEnv("BETTING_FEED_ACCESS_TOKEN", "bet-secret");
    stubEnv("STREAM_DELIVERY_MODE", "external_hls");
    stubEnv("STREAM_DELIVERY_PROVIDER", "cloudflare_stream");
    stubEnv("STREAM_CANONICAL_PROVIDER_PRIORITY", "self_hls,cloudflare_stream");
    stubEnv("STREAM_PLAYBACK_HLS_URL", "https://customer.example/live.m3u8");
    stubEnv(
      "STREAM_PLAYBACK_LLHLS_URL",
      "https://customer.example/live.m3u8?protocol=llhls",
    );
    stubEnv("STREAM_INGEST_RTMPS_URL", "srt://live.cloudflare.example/input");

    const now = Date.now();
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "streaming-betting-priority-"),
    );
    const externalStatusFile = path.join(tempDir, "rtmp-status.json");
    fs.writeFileSync(
      externalStatusFile,
      JSON.stringify({
        active: true,
        ffmpegRunning: true,
        clientConnected: true,
        destinations: [
          {
            id: "canonical-cloudflare",
            role: "canonical",
            provider: "cloudflare_stream",
            name: "Cloudflare Stream",
            transport: "srt",
            playbackUrl: "https://customer.example/live.m3u8",
            connected: true,
            startedAt: now - 500,
          },
        ],
        stats: {
          healthy: true,
        },
        updatedAt: now,
        hlsManifest: {
          updatedAt: now,
          mediaSequence: 123,
        },
        rendererHealth: {
          ready: true,
          degradedReason: null,
          updatedAt: now,
        },
        sourceRuntime: {
          ready: true,
          statusSource: "external_worker",
          captureMode: "cdp",
          degradedReason: null,
          currentSceneUrl: "https://staging.example/stream",
          activeBundle: null,
          lastFrameAt: now,
          lastRenderTickAt: now,
          lastVisualChangeAt: now,
          lastRecoveryAt: now - 1000,
          recoveryCount: 0,
          workerHeartbeatAt: now,
        },
      }),
    );

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response("", { status: 200 }));

    const options = createRouteOptions({
      externalStatusFile,
    });
    const routes = registerStreamingBettingRoutes(options);

    for (let attempt = 0; attempt < 20 && fetchSpy.mock.calls.length === 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    const response = await options.fastify.inject({
      method: "GET",
      url: "/api/internal/bet-sync/state",
      headers: {
        authorization: "Bearer bet-secret",
      },
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.channel.canonicalDestinationId).toBe("canonical-self-hls");
    expect(payload.channel.fallbackDestinationId).toBe("fallback-cloudflare-stream");
    expect(payload.canonicalDestination).toMatchObject({
      provider: "self_hls",
      playbackReady: true,
    });
    expect(payload.fallbackDestination).toMatchObject({
      provider: "cloudflare_stream",
      playbackReady: true,
    });

    routes.close();
    await options.fastify.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("fails back to the primary provider only after the soak window", async () => {
    stubEnv("BETTING_FEED_ACCESS_TOKEN", "bet-secret");
    stubEnv("STREAM_DELIVERY_MODE", "external_hls");
    stubEnv("STREAM_DELIVERY_PROVIDER", "cloudflare_stream");
    stubEnv("STREAM_CANONICAL_PROVIDER_PRIORITY", "cloudflare_stream,self_hls");
    stubEnv("STREAM_FAILBACK_SOAK_MS", "150");
    stubEnv("STREAM_PLAYBACK_HLS_URL", "https://customer.example/live.m3u8");
    stubEnv(
      "STREAM_PLAYBACK_LLHLS_URL",
      "https://customer.example/live.m3u8?protocol=llhls",
    );
    stubEnv("STREAM_INGEST_RTMPS_URL", "srt://live.cloudflare.example/input");

    const now = Date.now();
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "streaming-betting-failback-"),
    );
    const externalStatusFile = path.join(tempDir, "rtmp-status.json");

    const writeStatus = (connected: boolean, updatedAt: number) => {
      fs.writeFileSync(
        externalStatusFile,
        JSON.stringify({
          active: true,
          ffmpegRunning: true,
          clientConnected: true,
          destinations: [
            {
              id: "canonical-cloudflare",
              role: "canonical",
              provider: "cloudflare_stream",
              name: "Cloudflare Stream",
              transport: "srt",
              playbackUrl: "https://customer.example/live.m3u8",
              connected,
              error: connected ? null : "delivery_disconnected",
              startedAt: updatedAt - 500,
            },
          ],
          stats: {
            healthy: true,
          },
          updatedAt,
          hlsManifest: {
            updatedAt,
            mediaSequence: 456,
          },
          rendererHealth: {
            ready: true,
            degradedReason: null,
            updatedAt,
          },
          sourceRuntime: {
            ready: true,
            statusSource: "external_worker",
            captureMode: "cdp",
            degradedReason: null,
            currentSceneUrl: "https://staging.example/stream",
            activeBundle: null,
            lastFrameAt: updatedAt,
            lastRenderTickAt: updatedAt,
            lastVisualChangeAt: updatedAt,
            lastRecoveryAt: updatedAt - 1000,
            recoveryCount: 0,
            workerHeartbeatAt: updatedAt,
          },
        }),
      );
    };

    let probeStatus = 204;
    writeStatus(false, now);

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response("", { status: probeStatus }));

    const options = createRouteOptions({
      externalStatusFile,
    });
    const routes = registerStreamingBettingRoutes(options);

    for (let attempt = 0; attempt < 20 && fetchSpy.mock.calls.length === 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    let response = await options.fastify.inject({
      method: "GET",
      url: "/api/internal/bet-sync/state",
      headers: {
        authorization: "Bearer bet-secret",
      },
    });
    expect(response.json().canonicalDestination).toMatchObject({
      provider: "self_hls",
    });

    probeStatus = 200;
    writeStatus(true, now + 50);
    await new Promise((resolve) => setTimeout(resolve, 2_100));

    response = await options.fastify.inject({
      method: "GET",
      url: "/api/internal/bet-sync/state",
      headers: {
        authorization: "Bearer bet-secret",
      },
    });
    expect(response.json().canonicalDestination).toMatchObject({
      provider: "self_hls",
    });

    await new Promise((resolve) => setTimeout(resolve, 200));

    response = await options.fastify.inject({
      method: "GET",
      url: "/api/internal/bet-sync/state",
      headers: {
        authorization: "Bearer bet-secret",
      },
    });
    expect(response.json().canonicalDestination).toMatchObject({
      provider: "cloudflare_stream",
    });

    routes.close();
    await options.fastify.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
});

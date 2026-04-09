import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  allocateNextBettingClientId,
  normalizeInternalAllowedOrigin,
  parseReplayCursor,
  registerStreamingBettingRoutes,
} from "../../../src/routes/streaming-betting-routes.js";

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

function createStorageBackedWorld() {
  const rows = new Map<string, { key: string; value: string; updatedAt: number }>();
  return {
    rows,
    world: {
      getSystem: (name: string) => {
        if (name !== "database") {
          return null;
        }
        return {
          getDb: () => ({
            select: () => ({
              from: () => ({
                where: () => ({
                  limit: async () => [],
                }),
              }),
            }),
            insert: () => ({
              values: (row: { key: string; value: string; updatedAt: number }) => ({
                onConflictDoUpdate: async () => {
                  rows.set(row.key, row);
                },
              }),
            }),
          }),
        };
      },
    } as never,
  };
}

describe("streaming-betting-routes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    restoreStubbedEnvs();
  });

  it("returns bootstrap state for valid authenticated requests", async () => {
    stubEnv("BETTING_FEED_ACCESS_TOKEN", "bet-secret");

    const options = createRouteOptions();
    const routes = registerStreamingBettingRoutes(options);

    const response = await options.fastify.inject({
      method: "GET",
      url: "/api/internal/bet-sync/state",
      headers: {
        authorization: "Bearer bet-secret",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      schemaVersion: 2,
      sourceEpoch: expect.any(Number),
      channel: expect.objectContaining({
        canonicalDestinationId: expect.any(String),
        publicReadiness: expect.objectContaining({
          ready: expect.any(Boolean),
        }),
      }),
      replay: expect.objectContaining({
        sourceEpoch: expect.any(Number),
      }),
    });

    routes.close();
    await options.fastify.close();
  });

  it("uses a fresh canonical playback probe over stale worker destination flags", async () => {
    stubEnv("BETTING_FEED_ACCESS_TOKEN", "bet-secret");
    stubEnv("STREAM_DELIVERY_MODE", "external_hls");
    stubEnv("STREAM_DELIVERY_PROVIDER", "cloudflare_stream");
    stubEnv("STREAM_PLAYBACK_HLS_URL", "https://customer.example/live.m3u8");
    stubEnv(
      "STREAM_PLAYBACK_LLHLS_URL",
      "https://customer.example/live.m3u8?protocol=llhls",
    );
    stubEnv("STREAM_INGEST_RTMPS_URL", "srt://live.cloudflare.example/input");

    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "streaming-betting-routes-"),
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
            startedAt: Date.now() - 500,
          },
        ],
        stats: {
          healthy: true,
        },
        updatedAt: Date.now(),
        rendererHealth: {
          ready: true,
          degradedReason: null,
          updatedAt: Date.now(),
        },
        sourceRuntime: {
          ready: true,
          statusSource: "external_worker",
          captureMode: "cdp",
          degradedReason: null,
          currentSceneUrl: "https://staging.example/stream",
          activeBundle: "https://staging.example/assets/StreamingMode-abc123.js",
          lastFrameAt: Date.now(),
          lastRenderTickAt: Date.now(),
          lastVisualChangeAt: Date.now(),
          lastRecoveryAt: Date.now() - 1_000,
          recoveryCount: 1,
          workerHeartbeatAt: Date.now(),
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

  it("rejects query-token auth on the bootstrap route", async () => {
    stubEnv("BETTING_FEED_ACCESS_TOKEN", "bet-secret");

    const options = createRouteOptions();
    const routes = registerStreamingBettingRoutes(options);

    const response = await options.fastify.inject({
      method: "GET",
      url: "/api/internal/bet-sync/state?streamToken=bet-secret",
    });

    expect(response.statusCode).toBe(401);
    routes.close();
    await options.fastify.close();
  });

  it("returns 503 once betting SSE capacity is exhausted after auth succeeds", async () => {
    stubEnv("BETTING_FEED_ACCESS_TOKEN", "bet-secret");

    const options = createRouteOptions({
      maxClients: 0,
    });
    const routes = registerStreamingBettingRoutes(options);

    const response = await options.fastify.inject({
      method: "GET",
      url: "/api/internal/bet-sync/events",
      headers: {
        authorization: "Bearer bet-secret",
      },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      error: "Bet sync SSE capacity reached",
    });

    routes.close();
    await options.fastify.close();
  });

  it("fails closed in production when betting-feed auth is not configured", async () => {
    stubEnv("NODE_ENV", "production");
    stubEnv("BETTING_FEED_ACCESS_TOKEN", "");

    const options = createRouteOptions();
    const routes = registerStreamingBettingRoutes(options);

    const response = await options.fastify.inject({
      method: "GET",
      url: "/api/internal/bet-sync/state",
      headers: {
        authorization: "Bearer whatever",
      },
    });

    expect(response.statusCode).toBe(503);
    routes.close();
    await options.fastify.close();
  });

  it("allows explicit skip-auth only in development", async () => {
    stubEnv("NODE_ENV", "development");
    stubEnv("BETTING_FEED_ACCESS_TOKEN", "");
    stubEnv("BETTING_FEED_SKIP_AUTH", "true");

    const options = createRouteOptions();
    const routes = registerStreamingBettingRoutes(options);

    const response = await options.fastify.inject({
      method: "GET",
      url: "/api/internal/bet-sync/state",
    });

    expect(response.statusCode).toBe(200);
    routes.close();
    await options.fastify.close();
  });

  it("ignores skip-auth in test environments", async () => {
    stubEnv("NODE_ENV", "test");
    stubEnv("BETTING_FEED_ACCESS_TOKEN", "");
    stubEnv("BETTING_FEED_SKIP_AUTH", "true");

    const options = createRouteOptions();
    const routes = registerStreamingBettingRoutes(options);

    const response = await options.fastify.inject({
      method: "GET",
      url: "/api/internal/bet-sync/state",
    });

    expect(response.statusCode).toBe(503);
    routes.close();
    await options.fastify.close();
  });

  it("ignores skip-auth in production", async () => {
    stubEnv("NODE_ENV", "production");
    stubEnv("BETTING_FEED_ACCESS_TOKEN", "");
    stubEnv("BETTING_FEED_SKIP_AUTH", "true");

    const options = createRouteOptions();
    const routes = registerStreamingBettingRoutes(options);

    const response = await options.fastify.inject({
      method: "GET",
      url: "/api/internal/bet-sync/state",
    });

    expect(response.statusCode).toBe(503);
    routes.close();
    await options.fastify.close();
  });

  it("does not treat the viewer token as a betting-feed fallback", async () => {
    stubEnv("BETTING_FEED_ACCESS_TOKEN", "");
    stubEnv("STREAMING_VIEWER_ACCESS_TOKEN", "viewer-secret");

    const options = createRouteOptions();
    const routes = registerStreamingBettingRoutes(options);

    const response = await options.fastify.inject({
      method: "GET",
      url: "/api/internal/bet-sync/state",
      headers: {
        authorization: "Bearer viewer-secret",
      },
    });

    expect(response.statusCode).toBe(503);
    routes.close();
    await options.fastify.close();
  });

  it("reuses and releases the external status poller across repeated route registration", async () => {
    stubEnv("BETTING_FEED_ACCESS_TOKEN", "bet-secret");
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");

    const firstOptions = createRouteOptions({
      externalStatusFile: "/tmp/nonexistent-betting-status.json",
    });
    const secondOptions = createRouteOptions({
      externalStatusFile: "/tmp/nonexistent-betting-status.json",
    });

    const firstRoutes = registerStreamingBettingRoutes(firstOptions);
    const secondRoutes = registerStreamingBettingRoutes(secondOptions);

    expect(setIntervalSpy).toHaveBeenCalledTimes(1);

    firstRoutes.close();
    await firstOptions.fastify.close();
    expect(clearIntervalSpy).not.toHaveBeenCalled();

    secondRoutes.close();
    await secondOptions.fastify.close();
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
  });

  it("releases the external status poller when Fastify closes even without manual route cleanup", async () => {
    stubEnv("BETTING_FEED_ACCESS_TOKEN", "bet-secret");
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");

    const options = createRouteOptions({
      externalStatusFile: "/tmp/nonexistent-betting-status.json",
    });

    registerStreamingBettingRoutes(options);
    await options.fastify.close();

    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
  });

  it("accepts only one explicit internal betting CORS origin", () => {
    expect(normalizeInternalAllowedOrigin("https://bets.example.com")).toBe(
      "https://bets.example.com",
    );
    expect(normalizeInternalAllowedOrigin("*")).toBeNull();
    expect(normalizeInternalAllowedOrigin("null")).toBeNull();
    expect(
      normalizeInternalAllowedOrigin(
        "https://bets.example.com,https://other.example.com",
      ),
    ).toBeNull();
    expect(
      normalizeInternalAllowedOrigin("https://bets.example.com/path"),
    ).toBeNull();
  });

  it("prefers Last-Event-Id over the initial since query parameter", () => {
    const request = {
      headers: {
        "last-event-id": "55",
      },
      query: {
        since: "12",
      },
    } as never;

    expect(parseReplayCursor(request)).toBe(55);
  });

  it("rejects query-token auth on the events route", async () => {
    stubEnv("BETTING_FEED_ACCESS_TOKEN", "bet-secret");

    const options = createRouteOptions();
    const routes = registerStreamingBettingRoutes(options);

    const response = await options.fastify.inject({
      method: "GET",
      url: "/api/internal/bet-sync/events?streamToken=bet-secret",
    });

    expect(response.statusCode).toBe(401);
    routes.close();
    await options.fastify.close();
  });

  it("persists Cloudflare webhook lifecycle metadata when the shared secret matches", async () => {
    stubEnv("STREAM_CLOUDFLARE_WEBHOOK_SECRET", "cf-secret");
    stubEnv("STREAM_CLOUDFLARE_LIVE_INPUT_ID", "live-input-env");

    const storageBackedWorld = createStorageBackedWorld();
    const options = createRouteOptions({
      world: storageBackedWorld.world,
    });
    const routes = registerStreamingBettingRoutes(options);

    const response = await options.fastify.inject({
      method: "POST",
      url: "/api/streaming/cloudflare/webhook",
      headers: {
        "cf-webhook-auth": "cf-secret",
      },
      payload: {
        alert_type: "stream_live_input.connected",
        name: "Stream Live Input Connected",
        event: {
          input_id: "live-input-env",
          video_id: "video-456",
          timestamp: "2026-04-09T02:15:00.000Z",
        },
      },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({
      ok: true,
      eventType: "stream_live_input.connected",
      liveInputId: "live-input-env",
    });
    expect(
      JSON.parse(
        storageBackedWorld.rows.get("streaming:cloudflare:last-webhook")?.value ??
          "null",
      ),
    ).toMatchObject({
      eventType: "stream_live_input.connected",
      liveInputId: "live-input-env",
      videoId: "video-456",
    });
    expect(
      JSON.parse(
        storageBackedWorld.rows.get("streaming:cloudflare:lifecycle")?.value ??
          "null",
      ),
    ).toMatchObject({
      eventType: "stream_live_input.connected",
      liveInputId: "live-input-env",
      status: "connected",
    });

    routes.close();
    await options.fastify.close();
  });

  it("rejects authenticated Cloudflare webhooks that omit a live input id", async () => {
    stubEnv("STREAM_CLOUDFLARE_WEBHOOK_SECRET", "cf-secret");
    stubEnv("STREAM_CLOUDFLARE_LIVE_INPUT_ID", "live-input-env");

    const storageBackedWorld = createStorageBackedWorld();
    const options = createRouteOptions({
      world: storageBackedWorld.world,
    });
    const routes = registerStreamingBettingRoutes(options);

    const response = await options.fastify.inject({
      method: "POST",
      url: "/api/streaming/cloudflare/webhook",
      headers: {
        "cf-webhook-auth": "cf-secret",
      },
      payload: {
        alert_type: "stream_live_input.connected",
        name: "Stream Live Input Connected",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(storageBackedWorld.rows.get("streaming:cloudflare:last-webhook")).toBeUndefined();
    expect(storageBackedWorld.rows.get("streaming:cloudflare:lifecycle")).toBeUndefined();

    routes.close();
    await options.fastify.close();
  });

  it("ignores authenticated Cloudflare webhooks for a different live input", async () => {
    stubEnv("STREAM_CLOUDFLARE_WEBHOOK_SECRET", "cf-secret");
    stubEnv("STREAM_CLOUDFLARE_LIVE_INPUT_ID", "live-input-env");

    const storageBackedWorld = createStorageBackedWorld();
    const options = createRouteOptions({
      world: storageBackedWorld.world,
    });
    const routes = registerStreamingBettingRoutes(options);

    const response = await options.fastify.inject({
      method: "POST",
      url: "/api/streaming/cloudflare/webhook",
      headers: {
        "cf-webhook-auth": "cf-secret",
      },
      payload: {
        alert_type: "stream_live_input.connected",
        name: "Stream Live Input Connected",
        event: {
          input_id: "other-live-input",
          video_id: "video-456",
          timestamp: "2026-04-09T02:15:00.000Z",
        },
      },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({
      ok: true,
      ignored: true,
      liveInputId: "other-live-input",
    });
    expect(storageBackedWorld.rows.get("streaming:cloudflare:last-webhook")).toBeUndefined();
    expect(storageBackedWorld.rows.get("streaming:cloudflare:lifecycle")).toBeUndefined();

    routes.close();
    await options.fastify.close();
  });

  it("allocates betting client ids without colliding after wraparound", () => {
    const allocation = allocateNextBettingClientId(
      Number.MAX_SAFE_INTEGER - 1,
      [1],
    );

    expect(allocation).toEqual({
      clientId: Number.MAX_SAFE_INTEGER - 1,
      nextCursor: 1,
    });

    const wrapped = allocateNextBettingClientId(allocation.nextCursor, [1, 2]);
    expect(wrapped).toEqual({
      clientId: 3,
      nextCursor: 4,
    });
  });
});

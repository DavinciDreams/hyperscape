import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerStreamingBettingRoutes } from "../../../src/routes/streaming-betting-routes.js";

const { getStreamingDuelSchedulerMock, getStreamCaptureMock } = vi.hoisted(
  () => ({
    getStreamingDuelSchedulerMock: vi.fn(),
    getStreamCaptureMock: vi.fn(),
  }),
);

vi.mock("../../../src/systems/StreamingDuelScheduler/index.js", () => ({
  getStreamingDuelScheduler: getStreamingDuelSchedulerMock,
}));

vi.mock("../../../src/streaming/stream-capture.js", () => ({
  getStreamCapture: getStreamCaptureMock,
}));

describe("streaming-betting-routes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("rejects query-token auth on the bootstrap route", async () => {
    vi.stubEnv("BETTING_FEED_ACCESS_TOKEN", "bet-secret");
    getStreamingDuelSchedulerMock.mockReturnValue({
      getCurrentCycle: () => null,
    });
    getStreamCaptureMock.mockReturnValue({
      getStats: () => ({
        clientConnected: true,
        ffmpegRunning: true,
      }),
    });

    const app = Fastify();
    const routes = registerStreamingBettingRoutes({
      fastify: app,
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
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/internal/bet-sync/state?streamToken=bet-secret",
    });

    expect(response.statusCode).toBe(401);
    routes.close();
    await app.close();
  });

  it("returns 503 once betting SSE capacity is exhausted after auth succeeds", async () => {
    vi.stubEnv("BETTING_FEED_ACCESS_TOKEN", "bet-secret");
    getStreamingDuelSchedulerMock.mockReturnValue({
      getCurrentCycle: () => null,
    });
    getStreamCaptureMock.mockReturnValue({
      getStats: () => ({
        clientConnected: true,
        ffmpegRunning: true,
      }),
    });

    const app = Fastify();
    const routes = registerStreamingBettingRoutes({
      fastify: app,
      world: {
        getSystem: () => null,
      } as never,
      replayBuffer: 16,
      replayMaxBytes: 64 * 1024,
      pushIntervalMs: 250,
      heartbeatMs: 5000,
      maxPendingBytes: 64 * 1024,
      maxClients: 0,
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
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/internal/bet-sync/events?streamToken=bet-secret",
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      error: "Bet sync SSE capacity reached",
    });

    routes.close();
    await app.close();
  });

  it("fails closed in production when betting-feed auth is not configured", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BETTING_FEED_ACCESS_TOKEN", "");
    vi.stubEnv("STREAMING_VIEWER_ACCESS_TOKEN", "");
    getStreamingDuelSchedulerMock.mockReturnValue({
      getCurrentCycle: () => null,
    });
    getStreamCaptureMock.mockReturnValue({
      getStats: () => ({
        clientConnected: true,
        ffmpegRunning: true,
      }),
    });

    const app = Fastify();
    const routes = registerStreamingBettingRoutes({
      fastify: app,
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
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/internal/bet-sync/state",
      headers: {
        authorization: "Bearer whatever",
      },
    });

    expect(response.statusCode).toBe(503);
    routes.close();
    await app.close();
  });
});

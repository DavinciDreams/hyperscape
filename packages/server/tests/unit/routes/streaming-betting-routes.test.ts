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

function createRouteOptions(overrides: Partial<Parameters<typeof registerStreamingBettingRoutes>[0]> = {}) {
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
    ...overrides,
  };
}

function primeHealthyStreamingMocks() {
  getStreamingDuelSchedulerMock.mockReturnValue({
    getCurrentCycle: () => null,
  });
  getStreamCaptureMock.mockReturnValue({
    getStats: () => ({
      clientConnected: true,
      ffmpegRunning: true,
    }),
  });
}

describe("streaming-betting-routes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("returns bootstrap state for valid authenticated requests", async () => {
    vi.stubEnv("BETTING_FEED_ACCESS_TOKEN", "bet-secret");
    primeHealthyStreamingMocks();

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
      schemaVersion: 1,
      sourceEpoch: expect.any(Number),
      replay: expect.objectContaining({
        sourceEpoch: expect.any(Number),
      }),
    });

    routes.close();
    await options.fastify.close();
  });

  it("rejects query-token auth on the bootstrap route", async () => {
    vi.stubEnv("BETTING_FEED_ACCESS_TOKEN", "bet-secret");
    primeHealthyStreamingMocks();

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
    vi.stubEnv("BETTING_FEED_ACCESS_TOKEN", "bet-secret");
    primeHealthyStreamingMocks();

    const options = createRouteOptions({
      maxClients: 0,
    });
    const routes = registerStreamingBettingRoutes(options);

    const response = await options.fastify.inject({
      method: "GET",
      url: "/api/internal/bet-sync/events?streamToken=bet-secret",
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      error: "Bet sync SSE capacity reached",
    });

    routes.close();
    await options.fastify.close();
  });

  it("fails closed in production when betting-feed auth is not configured", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BETTING_FEED_ACCESS_TOKEN", "");
    vi.stubEnv("STREAMING_VIEWER_ACCESS_TOKEN", "");
    primeHealthyStreamingMocks();

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

  it("allows explicit skip-auth only outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("BETTING_FEED_ACCESS_TOKEN", "");
    vi.stubEnv("STREAMING_VIEWER_ACCESS_TOKEN", "");
    vi.stubEnv("BETTING_FEED_SKIP_AUTH", "true");
    primeHealthyStreamingMocks();

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

  it("ignores skip-auth in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BETTING_FEED_ACCESS_TOKEN", "");
    vi.stubEnv("STREAMING_VIEWER_ACCESS_TOKEN", "");
    vi.stubEnv("BETTING_FEED_SKIP_AUTH", "true");
    primeHealthyStreamingMocks();

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
});

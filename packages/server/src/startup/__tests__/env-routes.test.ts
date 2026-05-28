import { afterEach, describe, expect, it, vi } from "vitest";

import { registerEnvRoutes } from "../routes/env-routes";

type RouteHandler = (
  request: {
    headers: Record<string, string | string[] | undefined>;
    protocol: string;
  },
  reply: ReplyRecorder,
) => Promise<unknown>;

type ReplyRecorder = {
  body: string;
  headers: Record<string, string>;
  typeValue: string;
  header: (key: string, value: string) => ReplyRecorder;
  send: (body: string) => string;
  type: (value: string) => ReplyRecorder;
};

function createReplyRecorder(): ReplyRecorder {
  return {
    body: "",
    headers: {},
    typeValue: "",
    header(key: string, value: string) {
      this.headers[key] = value;
      return this;
    },
    send(body: string) {
      this.body = body;
      return body;
    },
    type(value: string) {
      this.typeValue = value;
      return this;
    },
  };
}

function createFastifyRecorder() {
  const routes = new Map<string, RouteHandler>();
  const fastify = {
    get(path: string, handler: RouteHandler) {
      routes.set(`GET ${path}`, handler);
      return this;
    },
  };

  return {
    fastify: fastify as never,
    routes,
  };
}

function extractEnv(body: string): Record<string, string> {
  const marker = "globalThis.env = ";
  const start = body.lastIndexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const jsonStart = start + marker.length;
  const jsonEnd = body.indexOf("\n", jsonStart);
  return JSON.parse(body.slice(jsonStart, jsonEnd).trim()) as Record<
    string,
    string
  >;
}

describe("env routes", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("emits same-origin runtime defaults for Coolify when public URLs are unset", async () => {
    vi.stubEnv("PUBLIC_API_URL", undefined);
    vi.stubEnv("PUBLIC_WS_URL", undefined);
    vi.stubEnv("PUBLIC_CDN_URL", undefined);

    const { fastify, routes } = createFastifyRecorder();
    registerEnvRoutes(fastify, {} as never);

    const reply = createReplyRecorder();
    await routes.get("GET /env.js")?.(
      {
        headers: {
          host: "game.example",
          "x-forwarded-proto": "https",
        },
        protocol: "http",
      },
      reply,
    );

    expect(reply.typeValue).toBe("application/javascript");
    expect(reply.headers).toMatchObject({
      "Cache-Control": "no-cache, no-store, must-revalidate",
    });
    expect(extractEnv(reply.body)).toMatchObject({
      PUBLIC_API_URL: "https://game.example",
      PUBLIC_WS_URL: "wss://game.example/ws",
      PUBLIC_CDN_URL: "https://game.example/game-assets",
    });
  });

  it("preserves explicitly configured public URLs", async () => {
    vi.stubEnv("PUBLIC_API_URL", "https://api.example");
    vi.stubEnv("PUBLIC_WS_URL", "wss://ws.example/ws");
    vi.stubEnv("PUBLIC_CDN_URL", "https://cdn.example/assets");

    const { fastify, routes } = createFastifyRecorder();
    registerEnvRoutes(fastify, {} as never);

    const reply = createReplyRecorder();
    await routes.get("GET /env.js")?.(
      {
        headers: {
          host: "game.example",
          "x-forwarded-proto": "https",
        },
        protocol: "http",
      },
      reply,
    );

    expect(extractEnv(reply.body)).toMatchObject({
      PUBLIC_API_URL: "https://api.example",
      PUBLIC_WS_URL: "wss://ws.example/ws",
      PUBLIC_CDN_URL: "https://cdn.example/assets",
    });
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

import { registerAgentRuntimeProxyRoutes } from "../routes/agent-runtime-proxy-routes";

type RouteHandler = (
  request: RequestShape,
  reply: ReplyRecorder,
) => Promise<unknown>;

type RequestShape = {
  body?: unknown;
  headers: Record<string, string | string[] | undefined>;
  method: string;
  url: string;
};

type ReplyRecorder = {
  headers: Record<string, string>;
  payload: unknown;
  statusCode: number;
  code: (statusCode: number) => ReplyRecorder;
  header: (key: string, value: string) => ReplyRecorder;
  send: (payload: unknown) => unknown;
};

function createReplyRecorder(): ReplyRecorder {
  return {
    headers: {},
    payload: undefined,
    statusCode: 200,
    code(statusCode: number) {
      this.statusCode = statusCode;
      return this;
    },
    header(key: string, value: string) {
      this.headers[key] = value;
      return this;
    },
    send(payload: unknown) {
      this.payload = payload;
      return payload;
    },
  };
}

function createFastifyRecorder() {
  const routes = new Map<string, RouteHandler>();
  const fastify = {
    all(path: string, handler: RouteHandler) {
      routes.set(`ALL ${path}`, handler);
      return this;
    },
  };

  return {
    fastify: fastify as never,
    routes,
  };
}

describe("agent runtime proxy routes", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.HYADES_RUNTIME_URL;
    delete process.env.SAFIER_RUNTIME_URL;
    delete process.env.AGENT_RUNTIME_URL;
    delete process.env.PUBLIC_HYADES_URL;
    delete process.env.PUBLIC_SAFIER_URL;
    delete process.env.PUBLIC_AGENT_RUNTIME_URL;
  });

  it("returns 503 when no runtime URL is configured", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { fastify, routes } = createFastifyRecorder();
    registerAgentRuntimeProxyRoutes(fastify);

    const reply = createReplyRecorder();
    await routes.get("ALL /api/agent-runtime/*")?.(
      {
        headers: {},
        method: "GET",
        url: "/api/agent-runtime/api/agents",
      },
      reply,
    );

    expect(reply.statusCode).toBe(503);
    expect(reply.payload).toMatchObject({
      error: "Agent runtime proxy is not configured",
    });
  });

  it("forwards method, path, query, headers, and JSON body", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    process.env.HYADES_RUNTIME_URL = "http://hyades.local:5555/base";

    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "content-type": "application/json" },
        status: 201,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { fastify, routes } = createFastifyRecorder();
    registerAgentRuntimeProxyRoutes(fastify);

    const reply = createReplyRecorder();
    await routes.get("ALL /api/agent-runtime/*")?.(
      {
        body: { message: "hello" },
        headers: {
          authorization: "Bearer token",
          host: "hyperscape.local",
          "x-request-id": ["a", "b"],
        },
        method: "POST",
        url: "/api/agent-runtime/api/agents/agent-1/message?trace=1",
      },
      reply,
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "http://hyades.local:5555/base/api/agents/agent-1/message?trace=1",
      expect.objectContaining({
        body: JSON.stringify({ message: "hello" }),
        method: "POST",
        redirect: "manual",
      }),
    );
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      authorization: "Bearer token",
      "x-request-id": "a, b",
    });
    expect(fetchMock.mock.calls[0]?.[1]?.headers).not.toHaveProperty("host");
    expect(reply.statusCode).toBe(201);
    expect(reply.headers).toMatchObject({ "content-type": "application/json" });
    expect(Buffer.isBuffer(reply.payload)).toBe(true);
  });
});

import { describe, expect, it, vi } from "vitest";

import { registerSafierRoutes } from "../routes/safier-routes";

type RouteHandler = (
  request: unknown,
  reply: ReplyRecorder,
) => Promise<unknown>;

type ReplyRecorder = {
  payload: unknown;
  statusCode: number;
  code: (statusCode: number) => ReplyRecorder;
  send: (payload: unknown) => unknown;
};

function createReplyRecorder(): ReplyRecorder {
  return {
    payload: undefined,
    statusCode: 200,
    code(statusCode: number) {
      this.statusCode = statusCode;
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

describe("SafierSemantics integration route", () => {
  it("exposes the Hyperscape plugin contract with packet ids", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});

    const { fastify, routes } = createFastifyRecorder();
    const world = {
      network: {
        sockets: new Map([
          ["socket-1", { player: { id: "player-1" } }],
          ["socket-2", {}],
        ]),
      },
    };

    registerSafierRoutes(fastify, world as never);
    const handler = routes.get(
      "GET /api/integrations/safier/hyperscape-plugin",
    );
    expect(handler).toBeDefined();

    const reply = createReplyRecorder();
    await handler?.({}, reply);

    expect(reply.statusCode).toBe(200);
    expect(reply.payload).toMatchObject({
      name: "hyperscape-safier-plugin",
      transport: {
        websocket: {
          encoding: "messagepack",
          packetShape: ["packetId", "payload"],
        },
      },
      authentication: {
        websocketPacket: "authenticate",
        credentialRoute: "POST /api/agents/credentials",
      },
      modalities: {
        text: {
          status: "ready",
        },
        voice: {
          status: "partial",
        },
        videoOut: {
          status: "ready",
        },
        videoIn: {
          status: "unsupported",
        },
      },
      grainIntegration: {
        recommendedRuntime: "MonumentalSystems/hyades",
        hostTemplate: "MonumentalSystems/hyades",
        openApiRequired: false,
        toolSurface: {
          preferred: "Hyades Gateway A2A JSON-RPC and OpenAI-compatible facade",
        },
      },
      hyadesGateway: {
        runtimeEnv: "HYADES_RUNTIME_URL",
        proxyBasePath: "/api/agent-runtime",
        surfaces: {
          openAiChatCompletions: {
            path: "/v1/chat/completions",
            multimodalInput: ["text", "image", "audio", "video"],
          },
          a2aJsonRpc: {
            path: "/a2a",
            methods: ["message/send", "message/stream"],
          },
        },
      },
      packets: {
        snapshot: 0,
        chatAdded: 2,
        moveRequest: 6,
        enterWorld: 114,
        authenticate: 264,
      },
      world: {
        connectedPlayers: 1,
      },
    });

    vi.restoreAllMocks();
  });
});

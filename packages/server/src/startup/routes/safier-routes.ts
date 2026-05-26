/**
 * Hyades/SafierSemantics integration metadata.
 *
 * This route gives an external Hyades/Safier plugin a stable, machine-readable
 * contract for the Hyperscape WebSocket packets and REST routes it should use.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { World } from "@hyperscape/shared";
import { getPacketId } from "@hyperscape/shared";
import { getDefaultPublicWsUrl } from "../../shared/public-ws-url.js";

const SAFIER_PACKET_NAMES = [
  "snapshot",
  "command",
  "chatAdded",
  "entityAdded",
  "entityModified",
  "entityRemoved",
  "playerState",
  "moveRequest",
  "resourceInteract",
  "resourceGather",
  "attackMob",
  "attackPlayer",
  "pickupItem",
  "dropItem",
  "useItem",
  "equipItem",
  "inventoryUpdated",
  "equipmentUpdated",
  "skillsUpdated",
  "characterSelected",
  "enterWorld",
  "enterWorldApproved",
  "enterWorldRejected",
  "syncGoal",
  "goalOverride",
  "syncAgentThought",
  "tileMovementStart",
  "tileMovementEnd",
  "authenticate",
  "authResult",
  "reconnected",
] as const;

const SAFIER_COMMANDS = [
  {
    command: "connect",
    description:
      "Open the WebSocket URL and send authenticate when a token is available.",
    packets: ["authenticate", "authResult", "snapshot"],
  },
  {
    command: "enterWorld",
    description: "Spawn the selected character into the world.",
    packets: [
      "characterSelected",
      "enterWorld",
      "enterWorldApproved",
      "enterWorldRejected",
    ],
  },
  {
    command: "moveTo",
    description: "Move the controlled character to a world position.",
    packets: ["moveRequest", "tileMovementStart", "tileMovementEnd"],
  },
  {
    command: "sendChat",
    description: "Emit local/world chat through the standard chat packet.",
    packets: ["chatAdded"],
  },
  {
    command: "attackEntity",
    description: "Attack a mob or player with server-side validation.",
    packets: ["attackMob", "attackPlayer"],
  },
  {
    command: "gatherResource",
    description:
      "Interact with a resource and let the server path/validate gathering.",
    packets: ["resourceInteract", "resourceGather"],
  },
  {
    command: "syncGoal",
    description:
      "Publish agent goal, available goals, personality, and planner scores to the dashboard.",
    packets: ["syncGoal"],
  },
  {
    command: "syncThought",
    description: "Publish decision-loop thoughts to the dashboard.",
    packets: ["syncAgentThought"],
  },
] as const;

const SAFIER_MODALITIES = {
  text: {
    status: "ready",
    description: "World chat, agent messages, goals, thoughts, and commands.",
    entrypoints: ["chatAdded", "POST /api/agents/:agentId/message"],
  },
  commands: {
    status: "ready",
    description:
      "Validated movement, combat, resource, inventory, equipment, and telemetry packets.",
    entrypoints: SAFIER_COMMANDS.map(({ command }) => command),
  },
  worldState: {
    status: "ready",
    description:
      "MessagePack snapshots and entity/player/inventory/equipment/skills updates.",
    entrypoints: [
      "snapshot",
      "entityAdded",
      "entityModified",
      "entityRemoved",
      "playerState",
    ],
  },
  voice: {
    status: "partial",
    description:
      "LiveKit transport exists in the agent plugin path when a snapshot provides wsUrl and token; Hyades should own STT/TTS orchestration.",
    entrypoints: ["snapshot.livekit"],
  },
  videoOut: {
    status: "ready",
    description:
      "Spectator/browser canvas capture and RTMP streaming are available for observation and broadcast.",
    entrypoints: ["spectator viewport", "streaming capture", "RTMP bridge"],
  },
  vision: {
    status: "partial",
    description:
      "Screenshots and spectator capture can support external visual analysis, but no dedicated runtime vision API is exposed yet.",
    entrypoints: ["spectator viewport", "browser screenshot"],
  },
  videoIn: {
    status: "unsupported",
    description:
      "Camera/video input is not currently modeled as an in-world or agent-control modality.",
    entrypoints: [],
  },
  avatarExpression: {
    status: "partial",
    description:
      "Avatar/VRM rendering exists, but no Safier-owned viseme or lip-sync contract is exposed yet.",
    entrypoints: ["avatar rendering"],
  },
} as const;

const SAFIER_GRAIN_INTEGRATION = {
  recommendedRuntime: "MonumentalSystems/hyades",
  legacyForkName: "HyperscapeAgents",
  hostTemplate: "MonumentalSystems/hyades",
  forkedFrom: "MonumentalSystems/maf-orleans",
  productionRuntime: "MonumentalSystems/hyades",
  openApiRequired: false,
  description:
    "Integrate through Hyades, the production headless Orleans + Microsoft Agent Framework backplane. Add Hyperscape grain interfaces/implementations or call its gateway surfaces instead of assuming a custom OpenAPI service.",
  grains: [
    {
      name: "HyperscapeFleetGrain",
      responsibility: "Fleet roster, lifecycle, model assignment, and budgets.",
    },
    {
      name: "HyperscapeWorldGrain",
      responsibility:
        "World connection profile and shared world/session state.",
    },
    {
      name: "HyperscapeAgentGrain",
      responsibility:
        "One in-world character, WebSocket client state, objectives, and decision heartbeat.",
    },
    {
      name: "HyperscapeObservationGrain",
      responsibility:
        "Optional screenshot/spectator/video observation fan-out for vision models.",
    },
    {
      name: "HyperscapeVoiceGrain",
      responsibility:
        "Optional LiveKit/STT/TTS bridge owned by the Safier runtime.",
    },
  ],
  toolSurface: {
    preferred: "Hyades Gateway A2A JSON-RPC and OpenAI-compatible facade",
    internal: "Versioned Orleans grains via Hyades.Abstractions",
    tools: "Microsoft Agent Framework AIFunctions via IPluginProvider and MCP",
    fallback: "/api/agent-runtime/* proxy for HTTP-compatible dashboard calls",
  },
} as const;

const HYADES_GATEWAY = {
  runtimeEnv: "HYADES_RUNTIME_URL",
  proxyBasePath: "/api/agent-runtime",
  surfaces: {
    openAiChatCompletions: {
      method: "POST",
      path: "/v1/chat/completions",
      streaming: true,
      multimodalInput: ["text", "image", "audio", "video"],
      output: ["text", "tool_calls", "reasoning_content", "usage"],
      notes:
        "Use X-Hyades-Thread to bind a Hyperscape agent/session to one Hyades conversation grain.",
    },
    models: {
      method: "GET",
      path: "/v1/models",
    },
    usage: {
      method: "GET",
      path: "/v1/usage/{consumer}",
    },
    a2aAgentCard: {
      method: "GET",
      path: "/.well-known/agent-card.json",
    },
    a2aJsonRpc: {
      method: "POST",
      path: "/a2a",
      methods: ["message/send", "message/stream"],
      streaming: true,
    },
  },
  authentication: {
    tokenHeader: "Authorization: Bearer <hyades-gateway-key>",
    consumerHeaderFallback: "X-Hyades-Consumer",
  },
} as const;

function buildPacketRegistry(): Record<string, number> {
  const registry: Record<string, number> = {};
  for (const name of SAFIER_PACKET_NAMES) {
    const packetId = getPacketId(name);
    if (packetId === null) {
      throw new Error(`Safier packet is not registered: ${name}`);
    }
    registry[name] = packetId;
  }
  return registry;
}

function countConnectedPlayers(world: World): number {
  const network = world.network as unknown as {
    sockets?: { values: () => Iterable<{ player?: unknown }> };
  };

  if (!network.sockets) {
    return 0;
  }

  let count = 0;
  for (const socket of network.sockets.values()) {
    if (socket.player) {
      count += 1;
    }
  }
  return count;
}

export function registerSafierRoutes(
  fastify: FastifyInstance,
  world: World,
): void {
  console.log(
    "[SafierRoutes] Registering Hyades/SafierSemantics integration routes...",
  );

  fastify.get(
    "/api/integrations/safier/hyperscape-plugin",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const wsUrl = process.env.PUBLIC_WS_URL || getDefaultPublicWsUrl();
      return reply.code(200).send({
        name: "hyperscape-safier-plugin",
        version: 1,
        description:
          "Machine-readable contract for Hyades/Safier fleet agents controlling Hyperscape characters.",
        transport: {
          websocket: {
            url: wsUrl,
            encoding: "messagepack",
            packetShape: ["packetId", "payload"],
          },
          restBasePath: "/api",
        },
        authentication: {
          tokenHeader: "Authorization: Bearer <token>",
          websocketPacket: "authenticate",
          requiredRuntimeSecrets: [
            "HYPERSCAPE_AUTH_TOKEN",
            "HYPERSCAPE_CHARACTER_ID",
          ],
          credentialRoute: "POST /api/agents/credentials",
        },
        lifecycleRoutes: {
          mappings: "POST /api/agents/mappings",
          mappingByAgent: "GET /api/agents/mapping/:agentId",
          agentMessage: "POST /api/agents/:agentId/message",
          agentGoal: "GET|POST /api/agents/:agentId/goal",
          agentThoughts: "GET|DELETE /api/agents/:agentId/thoughts",
          agentActivity: "GET /api/agents/:agentId/activity",
        },
        hyadesGateway: HYADES_GATEWAY,
        modalities: SAFIER_MODALITIES,
        grainIntegration: SAFIER_GRAIN_INTEGRATION,
        packets: buildPacketRegistry(),
        commands: SAFIER_COMMANDS,
        world: {
          connectedPlayers: countConnectedPlayers(world),
        },
      });
    },
  );
}

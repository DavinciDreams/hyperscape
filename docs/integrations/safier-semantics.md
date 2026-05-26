# Hyades / SafierSemantics Integration

Hyperscape can be controlled by an external Hyades/Safier runtime without going
through ElizaOS. `MonumentalSystems/hyades` is now the production target:
headless Orleans + Microsoft Agent Framework, with gateway surfaces for
OpenAI-compatible chat completions and Agent2Agent JSON-RPC, plus versioned
grain contracts in `Hyades.Abstractions`.

The integration boundary is intentionally small:

```text
Hyades HyperscapeAgentGrain or IConversationGrain
  -> HyperscapeClient
  -> Hyperscape WebSocket /ws
  -> Hyperscape world simulation
```

Hyperscape remains responsible for simulation, validation, persistence,
combat, inventory, skills, banking, quests, chat, and streaming/spectator
surfaces. Hyades owns the agent backplane: model routing, multimodal LLM turns,
tool invocation, per-consumer usage, grain persistence, traces/hooks, and A2A /
OpenAI-compatible gateway access.

## Plugin Contract Endpoint

Use this endpoint from a Safier plugin to discover the Hyperscape packet subset
and lifecycle routes:

```http
GET /api/integrations/safier/hyperscape-plugin
```

The response includes:

- WebSocket URL and encoding (`messagepack`)
- Packet shape (`[packetId, payload]`)
- Packet IDs for the first Safier client implementation
- Agent credential and mapping REST routes
- Dashboard telemetry routes for goals, thoughts, activity, and messages
- Supported modalities and their readiness levels
- Hyades gateway endpoints and recommended Orleans grain layout

This is the preferred source of truth for the C# packet registry instead of
copying IDs from TypeScript by hand.

## Hyades Gateway

Hyades listens on HTTP port `5555` by default and exposes:

- `POST /v1/chat/completions`: OpenAI-compatible streaming and non-streaming
  facade. Use `X-Hyades-Thread` to bind a Hyperscape agent/session to a stable
  conversation grain.
- `GET /v1/models`: OpenAI-compatible model list.
- `GET /v1/usage/{consumer}`: per-consumer usage.
- `GET /.well-known/agent-card.json`: A2A agent card.
- `POST /a2a`: JSON-RPC methods `message/send` and `message/stream`.

Hyades accepts inline multimodal inputs through the gateway and injects them at
the model wire level as data URI parts:

- text
- image: `image/png`, `image/jpeg`, `image/webp`, `image/gif`
- audio: `audio/wav`, `audio/mpeg`, `audio/ogg`
- video: `video/mp4`

Hyades output is text/tool events/reasoning/usage, not generated media. For
Hyperscape, that means Hyades can reason over images/audio/video supplied by
observation or voice capture, while Hyperscape remains the game simulation and
rendering/streaming source.

## Modalities

Hyperscape is already set up for these Hyades/Safier-facing modalities:

- `text`: ready for chat, dashboard messages, goals, thoughts, and command
  requests.
- `commands`: ready for movement, combat, gathering, inventory, equipment, and
  telemetry packets.
- `worldState`: ready through snapshots plus entity, player, inventory,
  equipment, and skill updates.
- `videoOut`: ready through spectator/browser capture and RTMP streaming.
- `vision`: partial; screenshots and spectator capture can support external
  visual analysis, but there is no dedicated runtime vision API yet.
- `voice`: partial; the existing agent plugin path can connect to LiveKit when
  snapshot data provides a `wsUrl` and token, but STT/TTS ownership should live
  in Hyades.
- `videoIn`: unsupported; camera/video input is not currently an in-world agent
  modality.
- `avatarExpression`: partial; avatar rendering exists, but no Safier viseme or
  lip-sync contract is exposed yet.

## Runtime URL Configuration

The client dashboard supports neutral agent runtime naming:

```bash
PUBLIC_AGENT_RUNTIME_URL=http://localhost:5050
```

`PUBLIC_HYADES_URL` and `PUBLIC_SAFIER_URL` are accepted aliases. Existing
`PUBLIC_ELIZAOS_URL` still works for backward compatibility, but new Hyades
deployments should prefer `PUBLIC_AGENT_RUNTIME_URL` or `PUBLIC_HYADES_URL`.

For Hyades or a Mac-hosted SafierSemantics runtime, prefer proxying through
Hyperscape so the browser stays on one origin:

```bash
# Hyperscape server
HYADES_RUNTIME_URL=http://hyades.internal
# or: SAFIER_RUNTIME_URL=http://<mac-lan-ip>:5555

# Hyperscape client/dashboard
PUBLIC_AGENT_RUNTIME_URL=/api/agent-runtime
```

The proxy forwards `/api/agent-runtime/*` to the configured runtime. For example,
`/api/agent-runtime/v1/chat/completions` becomes
`http://hyades.internal/v1/chat/completions`.

## Saturn MCP Configuration

`MonumentalSystems/hyades` has the production MCP integration path:

- `Hyades.Grains/Services/McpToolProvider.cs`
- `Hyades.Silo/Program.cs`
- `Hyades.Silo/appsettings.Mcp.Example.json`

Configure Saturn through environment variables or local user secrets, not in
tracked appsettings files:

```bash
Mcp__Servers__Saturn__Type=http
Mcp__Servers__Saturn__Url=https://saturn.gnostr.cloud/mcp
Mcp__Servers__Saturn__Headers__Authorization="Bearer <SATURN_MCP_KEY>"
```

The `MonumentalSystems.Mcp` client discovers these tools lazily through
`McpToolProvider`, then exposes them to Microsoft Agent Framework as
`AIFunction`s.

## Minimum Safier Client Loop

1. Request or load an agent credential from `POST /api/agents/credentials`.
2. Open the WebSocket URL from the plugin contract endpoint.
3. Send `authenticate` with the JWT if auth is enabled.
4. Wait for `authResult` and `snapshot`.
5. Send `characterSelected` when needed, then `enterWorld`.
6. Maintain a local cache from `snapshot`, `entityAdded`, `entityModified`,
   `entityRemoved`, `playerState`, `inventoryUpdated`, `equipmentUpdated`, and
   `skillsUpdated`.
7. Send high-level commands using packet names from the contract endpoint:
   `moveRequest`, `chatAdded`, `attackMob`, `attackPlayer`,
   `resourceInteract`, `pickupItem`, `useItem`, and `equipItem`.
8. Publish operator telemetry with `syncGoal` and `syncAgentThought` so the
   existing dashboard can show Safier decisions.

## Hyades Grain Shape

`hyades` is already the productionized fork of `maf-orleans`. Prefer adding
Hyperscape-specific abstractions there instead of starting another host unless
deployment isolation requires it.

1. Add Hyperscape grain interfaces in `Hyades.Abstractions`.
2. Add grain implementations and a WebSocket-backed `HyperscapeClient` in the
   Hyades grains project.
3. Register the grains and expose agent-callable operations through
   `IPluginProvider` / Microsoft Agent Framework `AIFunction`s.
4. Treat OpenAPI as optional. If MAF exposes an OpenAPI surface automatically,
   use it for dashboard convenience, but do not make Hyperscape depend on it.
5. Use Hyperscape's `/api/agent-runtime/*` proxy only for REST-compatible
   dashboard calls that Hyades intentionally exposes.

Recommended Orleans shape:

- `HyperscapeFleetGrain`: roster, lifecycle, model/provider assignment.
- `HyperscapeWorldGrain`: one Hyperscape server/world connection profile.
- `HyperscapeAgentGrain`: one in-world character and decision heartbeat.
- `HyperscapeObservationGrain`: optional screenshot/spectator/video observation
  fan-out for vision models.
- `HyperscapeVoiceGrain`: optional LiveKit, STT, and TTS bridge owned by the
  Hyades runtime.
- `HyperscapeClient`: WebSocket transport and state cache.
- `LlmOperationGrain`: model calls and budget/rate-limit enforcement.
- `WorkflowGrain`: experiments and replayable evaluations.

## Hyades Repo Touchpoints

The Hyades-side implementation should follow the native shapes already present
in `MonumentalSystems/hyades`:

- `Hyades.Abstractions/IConversationGrain.cs`
- `Hyades.Abstractions/ConversationRequest.cs`
- `Hyades.Abstractions/ChatAttachment.cs`
- `Hyades.Abstractions/IPluginProvider.cs`
- `Hyades.Grains/ConversationGrain.cs`
- `Hyades.Grains/Agent/AgentFactory.cs`
- `Hyades.Grains/Agent/MultimodalInjectionPolicy.cs`
- `Hyades.Grains/Services/McpToolProvider.cs`
- `Hyades.Gateway/GatewayEndpoints.cs`
- `Hyades.Silo/Program.cs`

Use `Hyades.Gateway` first when HTTP is enough. Use direct Orleans grain calls
from in-cluster consumers when Hyperscape-specific grains need lower latency or
stronger state ownership. Use `IPluginProvider` and MCP for agent-callable tools.

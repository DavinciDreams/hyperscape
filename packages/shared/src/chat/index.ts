import { ChatChannelRegistry } from "./ChatRouter.js";

export {
  ChatChannelRegistry,
  ChatRouter,
  UnknownChatChannelError,
  type ChatMessageInput,
  type ChatRouteResult,
  type ChatRejectReason,
  type FilterAction,
  type FilterHit,
} from "./ChatRouter.js";

/**
 * Module-level singleton. Mirrors the `damageTypeRegistry`,
 * `npcScheduleRegistry`, and `worldAreasRegistry` patterns so
 * `PIEEditorSession.updateManifests({ chatChannels })` can
 * live-dispatch authored edits to a shared, id-indexed view of the
 * chat-channel catalog — even before the HUD ChatWindow +
 * ServerNetwork bridge read through it directly. `ChatRouter`
 * instances are per-session (they own the cooldown + rate-limit
 * counters) — the registry is the shared catalog those routers
 * read from.
 */
export const chatChannelRegistry = new ChatChannelRegistry();

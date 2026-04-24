import { PartyGuildRegistry } from "./PartyGuildRegistry.js";

export {
  PartyGuildNotLoadedError,
  PartyGuildRegistry,
  UnknownPerkError,
  UnknownRankError,
  type GuildLevelResolution,
  type GuildNameReason,
  type GuildNameResult,
  type PartyJoinReason,
  type PartyJoinResult,
} from "./PartyGuildRegistry.js";

/**
 * Module-level singleton. Mirrors the other registry patterns so
 * `PIEEditorSession.updateManifests({ partyGuild })` can
 * live-dispatch authored edits to party loot/xp policies + guild
 * rank/perk/alliance rules. Stateless wrt active parties/guilds
 * (PartyManager + GuildRegistry runtime own those); `load()` swaps
 * policy reference.
 */
export const partyGuildRegistry = new PartyGuildRegistry();

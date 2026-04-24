import { VoiceChatRegistry } from "./VoiceChatRegistry.js";

export {
  UnknownVoiceRoomError,
  VoiceChatNotLoadedError,
  VoiceChatRegistry,
  type AutoMuteInput,
  type AutoMuteReason,
  type AutoMuteResult,
  type VoiceJoinReason,
  type VoiceJoinResult,
} from "./VoiceChatRegistry.js";

/**
 * Module-level singleton. Mirrors the other registry patterns so
 * `PIEEditorSession.updateManifests({ voiceChat })` can live-dispatch
 * authored edits to room/falloff/auto-mute rules. Stateless wrt
 * active voice sessions (VoiceChatSystem + LiveKit own those);
 * `load()` swaps policy reference and re-indexes rooms.
 */
export const voiceChatRegistry = new VoiceChatRegistry();

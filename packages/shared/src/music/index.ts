import { MusicStateMachineRegistry } from "./MusicStateController.js";

export {
  MusicStateController,
  MusicStateMachineRegistry,
  UnknownMusicStateMachineError,
  UnknownMusicStateError,
  type MusicTransitionEvent,
  type PredicateMap,
} from "./MusicStateController.js";

/**
 * Module-level singleton. Mirrors the `damageTypeRegistry`,
 * `npcScheduleRegistry`, and `worldAreasRegistry` patterns so
 * `PIEEditorSession.updateManifests({ musicStateMachine })` can
 * live-dispatch authored edits to a shared, id-indexed view of
 * the music state-machine catalog — even before a runtime music
 * driver reads through it directly. `MusicStateController`
 * instances are per-world/per-zone (they own the current-state +
 * cooldown state); this registry is the shared catalog they spin
 * up from.
 */
export const musicStateMachineRegistry = new MusicStateMachineRegistry();

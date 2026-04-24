import { SfxRegistry } from "./SfxRegistry.js";

export {
  SfxRegistry,
  UnknownSoundError,
  type ResolveOptions,
  type ResolvedSound,
} from "./SfxRegistry.js";

/**
 * Module-level singleton. Mirrors the `damageTypeRegistry`,
 * `npcScheduleRegistry`, and `worldAreasRegistry` patterns so
 * `PIEEditorSession.updateManifests({ sfx })` can live-dispatch
 * authored edits to a shared, id-indexed view of the sfx catalog —
 * even before the audio system reads through it directly.
 */
export const sfxRegistry = new SfxRegistry();

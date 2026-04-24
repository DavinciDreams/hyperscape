import { AudioBusMixer } from "./AudioBusMixer.js";

export {
  AudioBusMixer,
  type BusRuntimeInput,
  type ComputeGainsOptions,
} from "./AudioBusMixer.js";

/**
 * Module-level singleton. Mirrors the `damageTypeRegistry`,
 * `npcScheduleRegistry`, and `worldAreasRegistry` patterns so
 * `PIEEditorSession.updateManifests({ audioBusMix })` can
 * live-dispatch authored bus-graph edits to a shared mixer —
 * even before the runtime audio transport (Web Audio, FMOD, etc.)
 * binds through it directly.
 */
export const audioBusMixer = new AudioBusMixer();

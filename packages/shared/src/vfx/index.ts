import { VfxRegistry } from "./VfxRegistry.js";

export {
  VfxRegistry,
  UnknownVfxError,
  sampleCurve,
  type ResolvedVfxSpawn,
} from "./VfxRegistry.js";

/**
 * Module-level singleton. Mirrors the `damageTypeRegistry`,
 * `npcScheduleRegistry`, and `worldAreasRegistry` patterns so
 * `PIEEditorSession.updateManifests({ vfx })` can live-dispatch
 * authored edits to a shared, id-indexed view of the vfx catalog —
 * even before the vfx spawner reads through it directly.
 */
export const vfxRegistry = new VfxRegistry();

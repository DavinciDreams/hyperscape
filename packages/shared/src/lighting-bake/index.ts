import { LightingBakeRegistry } from "./LightingBakeRegistry.js";

export {
  type EffectiveBakeSettings,
  LightingBakeNotLoadedError,
  LightingBakeRegistry,
} from "./LightingBakeRegistry.js";

/**
 * Module-level singleton. Mirrors the other registry patterns so
 * `PIEEditorSession.updateManifests({ lightingBake })` can
 * live-dispatch authored edits to bake settings + per-sublevel
 * overrides + lightprobe volumes. Stateless wrt the baked data
 * itself (offline baker + runtime renderer own those); `load()`
 * swaps the policy reference.
 */
export const lightingBakeRegistry = new LightingBakeRegistry();

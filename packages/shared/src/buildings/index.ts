import { BuildingsRegistry } from "./BuildingsRegistry.js";

export {
  BuildingsNotLoadedError,
  BuildingsRegistry,
  UnknownBuildingError,
} from "./BuildingsRegistry.js";

/**
 * Module-level singleton. Mirrors the other registry patterns so
 * `PIEEditorSession.updateManifests({ buildings })` can live-dispatch
 * authored procgen building catalog edits consumed by world-gen /
 * settlement scattering systems on the next generation pass.
 */
export const buildingsRegistry = new BuildingsRegistry();

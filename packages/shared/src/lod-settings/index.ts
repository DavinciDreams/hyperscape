import { LODSettingsRegistry } from "./LODSettingsRegistry.js";

export {
  LODSettingsMissingDefaultError,
  LODSettingsNotLoadedError,
  LODSettingsRegistry,
} from "./LODSettingsRegistry.js";

/**
 * Module-level singleton. Mirrors the other registry patterns so
 * `PIEEditorSession.updateManifests({ lodSettings })` can live-
 * dispatch authored LOD distance ladders + dissolve rules to the
 * renderer LOD compositor on the next authority resolve.
 */
export const lodSettingsRegistry = new LODSettingsRegistry();

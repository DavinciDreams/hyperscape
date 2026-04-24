import { QualityPresetsRegistry } from "./QualityPresetsRegistry.js";

export {
  QualityPresetsNotLoadedError,
  QualityPresetsRegistry,
  UnknownQualityPresetError,
} from "./QualityPresetsRegistry.js";

/**
 * Module-level singleton. Mirrors the other registry patterns so
 * `PIEEditorSession.updateManifests({ qualityPresets })` can live-
 * dispatch authored renderer quality-tier edits to the runtime
 * renderer on the next preset switch.
 */
export const qualityPresetsRegistry = new QualityPresetsRegistry();

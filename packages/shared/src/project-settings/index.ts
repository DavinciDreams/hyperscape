import { ProjectSettingsRegistry } from "./ProjectSettingsRegistry.js";

export {
  ProjectSettingsNotLoadedError,
  ProjectSettingsRegistry,
  UnknownPluginIdError,
} from "./ProjectSettingsRegistry.js";

/**
 * Module-level singleton. Mirrors the other registry patterns so
 * `PIEEditorSession.updateManifests({ projectSettings })` can live-
 * dispatch authored project-level config edits (game mode, seed,
 * locale, default scheme, render profile, plugins) to the runtime
 * on the next read.
 */
export const projectSettingsRegistry = new ProjectSettingsRegistry();

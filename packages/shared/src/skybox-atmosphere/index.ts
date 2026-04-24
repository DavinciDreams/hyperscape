import { SkyboxAtmosphereRegistry } from "./SkyboxAtmosphereRegistry.js";

export {
  SkyboxAtmosphereNotLoadedError,
  SkyboxAtmosphereRegistry,
  UnknownSkyboxError,
} from "./SkyboxAtmosphereRegistry.js";

/**
 * Module-level singleton. Mirrors the other registry patterns so
 * `PIEEditorSession.updateManifests({ skyboxAtmosphere })` can
 * live-dispatch authored edits to the skybox catalog. Stateless wrt
 * render state (SkyboxSystem reads through this to swap active skies);
 * `load()` re-indexes skyboxes by id and swaps the policy reference.
 */
export const skyboxAtmosphereRegistry = new SkyboxAtmosphereRegistry();

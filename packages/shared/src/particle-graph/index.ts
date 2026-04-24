import { ParticleGraphRegistry } from "./ParticleGraphRegistry.js";

export {
  ParticleGraphNotLoadedError,
  ParticleGraphRegistry,
  type ParticleInitializerKind,
  type ParticleRendererKind,
  type ParticleUpdaterKind,
  UnknownParticleSystemError,
} from "./ParticleGraphRegistry.js";

/**
 * Module-level singleton. Mirrors the other registry patterns so
 * `PIEEditorSession.updateManifests({ particleGraph })` can
 * live-dispatch authored edits. Stateless wrt spawned particle
 * instances (VFX runtime owns those); `load()` re-indexes particle
 * systems by id.
 */
export const particleGraphRegistry = new ParticleGraphRegistry();

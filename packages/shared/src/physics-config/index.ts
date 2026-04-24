import { PhysicsConfigRegistry } from "./PhysicsConfigRegistry.js";

export {
  PhysicsConfigNotLoadedError,
  PhysicsConfigRegistry,
  UnknownCollisionLayerError,
  UnknownPhysicsMaterialError,
} from "./PhysicsConfigRegistry.js";

/**
 * Module-level singleton. Mirrors the other registry patterns so
 * `PIEEditorSession.updateManifests({ physicsConfig })` can live-dispatch
 * authored edits to PhysX materials + collision layers + simulation
 * tuning read by the physics world at construction time.
 */
export const physicsConfigRegistry = new PhysicsConfigRegistry();

import { NavMeshRegistry } from "./NavMeshRegistry.js";

export {
  NavMeshNotLoadedError,
  NavMeshRegistry,
  UnknownNavAgentError,
} from "./NavMeshRegistry.js";

/**
 * Module-level singleton. Mirrors the other registry patterns so
 * `PIEEditorSession.updateManifests({ navMesh })` can live-dispatch
 * authored edits to voxelizer/agent/modifier rules. Stateless wrt
 * baked nav data (runtime pathfinder owns that); `load()` swaps the
 * manifest reference.
 */
export const navMeshRegistry = new NavMeshRegistry();

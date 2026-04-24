import { ReplicationRegistry } from "./ReplicationRegistry.js";

export {
  ReplicationNotLoadedError,
  ReplicationRegistry,
  UnknownReplicatedComponentError,
  UnknownReplicatedEventError,
} from "./ReplicationRegistry.js";

/**
 * Module-level singleton. Mirrors the other registry patterns so
 * `PIEEditorSession.updateManifests({ replication })` can live-
 * dispatch authored replicated-field + event edits to the netcode
 * delta-replicator on the next authority resolve.
 */
export const replicationRegistry = new ReplicationRegistry();

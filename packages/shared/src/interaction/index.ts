import { InteractionConfigRegistry } from "./InteractionConfigRegistry.js";

export {
  InteractionConfigNotLoadedError,
  InteractionConfigRegistry,
  type SessionKind,
} from "./InteractionConfigRegistry.js";

/**
 * Module-level singleton. Mirrors the other registry patterns so
 * `PIEEditorSession.updateManifests({ interaction })` can live-
 * dispatch authored session-type + interaction-distance + rate-limit
 * tuning on the next authority resolve.
 */
export const interactionConfigRegistry = new InteractionConfigRegistry();

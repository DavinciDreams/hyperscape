import { DeployTargetsRegistry } from "./DeployTargetsRegistry.js";

export {
  DeployTargetsNotLoadedError,
  DeployTargetsRegistry,
  UnknownDeployTargetError,
} from "./DeployTargetsRegistry.js";

/**
 * Module-level singleton. Mirrors the other registry patterns so
 * `PIEEditorSession.updateManifests({ deployTargets })` can live-
 * dispatch authored deployment target edits (environment, provider,
 * secret name refs) to the editor Deploy panel on the next open.
 */
export const deployTargetsRegistry = new DeployTargetsRegistry();

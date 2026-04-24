import { LoadoutPolicyRegistry } from "./LoadoutPolicyRegistry.js";

export {
  LoadoutPolicyNotLoadedError,
  LoadoutPolicyRegistry,
  type SaveCheckReason,
  type SaveCheckResult,
  type SaveContext,
  type SwapCheckReason,
  type SwapCheckResult,
  type SwapContext,
} from "./LoadoutPolicyRegistry.js";

/**
 * Module-level singleton. Mirrors the other registry patterns so
 * `PIEEditorSession.updateManifests({ loadouts })` can live-dispatch
 * authored edits to slot/swap/save/sharing policy consumed by
 * LoadoutSystem.
 */
export const loadoutPolicyRegistry = new LoadoutPolicyRegistry();

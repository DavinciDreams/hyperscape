import { FeatureFlagRegistry } from "./FeatureFlagRegistry.js";

export {
  FeatureFlagRegistry,
  UnknownFlagError,
  hashBucket,
  type EvaluationPrincipal,
} from "./FeatureFlagRegistry.js";

/**
 * Module-level singleton. Mirrors the other registry patterns so
 * `PIEEditorSession.updateManifests({ featureFlags })` can live-dispatch
 * authored edits to the flag/rule/mutex graph consumed by gameplay
 * gating + remote-config bridges.
 */
export const featureFlagRegistry = new FeatureFlagRegistry();

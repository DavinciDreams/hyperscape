import { TutorialFlowsRegistry } from "./TutorialFlowsRegistry.js";

export {
  TutorialFlowsNotLoadedError,
  TutorialFlowsRegistry,
  UnknownTutorialFlowError,
  UnknownTutorialStepError,
  type AvailabilityReason,
  type AvailabilityResult,
} from "./TutorialFlowsRegistry.js";

/**
 * Module-level singleton. Mirrors the other registry patterns so
 * `PIEEditorSession.updateManifests({ tutorialFlows })` can live-
 * dispatch authored flow/step/trigger edits to the tutorial runner
 * on the next flow-start check.
 */
export const tutorialFlowsRegistry = new TutorialFlowsRegistry();

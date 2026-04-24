import { OnboardingGoalsRegistry } from "./OnboardingGoalsRegistry.js";

export {
  OnboardingGoalsNotLoadedError,
  OnboardingGoalsRegistry,
  UnknownOnboardingGoalError,
  type AvailabilityReason,
  type AvailabilityResult,
} from "./OnboardingGoalsRegistry.js";

/**
 * Module-level singleton. Mirrors the other registry patterns so
 * `PIEEditorSession.updateManifests({ onboardingGoals })` can live-
 * dispatch authored goal-graph edits to the new-player HUD / tutorial
 * advisor on the next lookup.
 */
export const onboardingGoalsRegistry = new OnboardingGoalsRegistry();

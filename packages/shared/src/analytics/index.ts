import { AnalyticsEventRouter } from "./AnalyticsEventRouter.js";

export {
  AnalyticsEventRouter,
  type AnalyticsValidationError,
  type PropValue,
  type ValidateOptions,
  type ValidationOutcome,
} from "./AnalyticsEventRouter.js";

/**
 * Module-level singleton. Mirrors the other registry patterns so
 * `PIEEditorSession.updateManifests({ analyticsEvents })` can live-
 * dispatch authored event-schema edits to the analytics router on
 * the next validate() call.
 */
export const analyticsEventRouter = new AnalyticsEventRouter();

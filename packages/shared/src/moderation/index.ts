import { ModerationRegistry } from "./ModerationRegistry.js";

export {
  ModerationNotLoadedError,
  ModerationRegistry,
  UnknownFilterRuleError,
  UnknownReportCategoryError,
  type AppealEligibilityInput,
  type AppealEligibilityReason,
  type AppealEligibilityResult,
  type ReportRateInput,
  type ReportRateResult,
  type ReportReason,
  type SanctionResolution,
} from "./ModerationRegistry.js";

/**
 * Module-level singleton. Mirrors the other registry patterns so
 * `PIEEditorSession.updateManifests({ moderation })` can live-
 * dispatch authored edits to report/filter/sanction policy consumed
 * by ModerationSystem.
 */
export const moderationRegistry = new ModerationRegistry();

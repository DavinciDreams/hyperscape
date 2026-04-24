import { AchievementEvaluator } from "./AchievementEvaluator.js";

export {
  AchievementEvaluator,
  UnknownAchievementError,
  type AchievementProgressState,
  type AchievementUnlock,
  type AchievementCountProgress,
  type EventPayload,
  type EventPayloadValue,
} from "./AchievementEvaluator.js";

/**
 * Module-level singleton. Mirrors the `damageTypeRegistry`,
 * `worldAreasRegistry`, and `audioBusMixer` patterns so
 * `PIEEditorSession.updateManifests({ achievements })` can
 * live-dispatch authored edits to a shared, id-indexed view of
 * the achievement catalog — even before the awarder system reads
 * through it directly. Stateless wrt per-player progress
 * (`AchievementProgressState` is caller-owned); `load()` just
 * re-indexes achievements + their event/stat reverse maps.
 */
export const achievementEvaluator = new AchievementEvaluator();

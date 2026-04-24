/**
 * Processing live-getters — PIE-hotreloadable view over Processing manifest.
 *
 * Prefers the current `processingProvider.getManifest()` when loaded; falls
 * back to the boot-captured `PROCESSING_CONSTANTS` façade otherwise. Engine
 * systems (FireManager, *SessionManager, PendingCookingManager) read through
 * these getters so that PIE `updateManifests({ processing })` edits take
 * effect without a cold boot.
 *
 * Each getter narrows to the single field the call site needs to keep the
 * migration surface minimal and the fallback paths explicit.
 */

import { PROCESSING_CONSTANTS } from "../../constants/ProcessingConstants";
import { processingProvider } from "../ProcessingProvider";

/** Per-request rate-limit window (ms) guarding cooking/firemaking spam. */
export function getProcessingRateLimitMs(): number {
  return (
    processingProvider.getManifest()?.timing.rateLimitMs ??
    PROCESSING_CONSTANTS.RATE_LIMIT_MS
  );
}

/** Max concurrent fires owned by a single player. */
export function getMaxFiresPerPlayer(): number {
  return (
    processingProvider.getManifest()?.fire.maxFiresPerPlayer ??
    PROCESSING_CONSTANTS.FIRE.maxFiresPerPlayer
  );
}

/** World-units cooking interaction range at a fire. */
export function getFireInteractionRange(): number {
  return (
    processingProvider.getManifest()?.fire.interactionRange ??
    PROCESSING_CONSTANTS.FIRE.interactionRange
  );
}

/** Ticks-per-cook (OSRS: 4 by default). */
export function getCookingTicksPerItem(): number {
  return (
    processingProvider.getManifest()?.skillMechanics.cooking.ticksPerItem ??
    PROCESSING_CONSTANTS.SKILL_MECHANICS.cooking.ticksPerItem
  );
}

/** Base firemaking roll window in ticks (OSRS: 20). */
export function getFiremakingBaseRollTicks(): number {
  return (
    processingProvider.getManifest()?.skillMechanics.firemaking.baseRollTicks ??
    PROCESSING_CONSTANTS.SKILL_MECHANICS.firemaking.baseRollTicks
  );
}

/** Walk-west-then-… priority order for fire walk-around resolution. */
export function getFireWalkPriority(): readonly string[] {
  return (
    processingProvider.getManifest()?.fireWalkPriority ??
    PROCESSING_CONSTANTS.FIRE_WALK_PRIORITY
  );
}

/** OSRS firemaking success-rate LERP endpoints (numerator over /256). */
export function getFiremakingSuccessRate(): { low: number; high: number } {
  return (
    processingProvider.getManifest()?.firemakingSuccessRate ??
    PROCESSING_CONSTANTS.FIREMAKING_SUCCESS_RATE
  );
}

/** Fire burn-duration range in ticks. */
export function getFireDurationRangeTicks(): {
  minDurationTicks: number;
  maxDurationTicks: number;
} {
  const fire =
    processingProvider.getManifest()?.fire ?? PROCESSING_CONSTANTS.FIRE;
  return {
    minDurationTicks: fire.minDurationTicks,
    maxDurationTicks: fire.maxDurationTicks,
  };
}

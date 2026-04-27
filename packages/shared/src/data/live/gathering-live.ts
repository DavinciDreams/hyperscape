/**
 * Gathering live-getters — PIE-hotreloadable view over Gathering manifest.
 *
 * Prefers the current `gatheringProvider.getManifest()` when loaded; falls
 * back to the boot-captured `GATHERING_CONSTANTS` façade otherwise. Engine
 * systems (ResourceSystem, SuccessRateCalculator, PendingGatherManager,
 * PendingCookManager) read through these getters so that PIE
 * `updateManifests({ gathering })` edits take effect without a cold boot.
 *
 * Each getter narrows to the single field (or nested section) the call site
 * needs to keep the migration surface minimal and the fallback path explicit.
 */

import type {
  FishingSpotMove,
  FlatRateTable,
  GatheringSkillMechanics,
  SuccessRate,
  TickTable,
  WoodcuttingRateTable,
} from "@hyperforge/manifest-schema";
import { GATHERING_CONSTANTS } from "../../constants/GatheringConstants";
import { gatheringProvider } from "../GatheringProvider";

/** Tile-based gathering reach (tiles). */
export function getGatheringRange(): number {
  return (
    gatheringProvider.getManifest()?.ranges.gatheringRange ??
    GATHERING_CONSTANTS.GATHERING_RANGE
  );
}

/** Fallback world-unit radius when exact-id match fails. */
export function getProximitySearchRadius(): number {
  return (
    gatheringProvider.getManifest()?.ranges.proximitySearchRadius ??
    GATHERING_CONSTANTS.PROXIMITY_SEARCH_RADIUS
  );
}

/** Legacy world-unit range for non-tile callers. */
export function getDefaultInteractionRange(): number {
  return (
    gatheringProvider.getManifest()?.ranges.defaultInteractionRange ??
    GATHERING_CONSTANTS.DEFAULT_INTERACTION_RANGE
  );
}

/** Floating-point movement tolerance. */
export function getPositionEpsilon(): number {
  return (
    gatheringProvider.getManifest()?.ranges.positionEpsilon ??
    GATHERING_CONSTANTS.POSITION_EPSILON
  );
}

/** Absolute floor on one gather cycle length in ticks. */
export function getMinimumCycleTicks(): number {
  return (
    gatheringProvider.getManifest()?.timing.minimumCycleTicks ??
    GATHERING_CONSTANTS.MINIMUM_CYCLE_TICKS
  );
}

/** Per-request rate-limit window guarding gather spam (ms). */
export function getGatheringRateLimitMs(): number {
  return (
    gatheringProvider.getManifest()?.timing.rateLimitMs ??
    GATHERING_CONSTANTS.RATE_LIMIT_MS
  );
}

/** Stale-request eviction threshold for the rate-limit map (ms). */
export function getStaleRateLimitMs(): number {
  return (
    gatheringProvider.getManifest()?.timing.staleRateLimitMs ??
    GATHERING_CONSTANTS.STALE_RATE_LIMIT_MS
  );
}

/** How often to sweep the rate-limit map for stale entries (ms). */
export function getRateLimitCleanupIntervalMs(): number {
  return (
    gatheringProvider.getManifest()?.timing.rateLimitCleanupIntervalMs ??
    GATHERING_CONSTANTS.RATE_LIMIT_CLEANUP_INTERVAL_MS
  );
}

/** Per-tick timer regeneration amount. */
export function getTimerRegenPerTick(): number {
  return (
    gatheringProvider.getManifest()?.timing.timerRegenPerTick ??
    GATHERING_CONSTANTS.TIMER_REGEN_PER_TICK
  );
}

/** classic MMORPG woodcutting success-rate matrix (tree → tool → {low, high}). */
export function getWoodcuttingSuccessRates(): WoodcuttingRateTable {
  return (
    gatheringProvider.getManifest()?.woodcuttingSuccessRates ??
    GATHERING_CONSTANTS.WOODCUTTING_SUCCESS_RATES
  );
}

/** classic MMORPG mining success-rate table (rock → {low, high}). */
export function getMiningSuccessRates(): FlatRateTable {
  return (
    gatheringProvider.getManifest()?.miningSuccessRates ??
    GATHERING_CONSTANTS.MINING_SUCCESS_RATES
  );
}

/** classic MMORPG fishing success-rate table (spot → {low, high}). */
export function getFishingSuccessRates(): FlatRateTable {
  return (
    gatheringProvider.getManifest()?.fishingSuccessRates ??
    GATHERING_CONSTANTS.FISHING_SUCCESS_RATES
  );
}

/** Fallback success-rate when exact-variant lookup misses. */
export function getDefaultSuccessRate(): SuccessRate {
  return (
    gatheringProvider.getManifest()?.defaultSuccessRate ??
    GATHERING_CONSTANTS.DEFAULT_SUCCESS_RATE
  );
}

/** Per-skill mechanic config (baseRollTicks + tool effects). */
export function getGatheringSkillMechanics(): GatheringSkillMechanics {
  return (
    gatheringProvider.getManifest()?.skillMechanics ??
    GATHERING_CONSTANTS.SKILL_MECHANICS
  );
}

/** Max allowed character length for a resource id. */
export function getMaxResourceIdLength(): number {
  return (
    gatheringProvider.getManifest()?.resourceIdRules.maxLength ??
    GATHERING_CONSTANTS.MAX_RESOURCE_ID_LENGTH
  );
}

/** Compiled regex — cached so load() invalidates by comparing source string. */
let _cachedRegexSource: string | null = null;
let _cachedRegex: RegExp = GATHERING_CONSTANTS.VALID_RESOURCE_ID_PATTERN;

/** Resource-id allowlist regex (recompiled on source change). */
export function getValidResourceIdPattern(): RegExp {
  const liveSource =
    gatheringProvider.getManifest()?.resourceIdRules.validPattern ?? null;
  if (liveSource === null) {
    return GATHERING_CONSTANTS.VALID_RESOURCE_ID_PATTERN;
  }
  if (liveSource !== _cachedRegexSource) {
    _cachedRegexSource = liveSource;
    _cachedRegex = new RegExp(liveSource);
  }
  return _cachedRegex;
}

/** Per-tree-variant despawn-delay table (ticks). */
export function getTreeDespawnTicks(): TickTable {
  return (
    gatheringProvider.getManifest()?.treeDespawnTicks ??
    GATHERING_CONSTANTS.TREE_DESPAWN_TICKS
  );
}

/** Fishing-spot periodic relocation config. */
export function getFishingSpotMove(): FishingSpotMove {
  return (
    gatheringProvider.getManifest()?.fishingSpotMove ??
    GATHERING_CONSTANTS.FISHING_SPOT_MOVE
  );
}

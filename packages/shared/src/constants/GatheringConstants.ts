/**
 * Gathering Constants — MANIFEST FAÇADE
 *
 * As of Phase A3 of PLAN_WORLD_STUDIO_AAA_COMPLETION.md, the source of truth
 * for every gathering rate/timer lives in `gathering-constants.json`,
 * validated at module load time against `GatheringManifestSchema` from
 * `@hyperforge/manifest-schema`.
 *
 * The JSON authoritative copy is served from
 * `packages/server/world/assets/manifests/gathering-constants.json`
 * (editor-editable, loaded at runtime). This TS file preserves the exact
 * legacy export shape (`GATHERING_CONSTANTS`) so the existing consumers
 * don't have to change.
 *
 * To tune gathering values, edit the JSON — not this file.
 *
 * @see
 * @see
 * @see
 */

import { GatheringManifestSchema } from "@hyperforge/manifest-schema";

import gatheringManifestJson from "./gathering-constants.json" with { type: "json" };

const manifest = GatheringManifestSchema.parse(gatheringManifestJson);

const validResourceIdRegex = new RegExp(manifest.resourceIdRules.validPattern);

export const GATHERING_CONSTANTS = Object.freeze({
  // === Skill-Specific Mechanics (tile-based-MMORPG-accurate) ===
  SKILL_MECHANICS: Object.freeze({
    woodcutting: Object.freeze({
      type: manifest.skillMechanics.woodcutting.type,
      baseRollTicks: manifest.skillMechanics.woodcutting.baseRollTicks,
      toolAffectsSuccess:
        manifest.skillMechanics.woodcutting.toolAffectsSuccess,
      toolAffectsSpeed: manifest.skillMechanics.woodcutting.toolAffectsSpeed,
    }),
    mining: Object.freeze({
      type: manifest.skillMechanics.mining.type,
      baseRollTicks: manifest.skillMechanics.mining.baseRollTicks,
      toolAffectsSuccess: manifest.skillMechanics.mining.toolAffectsSuccess,
      toolAffectsSpeed: manifest.skillMechanics.mining.toolAffectsSpeed,
    }),
    fishing: Object.freeze({
      type: manifest.skillMechanics.fishing.type,
      baseRollTicks: manifest.skillMechanics.fishing.baseRollTicks,
      toolAffectsSuccess: manifest.skillMechanics.fishing.toolAffectsSuccess,
      toolAffectsSpeed: manifest.skillMechanics.fishing.toolAffectsSpeed,
    }),
  }),

  // === Tile-Based Range ===
  GATHERING_RANGE: manifest.ranges.gatheringRange,

  // === Proximity and Range (legacy world-unit) ===
  PROXIMITY_SEARCH_RADIUS: manifest.ranges.proximitySearchRadius,
  DEFAULT_INTERACTION_RANGE: manifest.ranges.defaultInteractionRange,
  POSITION_EPSILON: manifest.ranges.positionEpsilon,

  // === Timing (ticks/ms) ===
  MINIMUM_CYCLE_TICKS: manifest.timing.minimumCycleTicks,
  RATE_LIMIT_MS: manifest.timing.rateLimitMs,
  STALE_RATE_LIMIT_MS: manifest.timing.staleRateLimitMs,
  RATE_LIMIT_CLEANUP_INTERVAL_MS: manifest.timing.rateLimitCleanupIntervalMs,

  // === Success Rate Tables ===
  WOODCUTTING_SUCCESS_RATES: manifest.woodcuttingSuccessRates,
  MINING_SUCCESS_RATES: manifest.miningSuccessRates,
  FISHING_SUCCESS_RATES: manifest.fishingSuccessRates,
  DEFAULT_SUCCESS_RATE: manifest.defaultSuccessRate,

  // === Resource ID Validation ===
  MAX_RESOURCE_ID_LENGTH: manifest.resourceIdRules.maxLength,
  VALID_RESOURCE_ID_PATTERN: validResourceIdRegex,

  // === Tree Despawn / Respawn (Forestry) ===
  TREE_DESPAWN_TICKS: manifest.treeDespawnTicks,
  TREE_RESPAWN_TICKS: manifest.treeRespawnTicks,

  // === Timer Regeneration ===
  TIMER_REGEN_PER_TICK: manifest.timing.timerRegenPerTick,

  // === Fishing Spot Movement ===
  FISHING_SPOT_MOVE: Object.freeze({
    baseTicks: manifest.fishingSpotMove.baseTicks,
    varianceTicks: manifest.fishingSpotMove.varianceTicks,
    relocateRadius: manifest.fishingSpotMove.relocateRadius,
    relocateMinDistance: manifest.fishingSpotMove.relocateMinDistance,
  }),
});

export type GatheringConstants = typeof GATHERING_CONSTANTS;

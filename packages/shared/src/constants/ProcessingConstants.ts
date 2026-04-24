/**
 * Processing Constants — MANIFEST FAÇADE
 *
 * As of Phase A4 of PLAN_WORLD_STUDIO_AAA_COMPLETION.md, the source of truth
 * for firemaking/cooking mechanic constants lives in
 * `processing-constants.json`, validated at module load time against
 * `ProcessingManifestSchema` from `@hyperforge/manifest-schema`.
 *
 * The JSON authoritative copy is served from
 * `packages/server/world/assets/manifests/processing-constants.json`
 * (editor-editable, loaded at runtime). This TS file preserves the exact
 * legacy export shape (`PROCESSING_CONSTANTS`, `CookingSourceType`) so the
 * existing consumers don't have to change.
 *
 * NOTE: Item-specific data (XP values, level requirements, burn levels) is
 * still defined in `items.json` and accessed via `ProcessingDataProvider`.
 *
 * @see packages/server/world/assets/manifests/items.json for item data
 * @see packages/shared/src/data/ProcessingDataProvider.ts for runtime access
 * @see https://oldschool.runescape.wiki/w/Firemaking
 * @see https://oldschool.runescape.wiki/w/Cooking
 */

import { ProcessingManifestSchema } from "@hyperforge/manifest-schema";

import processingManifestJson from "./processing-constants.json" with { type: "json" };

const manifest = ProcessingManifestSchema.parse(processingManifestJson);

export const PROCESSING_CONSTANTS = Object.freeze({
  // === Skill-Specific Mechanics (OSRS-accurate) ===
  SKILL_MECHANICS: Object.freeze({
    firemaking: Object.freeze({
      type: manifest.skillMechanics.firemaking.type,
      baseRollTicks: manifest.skillMechanics.firemaking.baseRollTicks,
      retryOnFail: manifest.skillMechanics.firemaking.retryOnFail,
      levelAffectsSuccess:
        manifest.skillMechanics.firemaking.levelAffectsSuccess,
    }),
    cooking: Object.freeze({
      type: manifest.skillMechanics.cooking.type,
      ticksPerItem: manifest.skillMechanics.cooking.ticksPerItem,
      levelAffectsBurn: manifest.skillMechanics.cooking.levelAffectsBurn,
      levelAffectsSpeed: manifest.skillMechanics.cooking.levelAffectsSpeed,
    }),
  }),

  // === Firemaking Success Rates (OSRS formula) ===
  FIREMAKING_SUCCESS_RATE: Object.freeze({
    low: manifest.firemakingSuccessRate.low,
    high: manifest.firemakingSuccessRate.high,
  }),

  // === Fire Properties ===
  FIRE: Object.freeze({
    minDurationTicks: manifest.fire.minDurationTicks,
    maxDurationTicks: manifest.fire.maxDurationTicks,
    maxFiresPerPlayer: manifest.fire.maxFiresPerPlayer,
    maxFiresPerArea: manifest.fire.maxFiresPerArea,
    interactionRange: manifest.fire.interactionRange,
  }),

  // === Walk-West Movement Priority (OSRS) ===
  FIRE_WALK_PRIORITY: manifest.fireWalkPriority,

  // === Timing ===
  RATE_LIMIT_MS: manifest.timing.rateLimitMs,
  MINIMUM_CYCLE_TICKS: manifest.timing.minimumCycleTicks,
});

// === Type Exports ===
export type CookingSourceType = "fire" | "range";

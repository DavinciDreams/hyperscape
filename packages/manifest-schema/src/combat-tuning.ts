/**
 * Combat tuning manifest schema.
 *
 * Phase H3 of the World Studio AAA plan — lifts `DuelCombatConfig`
 * (currently a hardcoded constructor arg in
 * `packages/server/src/duel/DuelCombatAI.ts`) into an authored manifest
 * so duel rules, tournament modes, and training-wheel variants can
 * tune combat AI without a rebuild.
 *
 * Each profile is addressable by id and lists per-role engagement
 * ranges, tick rate, healing/prayer thresholds, and movement knobs.
 * `DuelOrchestrator` resolves a profile id from the duel rules
 * (separate follow-up) and hands it to the AI tick loop.
 */

import { z } from "zod";

export const CombatRoleSchema = z.enum(["melee", "ranged", "mage"]);
export type CombatRole = z.infer<typeof CombatRoleSchema>;

/**
 * Engagement distance window for a given combat role. `min` ≤ `max`;
 * the AI kites/chases the opponent to stay inside the window.
 */
export const EngagementRangeSchema = z
  .object({
    min: z.number().nonnegative(),
    max: z.number().positive(),
  })
  .refine(({ min, max }) => min <= max, {
    message: "engagement range `min` must be ≤ `max`",
  });
export type EngagementRange = z.infer<typeof EngagementRangeSchema>;

/**
 * Per-role offensive prayer id (matches prayers manifest ids, e.g.
 * `superhuman_strength`, `hawk_eye`, `mystic_lore`). Kept as a free
 * string since prayer ids come from a separate manifest.
 */
export const RoleOffensivePrayerSchema = z.object({
  melee: z.string().min(1),
  ranged: z.string().min(1),
  mage: z.string().min(1),
});
export type RoleOffensivePrayer = z.infer<typeof RoleOffensivePrayerSchema>;

export const RoleEngagementRangeSchema = z.object({
  melee: EngagementRangeSchema,
  ranged: EngagementRangeSchema,
  mage: EngagementRangeSchema,
});
export type RoleEngagementRange = z.infer<typeof RoleEngagementRangeSchema>;

/**
 * HP thresholds expressed as 0..100 percentages — match the existing
 * `DuelCombatConfig` shape so migration is 1:1.
 *
 * - `heal`: eat food below this %
 * - `aggressive`: switch to aggressive style above this %
 * - `defensive`: enter "desperate" phase below this %
 *
 * Invariant: `defensive < heal < aggressive`. `defensive` ≥ `heal`
 * would cause the agent to eat and panic simultaneously; `aggressive`
 * ≤ `heal` would never let it trigger aggression.
 */
export const HpThresholdsPctSchema = z
  .object({
    heal: z.number().min(0).max(100),
    aggressive: z.number().min(0).max(100),
    defensive: z.number().min(0).max(100),
  })
  .refine(
    ({ heal, aggressive, defensive }) => defensive < heal && heal < aggressive,
    {
      message:
        "HP thresholds must satisfy `defensive < heal < aggressive` (percent)",
    },
  );
export type HpThresholdsPct = z.infer<typeof HpThresholdsPctSchema>;

export const MovementTuningSchema = z.object({
  /** Minimum ms between movement decisions; ceils to tick rate at runtime. */
  moveCooldownMs: z.number().int().positive().default(1200),
  /** Lateral strafe step in world units. */
  strafeStep: z.number().positive().default(1.35),
});
export type MovementTuning = z.infer<typeof MovementTuningSchema>;

/**
 * One named profile. Profiles compose by id — variants override only
 * the fields they want to change against the base profile (resolved
 * at runtime, separate follow-up).
 */
export const CombatTuningProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(""),
  /** Base tick rate (ms) for the combat AI loop. */
  tickMs: z.number().int().positive().default(600),
  hpThresholdsPct: HpThresholdsPctSchema,
  engagementRanges: RoleEngagementRangeSchema,
  offensivePrayers: RoleOffensivePrayerSchema,
  /** Prayer id activated defensively every tick (no-op if already on). */
  defensivePrayer: z.string().min(1),
  movement: MovementTuningSchema.default({
    moveCooldownMs: 1200,
    strafeStep: 1.35,
  }),
  /** Skip all food use — used for no-food duel variants. */
  noFood: z.boolean().default(false),
  /** Opt in LLM-driven tactics replanning (background, best-effort). */
  useLlmTactics: z.boolean().default(false),
});
export type CombatTuningProfile = z.infer<typeof CombatTuningProfileSchema>;

/**
 * Manifest: a library of named profiles. Unique ids are enforced so
 * runtime can resolve by id without ambiguity.
 */
export const CombatTuningManifestSchema = z
  .array(CombatTuningProfileSchema)
  .refine((list) => new Set(list.map((p) => p.id)).size === list.length, {
    message: "combat tuning profile ids must be unique",
  });
export type CombatTuningManifest = z.infer<typeof CombatTuningManifestSchema>;

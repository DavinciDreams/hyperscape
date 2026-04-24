/**
 * Onboarding-goals manifest schema.
 *
 * Authored sequence of early-game goals that guide a new player
 * from "just logged in" through core-loop discovery. Defines
 * goal order, completion criteria, reward grants, tutorial
 * linking, and skip/abort rules.
 *
 * Scope-isolated from:
 *   - `tutorial-flows.ts` (step-by-step scripted interactions —
 *     goals may *reference* a tutorial flow id, but flows own
 *     their own widget pointers/highlights)
 *   - `achievements.ts` (permanent badges — these goals are
 *     tutorial-phase only, they disappear after completion)
 *   - `quests.ts` (narrative quests — onboarding goals are UI-
 *     level discovery checkpoints)
 *   - `news-feed.ts` (welcome/return prompts)
 */

import { z } from "zod";

/** Shape-only reference to another manifest id (loader resolves). */
const ManifestRef = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9_-]*$/,
    "manifest reference must be lowerCamelCase ASCII identifier",
  );

const Id = z
  .string()
  .regex(/^[a-z][a-zA-Z0-9_-]*$/, "id must be lowerCamelCase ASCII identifier");

/** Criterion kinds — how a goal is marked complete. */
export const GoalCriterionKindSchema = z.enum([
  "openWidget",
  "killMobKind",
  "collectItemId",
  "completeTutorialFlow",
  "reachLevel",
  "visitLocation",
  "finishQuest",
  "equipItemKind",
  "openInventory",
  "custom",
]);
export type GoalCriterionKind = z.infer<typeof GoalCriterionKindSchema>;

/** One completion criterion. */
export const GoalCriterionSchema = z
  .object({
    kind: GoalCriterionKindSchema,
    /** Target value — arg depends on kind (mob id, level, flow id, etc.). */
    targetKey: z.string().default(""),
    /** Quantity required (e.g. 10 kills, 5 items). */
    requiredCount: z.number().int().min(1).max(10000).default(1),
  })
  .strict()
  .refine((c) => c.kind === "openInventory" || c.targetKey.length > 0, {
    message: "non-trivial criteria require targetKey",
    path: ["targetKey"],
  });
export type GoalCriterion = z.infer<typeof GoalCriterionSchema>;

/** Reward kinds on goal completion. */
export const GoalRewardKindSchema = z.enum([
  "xpGrant",
  "coinsGrant",
  "itemGrant",
  "titleUnlock",
  "cosmeticUnlock",
  "abilityUnlock",
  "custom",
]);
export type GoalRewardKind = z.infer<typeof GoalRewardKindSchema>;

/** One reward entry. */
export const GoalRewardSchema = z
  .object({
    kind: GoalRewardKindSchema,
    /** Target key (item id, title id, etc.). */
    targetKey: z.string().default(""),
    /** Amount (XP, coins, count). */
    amount: z.number().int().min(0).max(1_000_000).default(0),
  })
  .strict()
  .refine(
    (r) =>
      r.kind !== "xpGrant" && r.kind !== "coinsGrant" ? true : r.amount > 0,
    {
      message: "xpGrant/coinsGrant reward requires amount > 0",
      path: ["amount"],
    },
  )
  .refine(
    (r) =>
      r.kind === "xpGrant" || r.kind === "coinsGrant" || r.targetKey.length > 0,
    {
      message: "non-grant rewards require targetKey",
      path: ["targetKey"],
    },
  );
export type GoalReward = z.infer<typeof GoalRewardSchema>;

/** One onboarding goal. */
export const OnboardingGoalSchema = z
  .object({
    id: Id,
    titleLocalizationKey: z.string().min(1),
    descriptionLocalizationKey: z.string().default(""),
    /** Optional icon. */
    iconAssetRef: ManifestRef.optional(),
    /** Display order (ascending). */
    displayOrder: z.number().int().min(0).max(10000).default(0),
    /** Goal ids this one depends on (must be complete first). */
    prerequisites: z.array(z.string().min(1)).default([]),
    /** Criteria — all must be met (AND). */
    criteria: z.array(GoalCriterionSchema).min(1),
    /** Rewards granted on completion. */
    rewards: z.array(GoalRewardSchema).default([]),
    /** Optional tutorial flow to auto-trigger on goal start. */
    tutorialFlowRef: ManifestRef.optional(),
    /** Player can skip this goal without penalty. */
    playerCanSkip: z.boolean().default(true),
    /** Show in onboarding tracker HUD (vs hidden checkpoint). */
    showInTracker: z.boolean().default(true),
  })
  .strict()
  .refine((g) => new Set(g.prerequisites).size === g.prerequisites.length, {
    message: "prerequisites must be unique",
    path: ["prerequisites"],
  });
export type OnboardingGoal = z.infer<typeof OnboardingGoalSchema>;

/** Abort/skip rules for the whole onboarding. */
export const AbortRulesSchema = z
  .object({
    /** Allow player to skip the entire onboarding. */
    allowSkipAll: z.boolean().default(true),
    /** Min level before skip-all is available (0 = always). */
    skipAllAvailableAtLevel: z.number().int().min(0).max(200).default(0),
    /** Returning player (existing save) auto-marks complete. */
    autoCompleteForReturningPlayers: z.boolean().default(true),
  })
  .strict();
export type AbortRules = z.infer<typeof AbortRulesSchema>;

/** Top-level onboarding-goals manifest. */
export const OnboardingGoalsManifestSchema = z
  .object({
    enabled: z.boolean().default(true),
    goals: z.array(OnboardingGoalSchema).default([]),
    abort: AbortRulesSchema.default(() => AbortRulesSchema.parse({})),
    /** Show onboarding tracker HUD widget. */
    showTracker: z.boolean().default(true),
    /** Localization key for tracker panel title. */
    trackerTitleLocalizationKey: z.string().default("onboarding.tracker.title"),
  })
  .strict()
  .refine((m) => new Set(m.goals.map((g) => g.id)).size === m.goals.length, {
    message: "goal ids must be unique",
    path: ["goals"],
  })
  .refine(
    (m) => {
      const ids = new Set(m.goals.map((g) => g.id));
      for (const g of m.goals) {
        for (const p of g.prerequisites) {
          if (!ids.has(p)) return false;
          if (p === g.id) return false;
        }
      }
      return true;
    },
    {
      message: "prerequisites must resolve to other defined goals (no self)",
      path: ["goals"],
    },
  )
  .refine(
    (m) => {
      // DFS cycle detection on prerequisite graph.
      const adj = new Map<string, string[]>();
      for (const g of m.goals) adj.set(g.id, g.prerequisites);
      const WHITE = 0;
      const GRAY = 1;
      const BLACK = 2;
      const color = new Map<string, number>();
      for (const id of adj.keys()) color.set(id, WHITE);
      const visit = (id: string): boolean => {
        if (color.get(id) === GRAY) return false;
        if (color.get(id) === BLACK) return true;
        color.set(id, GRAY);
        for (const p of adj.get(id) ?? []) {
          if (!visit(p)) return false;
        }
        color.set(id, BLACK);
        return true;
      };
      for (const id of adj.keys()) {
        if (!visit(id)) return false;
      }
      return true;
    },
    {
      message: "goal prerequisites must form a DAG (no cycles)",
      path: ["goals"],
    },
  )
  .refine((m) => !m.enabled || m.goals.length > 0, {
    message: "enabled manifest requires at least one goal",
    path: ["goals"],
  });
export type OnboardingGoalsManifest = z.infer<
  typeof OnboardingGoalsManifestSchema
>;

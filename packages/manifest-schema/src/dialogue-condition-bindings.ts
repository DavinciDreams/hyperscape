/**
 * Dialogue condition bindings manifest schema.
 *
 * Author-side declaration of predicate names that
 * `DialogueSystem.registerConditionEvaluator` should install at boot.
 * Each binding is a `{ name, kind, ...params }` entry that the runtime
 * (`installWorldDialogueConditions` in
 * `packages/shared/src/systems/shared/interaction/WorldDialogueConditionEvaluators.ts`)
 * resolves to a concrete predicate that reads from QuestSystem /
 * InventorySystem / SkillsSystem.
 *
 * The kinds mirror `DropCondition` from `loot-tables.ts` so the same
 * author vocabulary applies on both the loot and dialogue sides.
 * Unlike `DropCondition`, dialogue bindings are name-keyed because the
 * runner addresses them by free-form `showIf` string (e.g.
 * `showIf: "has_bandits_quest"`).
 *
 * Extracted as part of Phase B3 (manifest hot-reload) —
 * `PLAN_WORLD_STUDIO_AAA_COMPLETION.md`.
 */

import { z } from "zod";

/**
 * Predicate name as used in `showIf` / branch `condition` strings.
 *
 * Lowercased identifier: letters, digits, underscores, and dashes.
 * Deliberately permissive so authored dialogue trees can use
 * kebab-case or snake_case freely. Empty names are rejected by
 * `DialogueSystem.registerConditionEvaluator`.
 */
const BindingNameSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9_-]+$/i, {
    message:
      "binding name must be a non-empty identifier (letters/digits/underscore/dash)",
  });

/**
 * Closed set of skill keys — matches `keyof Skills` exactly. Unknown
 * skill names are rejected at validation time rather than silently
 * bound to an always-false predicate.
 */
export const DialogueBindingSkillKeySchema = z.enum([
  "attack",
  "strength",
  "defense",
  "constitution",
  "ranged",
  "magic",
  "prayer",
  "woodcutting",
  "mining",
  "fishing",
  "firemaking",
  "cooking",
  "smithing",
  "agility",
  "crafting",
  "fletching",
  "runecrafting",
]);
export type DialogueBindingSkillKey = z.infer<
  typeof DialogueBindingSkillKeySchema
>;

/** `ctx.evaluateCondition(name)` → true iff the player has the given quest active (not yet status==="completed"). */
const QuestActiveBindingSchema = z.object({
  kind: z.literal("quest-active"),
  name: BindingNameSchema,
  questId: z.string().min(1),
});

/** `ctx.evaluateCondition(name)` → true iff the player has completed the given quest. */
const QuestCompletedBindingSchema = z.object({
  kind: z.literal("quest-completed"),
  name: BindingNameSchema,
  questId: z.string().min(1),
});

/** `ctx.evaluateCondition(name)` → true iff the player has `quantity ≥ 1` (default 1) copies of the item. */
const HasItemBindingSchema = z.object({
  kind: z.literal("has-item"),
  name: BindingNameSchema,
  itemId: z.string().min(1),
  /** Default 1 at runtime. Must be positive — zero or negative is a programmer error. */
  quantity: z.number().int().positive().optional(),
});

/** `ctx.evaluateCondition(name)` → true iff the player has skill ≥ level. */
const LevelAtLeastBindingSchema = z.object({
  kind: z.literal("level-at-least"),
  name: BindingNameSchema,
  skill: DialogueBindingSkillKeySchema,
  level: z.number().int().min(1).max(99),
});

export const DialogueConditionBindingSchema = z.discriminatedUnion("kind", [
  QuestActiveBindingSchema,
  QuestCompletedBindingSchema,
  HasItemBindingSchema,
  LevelAtLeastBindingSchema,
]);
export type DialogueConditionBinding = z.infer<
  typeof DialogueConditionBindingSchema
>;

/**
 * Top-level manifest. Authors ship one file that installs every
 * name→predicate binding in the project. Duplicate names are rejected
 * at validation time — explicit is better than last-write-wins when
 * authors control the full list (last-write-wins stays the install-time
 * contract for plugins that layer bindings on top of authored ones).
 */
export const DialogueConditionBindingsManifestSchema = z
  .object({
    $schema: z.literal("hyperforge.dialogue-condition-bindings.v1"),
    bindings: z.array(DialogueConditionBindingSchema),
  })
  .superRefine((data, ctx) => {
    const seen = new Map<string, number>();
    for (let i = 0; i < data.bindings.length; i++) {
      const name = data.bindings[i].name;
      const prev = seen.get(name);
      if (prev !== undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["bindings", i, "name"],
          message: `duplicate binding name "${name}" (first declared at bindings[${prev}])`,
        });
      } else {
        seen.set(name, i);
      }
    }
  });
export type DialogueConditionBindingsManifest = z.infer<
  typeof DialogueConditionBindingsManifestSchema
>;

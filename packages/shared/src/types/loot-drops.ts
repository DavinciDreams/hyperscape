/**
 * Loot-drop protocol types.
 *
 * Lives in shared so that consumers (DropConditionDispatcher,
 * WorldDropConditionEvaluators, dispatcher tests) can import the
 * protocol without depending on the LootSystem implementation —
 * which has been migrated to @hyperforge/hyperscape (2026-04-25).
 */

import type { DropCondition } from "@hyperforge/manifest-schema";

/**
 * Runtime context passed to a `LootDropConditionEvaluator`. Carries
 * the mob type that died and (when known) the killer's character id,
 * so the evaluator can query player-scoped state like inventory,
 * quest progress, or skill level.
 */
export interface LootDropContext {
  readonly mobType: string;
  readonly killerId?: string;
}

/**
 * Predicate invoked by `LootSystem.rollLootFor` to gate every non-
 * `always` `DropCondition`. Return `true` to allow the entry to roll,
 * `false` to skip it. Throwing is caught at the callsite and treated
 * as `false` — plugin misbehavior never takes down the drop loop.
 */
export type LootDropConditionEvaluator = (
  condition: DropCondition,
  ctx: LootDropContext,
) => boolean;

/**
 * Default evaluator. `always` → true; every other kind → false. Safe-
 * by-default so unlocked plugin conditions never fire until a real
 * evaluator is installed via `setDropConditionEvaluator`.
 */
export const defaultDropConditionEvaluator: LootDropConditionEvaluator = (
  condition,
) => condition.kind === "always";

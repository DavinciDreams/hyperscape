/**
 * Per-kind dispatcher for `LootDropConditionEvaluator`.
 *
 * `DropCondition` is a discriminated union over a fixed set of `kind`
 * values (`always`, `quest-active`, `quest-completed`, `level-at-least`,
 * `has-item`, `custom`). Individual plugins typically only care about
 * a single kind: a QuestSystem plugin wires `quest-active` and
 * `quest-completed`, an InventorySystem plugin wires `has-item`, a
 * StatsSystem plugin wires `level-at-least`, and a registry-backed
 * plugin dispatches `custom` entries by `params.id`.
 *
 * This dispatcher lets each plugin register/unregister its own kind
 * handler independently. The dispatcher itself is a
 * `LootDropConditionEvaluator` — `evaluate(condition, ctx)` — so it
 * plugs straight into `LootSystem.setDropConditionEvaluator`.
 *
 * Defaults and safety:
 *  - `always` is registered by default and always returns `true`
 *    (matches the safe-default semantic).
 *  - Unknown kinds return `false`.
 *  - Throwing handlers are NOT caught here — the LootSystem callsite
 *    owns the try/catch so plugin isolation lives in exactly one
 *    place.
 *
 * Typical wiring at boot:
 *
 * ```ts
 * const dispatcher = createDropConditionDispatcher();
 * questPlugin.installDropConditions(dispatcher);
 * inventoryPlugin.installDropConditions(dispatcher);
 * lootSystem.setDropConditionEvaluator(dispatcher.evaluate);
 * ```
 */
import type { DropCondition } from "@hyperforge/manifest-schema";

import type { LootDropConditionEvaluator, LootDropContext } from "./LootSystem";

/** One entry in the dispatcher — a predicate scoped to a single `kind`. */
export type DropConditionKindHandler = (
  params: DropCondition["params"],
  ctx: LootDropContext,
) => boolean;

/** Exhaustive list of `DropCondition` discriminant values. */
export type DropConditionKind = DropCondition["kind"];

/**
 * Dispatcher surface — `register` / `unregister` / `clear` /
 * `getRegisteredKinds` mirror DialogueSystem's condition-evaluator
 * registry API shape. `evaluate` is a bound function suitable for
 * passing straight to `LootSystem.setDropConditionEvaluator`.
 */
export interface DropConditionDispatcher {
  register(kind: DropConditionKind, handler: DropConditionKindHandler): void;
  unregister(kind: DropConditionKind): void;
  clear(): void;
  has(kind: DropConditionKind): boolean;
  getRegisteredKinds(): readonly DropConditionKind[];
  readonly evaluate: LootDropConditionEvaluator;
}

/**
 * Sub-dispatcher for the `custom` `DropCondition` kind.
 *
 * The `custom` kind is an escape hatch — it lets plugins add named
 * drop conditions without extending the closed manifest-schema
 * discriminant. Authored entries carry `{ kind: "custom", params: {
 * id: "<name>", ...args } }`; this helper routes on `params.id` to a
 * handler that plugins register at boot.
 *
 * The sub-dispatcher returned here is itself a
 * `DropConditionKindHandler`, so the typical wiring is:
 *
 * ```ts
 * const customs = createCustomKindDispatcher();
 * customs.register("boss_enraged", (params, ctx) => ...);
 * customs.register("holiday_event", (params, ctx) => ...);
 *
 * const dispatcher = createDropConditionDispatcher();
 * dispatcher.register("custom", customs.evaluate);
 * lootSystem.setDropConditionEvaluator(dispatcher.evaluate);
 * ```
 *
 * Safety:
 *  - Missing `params.id` (or non-string `id`) → returns `false`.
 *  - Unknown `id` → returns `false` (safe-by-default).
 *  - Handler throws are NOT caught here — the LootSystem callsite
 *    owns the try/catch.
 */
export type CustomDropConditionHandler = DropConditionKindHandler;

export interface CustomKindDispatcher {
  register(id: string, handler: CustomDropConditionHandler): void;
  unregister(id: string): void;
  clear(): void;
  has(id: string): boolean;
  getRegisteredIds(): readonly string[];
  readonly evaluate: DropConditionKindHandler;
}

export function createCustomKindDispatcher(): CustomKindDispatcher {
  const handlers = new Map<string, CustomDropConditionHandler>();

  const dispatcher: CustomKindDispatcher = {
    register(id, handler) {
      if (id.length === 0) {
        throw new Error(
          "[CustomKindDispatcher] empty id is reserved — pick a non-empty custom-condition id",
        );
      }
      handlers.set(id, handler);
    },
    unregister(id) {
      handlers.delete(id);
    },
    clear() {
      handlers.clear();
    },
    has(id) {
      return handlers.has(id);
    },
    getRegisteredIds() {
      return [...handlers.keys()].sort();
    },
    evaluate(params, ctx) {
      const id = params.id;
      if (typeof id !== "string" || id.length === 0) return false;
      const handler = handlers.get(id);
      if (handler === undefined) return false;
      return handler(params, ctx);
    },
  };

  return dispatcher;
}

export function createDropConditionDispatcher(): DropConditionDispatcher {
  const handlers = new Map<DropConditionKind, DropConditionKindHandler>();

  // `always` is the baseline allow-through — pre-register it so every
  // dispatcher returned from this factory is safe to use as a
  // LootDropConditionEvaluator out of the box.
  handlers.set("always", () => true);

  const dispatcher: DropConditionDispatcher = {
    register(kind, handler) {
      handlers.set(kind, handler);
    },
    unregister(kind) {
      handlers.delete(kind);
    },
    clear() {
      handlers.clear();
      // Preserve the `always` baseline even after a full clear —
      // otherwise every table with the default condition suddenly
      // stops dropping.
      handlers.set("always", () => true);
    },
    has(kind) {
      return handlers.has(kind);
    },
    getRegisteredKinds() {
      return [...handlers.keys()].sort() as DropConditionKind[];
    },
    evaluate(condition, ctx) {
      const handler = handlers.get(condition.kind);
      if (handler === undefined) return false;
      return handler(condition.params, ctx);
    },
  };

  return dispatcher;
}

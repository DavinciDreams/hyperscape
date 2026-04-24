/**
 * visibility.ts — pure evaluator for `WidgetInstance.visibility`.
 *
 * A layout author can declare that a widget appears only in certain
 * game contexts (combat, menu, cutscene, etc.), or is driven by a
 * binding expression (`$player.inCombat`). This module centralizes
 * the truth table so the runtime renderer (Phase U8 wire-up) and
 * editor preview path both agree on what "visible" means.
 *
 * Design:
 *   - Pure function, no React, no side effects.
 *   - Returns a boolean — never throws. Invalid expressions evaluate
 *     to `false` so a malformed visibility rule fails closed rather
 *     than showing a widget that shouldn't be there.
 *   - Rules combine with AND: every declared condition must pass.
 *   - `visibility === undefined` → defer entirely to the caller
 *     (typically the existing `visible` flag on the instance).
 */

import type { DataContext } from "./bindings";
import { BindingParseError, evaluateBinding } from "./bindings";
import type { WidgetInstance } from "./layout";

export interface VisibilityEvaluationInput {
  /** The widget instance whose `visibility` is being checked. */
  instance: WidgetInstance;
  /**
   * The current "game context" string. Matched against
   * `visibility.contexts` / `visibility.hiddenIn` using exact equality.
   * Common values: `"world"`, `"combat"`, `"menu"`, `"cutscene"`,
   * `"loading"`. Pass `null` when no context is modelled yet — the
   * rule then falls back on `expression` alone.
   */
  gameContext: string | null;
  /**
   * `DataContext` used to evaluate `visibility.expression`. When
   * omitted, an expression-driven rule evaluates to `false` since
   * there's no data to read against.
   */
  data?: DataContext;
}

/**
 * Evaluate every declared visibility gate on a widget instance.
 *
 * Order of gates (AND semantics, short-circuit):
 *   1. Authored `visible` flag — if false the widget is always hidden.
 *   2. `visibility.contexts` — if present and non-empty, the current
 *      `gameContext` must be one of the listed contexts.
 *   3. `visibility.hiddenIn` — if present, the current `gameContext`
 *      must NOT be in the list.
 *   4. `visibility.expression` — if present, must resolve to a truthy
 *      value against `data`. An invalid expression resolves to `false`.
 *
 * Returns `true` iff every declared gate passes.
 */
export function isWidgetVisible(input: VisibilityEvaluationInput): boolean {
  const { instance, gameContext, data } = input;

  // 1. Authored on/off — fastest exit.
  if (instance.visible === false) return false;

  const rule = instance.visibility;
  if (!rule) return true;

  // 2. Positive-context match.
  if (rule.contexts && rule.contexts.length > 0) {
    if (gameContext === null || !rule.contexts.includes(gameContext)) {
      return false;
    }
  }

  // 3. Negative-context match.
  if (rule.hiddenIn && rule.hiddenIn.length > 0) {
    if (gameContext !== null && rule.hiddenIn.includes(gameContext)) {
      return false;
    }
  }

  // 4. Expression predicate.
  if (rule.expression) {
    if (!data) return false;
    try {
      const result = evaluateBinding(rule.expression, data);
      if (!result) return false;
    } catch (err) {
      // Treat any parse/evaluation error as "not visible". A thrown
      // BindingParseError is the common case for authored typos;
      // failing closed keeps a broken rule from accidentally leaking
      // a widget onto the HUD.
      if (err instanceof BindingParseError) return false;
      return false;
    }
  }

  return true;
}

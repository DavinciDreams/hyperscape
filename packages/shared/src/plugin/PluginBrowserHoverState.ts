/**
 * Pure hover-state tracker for the Plugin Browser.
 *
 * Drives hover-intent tooltips, row highlight, and "preview the
 * action the user is about to click" affordances without touching
 * the DOM. Caller feeds `enter(target, nowMs)` on pointer-enter and
 * `leave()` on pointer-leave; derived UI reads `target()` and
 * `hoveredForMs(nowMs)` to decide whether enough time has elapsed
 * to reveal a tooltip.
 *
 * Semantics:
 *  - `enter(target, nowMs)` opens a hover session.
 *    - Invalid targets and non-finite `nowMs` close any existing
 *      session and return `false`.
 *    - Entering the same target again preserves the original
 *      `enteredAtMs` (no timer reset — avoids tooltip jitter from
 *      pointermove micro-transitions across the same element).
 *    - Entering a different target replaces the session and resets
 *      the timer.
 *  - `leave()` clears the session. Returns `true` when a session
 *    was actually open.
 *
 * Pure state. Caller-owned instance (not a singleton). Never
 * throws. Unknown / empty ids are treated as "invalid" and close
 * the session.
 */

export type PluginBrowserHoverTarget =
  | { readonly kind: "row"; readonly pluginId: string }
  | { readonly kind: "header"; readonly columnId: string }
  | {
      readonly kind: "action";
      readonly pluginId: string;
      readonly actionId: string;
    };

export interface PluginBrowserHoverState {
  isHovering(): boolean;
  target(): PluginBrowserHoverTarget | undefined;
  enteredAtMs(): number | undefined;
  /** True when hovering and `target` structurally matches. */
  isHoveringTarget(target: PluginBrowserHoverTarget): boolean;
  /**
   * Open or continue a hover session. Returns true when the
   * internal state actually changed (new target or first enter).
   * Returns false for same-target repeat or invalid input; on
   * invalid input, any existing session is closed.
   */
  enter(target: PluginBrowserHoverTarget, nowMs: number): boolean;
  /** Close the session. Returns true when a session was open. */
  leave(): boolean;
  /**
   * Milliseconds the current session has been open, or 0 when no
   * session is open or when `nowMs` is invalid or earlier than
   * `enteredAtMs`.
   */
  hoveredForMs(nowMs: number): number;
}

/**
 * Create a caller-owned hover-state tracker.
 */
export function createPluginBrowserHoverState(): PluginBrowserHoverState {
  let currentTarget: PluginBrowserHoverTarget | undefined;
  let enteredAt: number | undefined;

  function isValidNow(n: number): boolean {
    return typeof n === "number" && Number.isFinite(n);
  }

  function isValidTarget(t: PluginBrowserHoverTarget): boolean {
    if (!t || typeof t !== "object") return false;
    switch (t.kind) {
      case "row":
        return typeof t.pluginId === "string" && t.pluginId.length > 0;
      case "header":
        return typeof t.columnId === "string" && t.columnId.length > 0;
      case "action":
        return (
          typeof t.pluginId === "string" &&
          t.pluginId.length > 0 &&
          typeof t.actionId === "string" &&
          t.actionId.length > 0
        );
      default:
        return false;
    }
  }

  function sameTarget(
    a: PluginBrowserHoverTarget,
    b: PluginBrowserHoverTarget,
  ): boolean {
    if (a.kind !== b.kind) return false;
    switch (a.kind) {
      case "row":
        return a.pluginId === (b as typeof a).pluginId;
      case "header":
        return a.columnId === (b as typeof a).columnId;
      case "action": {
        const bb = b as typeof a;
        return a.pluginId === bb.pluginId && a.actionId === bb.actionId;
      }
      default:
        return false;
    }
  }

  function cloneTarget(t: PluginBrowserHoverTarget): PluginBrowserHoverTarget {
    switch (t.kind) {
      case "row":
        return { kind: "row", pluginId: t.pluginId };
      case "header":
        return { kind: "header", columnId: t.columnId };
      case "action":
        return {
          kind: "action",
          pluginId: t.pluginId,
          actionId: t.actionId,
        };
    }
  }

  return {
    isHovering(): boolean {
      return currentTarget !== undefined;
    },
    target(): PluginBrowserHoverTarget | undefined {
      return currentTarget ? cloneTarget(currentTarget) : undefined;
    },
    enteredAtMs(): number | undefined {
      return enteredAt;
    },
    isHoveringTarget(target: PluginBrowserHoverTarget): boolean {
      if (!currentTarget) return false;
      if (!isValidTarget(target)) return false;
      return sameTarget(currentTarget, target);
    },
    enter(target: PluginBrowserHoverTarget, nowMs: number): boolean {
      if (!isValidTarget(target) || !isValidNow(nowMs)) {
        const wasOpen = currentTarget !== undefined;
        currentTarget = undefined;
        enteredAt = undefined;
        return wasOpen ? false : false;
      }
      if (currentTarget && sameTarget(currentTarget, target)) {
        return false;
      }
      currentTarget = cloneTarget(target);
      enteredAt = nowMs;
      return true;
    },
    leave(): boolean {
      if (currentTarget === undefined) return false;
      currentTarget = undefined;
      enteredAt = undefined;
      return true;
    },
    hoveredForMs(nowMs: number): number {
      if (!isValidNow(nowMs)) return 0;
      if (enteredAt === undefined) return 0;
      const delta = nowMs - enteredAt;
      return delta > 0 ? delta : 0;
    },
  };
}

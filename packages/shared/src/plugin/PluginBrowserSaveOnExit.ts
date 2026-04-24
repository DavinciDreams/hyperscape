/**
 * Pure navigation-blocker / "unsaved changes" state machine for
 * the Plugin Browser.
 *
 * Subsystems that own uncommitted state (inline editor, form
 * editor, in-flight install) register a blocker. When the user
 * tries to navigate away the Plugin Browser calls
 * `requestExit()`:
 *
 *   no blockers    → returns "allowed" — caller navigates
 *   has blockers   → returns "blocked" and opens a confirm
 *                    prompt. Caller can then `confirmExit()`
 *                    (user chose "Leave anyway") or
 *                    `cancelExit()` (user stays).
 *
 * Distinct from `PluginBrowserDirtyState` which tracks
 * per-plugin/per-field dirt — this substrate is the
 * *navigation gate* that sits in front of route changes. Pure
 * state, caller-owned instance, never throws. Invalid input
 * (empty ids/reasons) silently no-op'd.
 */

export type PluginBrowserSaveOnExitRequestResult = "allowed" | "blocked";

export interface PluginBrowserSaveOnExitBlocker {
  readonly id: string;
  readonly reason: string;
}

export interface PluginBrowserSaveOnExit {
  /** Register a navigation blocker. Duplicate id → false. */
  addBlocker(id: string, reason: string): boolean;
  /** Remove a navigation blocker. Returns true when removed. */
  removeBlocker(id: string): boolean;
  /** True iff any blocker is currently registered. */
  hasBlockers(): boolean;
  /** Count of registered blockers. */
  blockerCount(): number;
  /** Lookup by id. */
  getBlocker(id: string): PluginBrowserSaveOnExitBlocker | undefined;
  /** Snapshot of every blocker in insertion order. */
  blockers(): readonly PluginBrowserSaveOnExitBlocker[];

  /**
   * Request navigation. If no blockers are registered, returns
   * `"allowed"` (caller navigates immediately). Otherwise
   * opens the confirm prompt and returns `"blocked"`.
   */
  requestExit(): PluginBrowserSaveOnExitRequestResult;
  /** True iff a confirm prompt is currently open. */
  isPromptOpen(): boolean;
  /**
   * User chose "Leave anyway" — clears the prompt and every
   * blocker. Returns true when a prompt was open.
   */
  confirmExit(): boolean;
  /**
   * User chose "Stay" — clears the prompt only. Returns true
   * when a prompt was open.
   */
  cancelExit(): boolean;

  /** Reset to the pristine state. */
  clear(): void;
}

/**
 * Create a caller-owned save-on-exit navigation gate.
 */
export function createPluginBrowserSaveOnExit(): PluginBrowserSaveOnExit {
  const blockersById = new Map<string, string>();
  let promptOpen = false;

  function isValid(s: string): boolean {
    return typeof s === "string" && s.length > 0;
  }

  return {
    addBlocker(id: string, reason: string): boolean {
      if (!isValid(id) || !isValid(reason)) return false;
      if (blockersById.has(id)) return false;
      blockersById.set(id, reason);
      return true;
    },
    removeBlocker(id: string): boolean {
      if (!isValid(id)) return false;
      const removed = blockersById.delete(id);
      // Clearing the last blocker auto-closes an open prompt —
      // there's nothing left to confirm.
      if (removed && blockersById.size === 0) promptOpen = false;
      return removed;
    },
    hasBlockers(): boolean {
      return blockersById.size > 0;
    },
    blockerCount(): number {
      return blockersById.size;
    },
    getBlocker(id: string): PluginBrowserSaveOnExitBlocker | undefined {
      if (!isValid(id)) return undefined;
      const reason = blockersById.get(id);
      return reason !== undefined ? { id, reason } : undefined;
    },
    blockers(): readonly PluginBrowserSaveOnExitBlocker[] {
      const out: PluginBrowserSaveOnExitBlocker[] = [];
      for (const [id, reason] of blockersById) {
        out.push({ id, reason });
      }
      return out;
    },
    requestExit(): PluginBrowserSaveOnExitRequestResult {
      if (blockersById.size === 0) {
        promptOpen = false;
        return "allowed";
      }
      promptOpen = true;
      return "blocked";
    },
    isPromptOpen(): boolean {
      return promptOpen;
    },
    confirmExit(): boolean {
      if (!promptOpen) return false;
      promptOpen = false;
      blockersById.clear();
      return true;
    },
    cancelExit(): boolean {
      if (!promptOpen) return false;
      promptOpen = false;
      return true;
    },
    clear(): void {
      blockersById.clear();
      promptOpen = false;
    },
  };
}

/**
 * Pure single-open review-composer state machine for the
 * Plugin Browser. At most one review is being authored at
 * a time; opening a new one silently replaces any prior
 * open draft (UE5 dialog parity). During authoring the
 * caller mutates `rating` (1..5) and `text` (free-form).
 *
 * Lifecycle:
 *   open → [mutate rating/text] → submit | cancel | close
 *
 * Submit requires `rating >= 1`; otherwise returns
 * undefined. A closed session surfaces the final draft +
 * `outcome` so the caller can dispatch a network call
 * (`submitted`), show a "discarded" toast (`canceled`), or
 * silently drop (force `close`).
 *
 * Distinct from:
 *   - `PluginBrowserNotes` — free-form per-plugin
 *     scratchpad (persistent, per-plugin).
 *   - `PluginBrowserConflictResolver` — read-only conflict
 *     display with accept/cancel outcomes.
 *   - `PluginBrowserInlineEditor` — generic inline editing.
 *
 * Pure state, caller-owned, never throws.
 */

export type PluginBrowserReviewOutcome = "submitted" | "canceled";

export interface PluginBrowserOpenReview {
  readonly id: number;
  readonly pluginId: string;
  readonly rating: number;
  readonly text: string;
}

export interface PluginBrowserClosedReview extends PluginBrowserOpenReview {
  readonly outcome: PluginBrowserReviewOutcome;
}

export interface PluginBrowserReviewDraft {
  /**
   * Open a fresh review draft (rating=0, text=""). Rejects
   * empty pluginId. Silently replaces any prior open
   * draft. Returns the created draft or undefined.
   */
  open(
    pluginId: string,
    initialRating?: number,
    initialText?: string,
  ): PluginBrowserOpenReview | undefined;
  /** True iff a draft is currently open. */
  hasOpen(): boolean;
  /** Current open draft, or undefined. */
  getOpen(): PluginBrowserOpenReview | undefined;
  /**
   * Mutate rating. Must be an integer in `1..5`. Returns
   * false on invalid input or when no draft open. Idempotent
   * on unchanged.
   */
  setRating(rating: number): boolean;
  /**
   * Mutate text. Accepts any string including empty/
   * whitespace. Returns false when no draft open. Idempotent
   * on unchanged.
   */
  setText(text: string): boolean;
  /**
   * Close with outcome `submitted`. Requires `rating >= 1`
   * (otherwise returns undefined without closing). Returns
   * the final closed session.
   */
  submit(): PluginBrowserClosedReview | undefined;
  /**
   * Close with outcome `canceled`. Returns the final
   * closed session, or undefined when none open.
   */
  cancel(): PluginBrowserClosedReview | undefined;
  /**
   * Force-close without outcome. Returns true when a
   * draft was closed.
   */
  close(): boolean;
}

function isValidId(s: string): boolean {
  return typeof s === "string" && s.length > 0;
}

function isValidRating(r: number): boolean {
  return (
    typeof r === "number" &&
    Number.isFinite(r) &&
    Number.isInteger(r) &&
    r >= 1 &&
    r <= 5
  );
}

function isValidInitialRating(r: unknown): boolean {
  if (r === undefined) return true;
  return isValidRating(r as number);
}

/**
 * Create a caller-owned review-draft state machine.
 */
export function createPluginBrowserReviewDraft(): PluginBrowserReviewDraft {
  let nextId = 1;
  let current: PluginBrowserOpenReview | undefined;

  return {
    open(
      pluginId: string,
      initialRating?: number,
      initialText?: string,
    ): PluginBrowserOpenReview | undefined {
      if (!isValidId(pluginId)) return undefined;
      if (!isValidInitialRating(initialRating)) return undefined;
      const text = typeof initialText === "string" ? initialText : "";
      const rating = typeof initialRating === "number" ? initialRating : 0;
      current = { id: nextId++, pluginId, rating, text };
      return current;
    },
    hasOpen(): boolean {
      return current !== undefined;
    },
    getOpen(): PluginBrowserOpenReview | undefined {
      return current;
    },
    setRating(rating: number): boolean {
      if (current === undefined) return false;
      if (!isValidRating(rating)) return false;
      if (current.rating === rating) return false;
      current = { ...current, rating };
      return true;
    },
    setText(text: string): boolean {
      if (current === undefined) return false;
      if (typeof text !== "string") return false;
      if (current.text === text) return false;
      current = { ...current, text };
      return true;
    },
    submit(): PluginBrowserClosedReview | undefined {
      if (current === undefined) return undefined;
      if (current.rating < 1) return undefined;
      const closed: PluginBrowserClosedReview = {
        ...current,
        outcome: "submitted",
      };
      current = undefined;
      return closed;
    },
    cancel(): PluginBrowserClosedReview | undefined {
      if (current === undefined) return undefined;
      const closed: PluginBrowserClosedReview = {
        ...current,
        outcome: "canceled",
      };
      current = undefined;
      return closed;
    },
    close(): boolean {
      if (current === undefined) return false;
      current = undefined;
      return true;
    },
  };
}

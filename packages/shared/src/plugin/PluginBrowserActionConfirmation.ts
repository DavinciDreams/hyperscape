/**
 * Pure pending-action-confirmation prompt state for the
 * Plugin Browser.
 *
 * Models the "Are you sure you want to uninstall Combat
 * Sounds? [Cancel] [Uninstall]" dialog. At most one prompt is
 * pending at a time (UE5 convention — a new request overrides
 * the previous, as if the user had canceled it implicitly).
 *
 * The substrate stores the pending request (label + payload)
 * and returns the payload to the caller on confirm/cancel.
 * Actually *executing* the confirmed action is the caller's
 * job — this module is just the yes/no handshake state.
 *
 * Generic payload `<T>` so callers keep their own union
 * (`{ kind: "uninstall", pluginId }`, etc.) without erasure.
 *
 * Pure state. Caller-owned instance. Never throws. Invalid
 * input (empty labels) silently no-op'd.
 */

export interface PluginBrowserConfirmRequest<T> {
  readonly id: number;
  readonly label: string;
  readonly payload: T;
}

export type PluginBrowserConfirmOutcome = "confirmed" | "canceled";

export interface PluginBrowserConfirmResolution<
  T,
> extends PluginBrowserConfirmRequest<T> {
  readonly outcome: PluginBrowserConfirmOutcome;
}

export interface PluginBrowserActionConfirmation<T = unknown> {
  /** True when a prompt is currently open. */
  isPending(): boolean;
  /** Current pending prompt, or undefined when none. */
  pending(): PluginBrowserConfirmRequest<T> | undefined;
  /**
   * Open a confirmation prompt. If a prompt is already
   * pending, it is silently discarded (same as `cancel`
   * without emitting a resolution). Returns the new request's
   * `id` on success or -1 when `label` is empty.
   */
  request(label: string, payload: T): number;
  /**
   * Confirm the pending prompt. Returns the resolved request
   * with `outcome: "confirmed"` or `undefined` when nothing
   * is pending.
   */
  confirm(): PluginBrowserConfirmResolution<T> | undefined;
  /**
   * Cancel the pending prompt. Returns the resolved request
   * with `outcome: "canceled"` or `undefined` when nothing
   * is pending.
   */
  cancel(): PluginBrowserConfirmResolution<T> | undefined;
  /** True iff the pending request has `id === requestId`. */
  isPendingFor(requestId: number): boolean;
  /** Discard any pending prompt without emitting anything. */
  clear(): void;
}

/**
 * Create a caller-owned confirmation prompt state.
 */
export function createPluginBrowserActionConfirmation<
  T = unknown,
>(): PluginBrowserActionConfirmation<T> {
  let nextId = 1;
  let current: PluginBrowserConfirmRequest<T> | null = null;

  return {
    isPending(): boolean {
      return current !== null;
    },
    pending(): PluginBrowserConfirmRequest<T> | undefined {
      return current ?? undefined;
    },
    request(label: string, payload: T): number {
      if (typeof label !== "string" || label.length === 0) return -1;
      const id = nextId++;
      current = { id, label, payload };
      return id;
    },
    confirm(): PluginBrowserConfirmResolution<T> | undefined {
      if (!current) return undefined;
      const resolved: PluginBrowserConfirmResolution<T> = {
        ...current,
        outcome: "confirmed",
      };
      current = null;
      return resolved;
    },
    cancel(): PluginBrowserConfirmResolution<T> | undefined {
      if (!current) return undefined;
      const resolved: PluginBrowserConfirmResolution<T> = {
        ...current,
        outcome: "canceled",
      };
      current = null;
      return resolved;
    },
    isPendingFor(requestId: number): boolean {
      return current !== null && current.id === requestId;
    },
    clear(): void {
      current = null;
    },
  };
}

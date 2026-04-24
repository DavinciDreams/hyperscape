/**
 * Pure-logic activity log for plugin lifecycle transitions.
 *
 * `PluginLoader` owns authoritative state, but callers frequently want
 * a rolling history of what happened — which plugins loaded, which
 * ones errored, in what order. The editor's Plugin Browser uses this
 * to render a "recent activity" timeline; an in-game console might
 * tail it for diagnostics.
 *
 * Journal is append-only with a ring-buffer cap. When the buffer is
 * full, the oldest entry is dropped on `record()`. Entries are
 * returned oldest-first.
 *
 * Pure logic — no clock, no IO. Callers pass the timestamp they want
 * recorded (usually `Date.now()`). That keeps this deterministic in
 * tests and lets the editor use a virtual clock during replay.
 */

import type { LifecyclePhase } from "./PluginLoader.js";

export type PluginLifecycleOutcome = "success" | "failed";

export interface PluginLifecycleEvent {
  /** Timestamp in milliseconds. Caller-supplied; journal never reads a clock. */
  readonly at: number;
  readonly pluginId: string;
  readonly phase: LifecyclePhase;
  readonly outcome: PluginLifecycleOutcome;
  /** Populated only on `outcome === "failed"`. */
  readonly errorMessage?: string;
}

const DEFAULT_CAPACITY = 200;

export class PluginLifecycleJournal {
  private readonly _buf: PluginLifecycleEvent[] = [];
  private readonly _capacity: number;

  constructor(capacity: number = DEFAULT_CAPACITY) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new RangeError(
        `PluginLifecycleJournal capacity must be a positive integer (got ${capacity})`,
      );
    }
    this._capacity = capacity;
  }

  get capacity(): number {
    return this._capacity;
  }

  get size(): number {
    return this._buf.length;
  }

  /**
   * Append an event. When at capacity, the oldest event is dropped
   * first (FIFO eviction).
   */
  record(event: PluginLifecycleEvent): void {
    if (this._buf.length >= this._capacity) this._buf.shift();
    this._buf.push(event);
  }

  /** Oldest-first snapshot of all retained events. */
  all(): readonly PluginLifecycleEvent[] {
    return [...this._buf];
  }

  /** Events for one plugin in record-order. */
  forPlugin(pluginId: string): readonly PluginLifecycleEvent[] {
    return this._buf.filter((e) => e.pluginId === pluginId);
  }

  /** Generic predicate filter; preserves record order. */
  filter(
    predicate: (event: PluginLifecycleEvent) => boolean,
  ): readonly PluginLifecycleEvent[] {
    return this._buf.filter(predicate);
  }

  clear(): void {
    this._buf.length = 0;
  }
}

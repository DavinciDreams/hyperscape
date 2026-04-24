/**
 * Haptics registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `haptics.ts`.
 * Pure logic: pattern lookup + total-duration computation + preemption
 * decision based on priority and cancellable flag.
 */

import {
  type HapticPattern,
  type HapticsManifest,
  HapticsManifestSchema,
} from "@hyperforge/manifest-schema";

export class HapticsNotLoadedError extends Error {
  constructor() {
    super("HapticsRegistry used before load()");
    this.name = "HapticsNotLoadedError";
  }
}

export class UnknownHapticPatternError extends Error {
  readonly patternId: string;
  readonly availableIds: readonly string[];
  constructor(id: string, availableIds: readonly string[]) {
    super(
      `haptic pattern "${id}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownHapticPatternError";
    this.patternId = id;
    this.availableIds = availableIds;
  }
}

export class HapticsRegistry {
  private _manifest: HapticsManifest | null = null;
  private _byId = new Map<string, HapticPattern>();

  constructor(manifest?: HapticsManifest) {
    if (manifest) this.load(manifest);
  }

  isLoaded(): boolean {
    return this._manifest !== null;
  }

  load(manifest: HapticsManifest): void {
    this._manifest = manifest;
    this._byId.clear();
    for (const p of manifest) this._byId.set(p.id, p);
  }

  loadFromJson(raw: unknown): void {
    this.load(HapticsManifestSchema.parse(raw));
  }

  get manifest(): HapticsManifest {
    if (!this._manifest) throw new HapticsNotLoadedError();
    return this._manifest;
  }

  get ids(): string[] {
    return Array.from(this._byId.keys());
  }

  has(id: string): boolean {
    return this._byId.has(id);
  }

  get(id: string): HapticPattern {
    const p = this._byId.get(id);
    if (!p) {
      throw new UnknownHapticPatternError(id, Array.from(this._byId.keys()));
    }
    return p;
  }

  /** Patterns filtered by category. */
  byCategory(category: HapticPattern["category"]): HapticPattern[] {
    return this.manifest.filter((p) => p.category === category);
  }

  /**
   * Single-iteration duration (sum of stage durations).
   * Does NOT account for loop/loopGap — loops are unbounded.
   */
  singlePlayDurationMs(id: string): number {
    const pattern = this.get(id);
    return pattern.stages.reduce((acc, s) => acc + s.durationMs, 0);
  }

  /**
   * Should a new trigger preempt a currently-playing pattern on the
   * same channel space? Rules:
   *   - If the active pattern is not cancellable → never preempt
   *   - Otherwise preempt iff incoming priority > active priority
   *
   * Equal priorities intentionally do NOT preempt (queueing is handled
   * by the runtime dispatcher, outside this pure-logic class).
   */
  shouldPreempt(activeId: string, incomingId: string): boolean {
    const active = this.get(activeId);
    if (!active.cancellable) return false;
    const incoming = this.get(incomingId);
    return incoming.priority > active.priority;
  }
}

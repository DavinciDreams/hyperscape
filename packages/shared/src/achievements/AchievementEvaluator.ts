/**
 * Achievement evaluator.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `achievements.ts`.
 * Pure-logic engine: gameplay code feeds in events + stat changes, the
 * evaluator returns the set of achievements newly unlocked for the
 * given player state.
 *
 * Scope: zero deps on player entity, save system, UI, or networking.
 * State is passed in + mutated in place so the caller decides where
 * progress lives (per-character save slice, ephemeral PIE runner, etc.).
 * The caller also decides how to persist `AchievementUnlock[]` returns
 * (emit events, write save rows, show toast).
 */

import {
  type Achievement,
  type AchievementEventTrigger,
  type AchievementCountTrigger,
  type AchievementStatTrigger,
  type AchievementsManifest,
  AchievementsManifestSchema,
} from "@hyperforge/manifest-schema";

export type EventPayloadValue = string | number | boolean;
export type EventPayload = Record<string, EventPayloadValue>;

/** Per-player progress state. Fields are mutated in place. */
export interface AchievementProgressState {
  /** Ids of unlocked achievements. */
  unlocked: Set<string>;
  /** Per-achievement-id counter for `count` triggers. */
  counts: Map<string, number>;
}

/** Result of an unlock — caller can turn this into events/toasts. */
export interface AchievementUnlock {
  id: string;
  achievement: Achievement;
}

/** Count progress readout for UI. */
export interface AchievementCountProgress {
  current: number;
  threshold: number;
}

export class UnknownAchievementError extends Error {
  readonly achievementId: string;
  readonly availableIds: readonly string[];
  constructor(achievementId: string, availableIds: readonly string[]) {
    super(
      `achievement "${achievementId}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownAchievementError";
    this.achievementId = achievementId;
    this.availableIds = availableIds;
  }
}

export class AchievementEvaluator {
  private _byId = new Map<string, Achievement>();
  /** Reverse index: event name → achievement ids listening for it. */
  private _byEvent = new Map<string, Achievement[]>();
  /** Reverse index: stat name → achievement ids listening for it. */
  private _byStat = new Map<string, Achievement[]>();

  constructor(manifest?: AchievementsManifest) {
    if (manifest) this.load(manifest);
  }

  /** Build a fresh progress state (no unlocks, empty counters). */
  static createState(): AchievementProgressState {
    return { unlocked: new Set(), counts: new Map() };
  }

  load(manifest: AchievementsManifest): void {
    this._byId.clear();
    this._byEvent.clear();
    this._byStat.clear();
    for (const a of manifest) {
      this._byId.set(a.id, a);
      const trigger = a.trigger;
      if (trigger.kind === "event" || trigger.kind === "count") {
        const list = this._byEvent.get(trigger.event) ?? [];
        list.push(a);
        this._byEvent.set(trigger.event, list);
      } else {
        const list = this._byStat.get(trigger.stat) ?? [];
        list.push(a);
        this._byStat.set(trigger.stat, list);
      }
    }
  }

  loadFromJson(raw: unknown): void {
    this.load(AchievementsManifestSchema.parse(raw));
  }

  get size(): number {
    return this._byId.size;
  }

  isLoaded(): boolean {
    return this._byId.size > 0;
  }

  get ids(): readonly string[] {
    return Array.from(this._byId.keys());
  }

  has(id: string): boolean {
    return this._byId.has(id);
  }

  get(id: string): Achievement {
    const a = this._byId.get(id);
    if (!a)
      throw new UnknownAchievementError(id, Array.from(this._byId.keys()));
    return a;
  }

  isUnlocked(state: AchievementProgressState, id: string): boolean {
    return state.unlocked.has(id);
  }

  /**
   * Count progress for an achievement with a `count` trigger.
   * Returns `null` for non-count triggers or unknown ids.
   */
  countProgress(
    state: AchievementProgressState,
    id: string,
  ): AchievementCountProgress | null {
    const a = this._byId.get(id);
    if (!a || a.trigger.kind !== "count") return null;
    return {
      current: state.counts.get(id) ?? 0,
      threshold: a.trigger.threshold,
    };
  }

  /**
   * Process a gameplay event. Returns the achievements unlocked by
   * this event (zero, one, or many). Mutates `state.counts` and
   * `state.unlocked` in place.
   */
  handleEvent(
    state: AchievementProgressState,
    event: string,
    payload: EventPayload = {},
  ): AchievementUnlock[] {
    const listeners = this._byEvent.get(event);
    if (!listeners) return [];
    const unlocks: AchievementUnlock[] = [];
    for (const a of listeners) {
      if (state.unlocked.has(a.id)) continue;
      if (!this._prereqsSatisfied(state, a)) continue;
      const t = a.trigger as AchievementEventTrigger | AchievementCountTrigger;
      if (!payloadMatches(payload, t.match)) continue;
      if (t.kind === "event") {
        this._unlock(state, a, unlocks);
      } else {
        const next = (state.counts.get(a.id) ?? 0) + 1;
        state.counts.set(a.id, next);
        if (next >= t.threshold) this._unlock(state, a, unlocks);
      }
    }
    return unlocks;
  }

  /**
   * Process a stat change. Returns achievements unlocked by the new
   * value meeting/exceeding their threshold. Mutates `state.unlocked`.
   */
  handleStat(
    state: AchievementProgressState,
    stat: string,
    value: number,
  ): AchievementUnlock[] {
    if (!Number.isFinite(value)) {
      throw new TypeError(
        `stat value must be a finite number (got ${String(value)})`,
      );
    }
    const listeners = this._byStat.get(stat);
    if (!listeners) return [];
    const unlocks: AchievementUnlock[] = [];
    for (const a of listeners) {
      if (state.unlocked.has(a.id)) continue;
      if (!this._prereqsSatisfied(state, a)) continue;
      const t = a.trigger as AchievementStatTrigger;
      if (value >= t.threshold) this._unlock(state, a, unlocks);
    }
    return unlocks;
  }

  private _prereqsSatisfied(
    state: AchievementProgressState,
    a: Achievement,
  ): boolean {
    for (const p of a.prerequisites) {
      if (!state.unlocked.has(p)) return false;
    }
    return true;
  }

  private _unlock(
    state: AchievementProgressState,
    a: Achievement,
    out: AchievementUnlock[],
  ): void {
    state.unlocked.add(a.id);
    out.push({ id: a.id, achievement: a });
  }
}

function payloadMatches(
  payload: EventPayload,
  match: Record<string, EventPayloadValue>,
): boolean {
  for (const [k, v] of Object.entries(match)) {
    if (payload[k] !== v) return false;
  }
  return true;
}

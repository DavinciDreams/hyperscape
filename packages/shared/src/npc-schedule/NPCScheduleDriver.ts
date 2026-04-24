/**
 * NPC schedule driver.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s
 * `npc-schedule.ts`. Given a schedule + an in-world clock, resolves
 * the currently-active slot (or fallback) and — when wrapped in the
 * stateful `NPCScheduleDriver` — emits change events as the active
 * slot shifts across ticks.
 *
 * Scope: pure logic. No deps on AI behavior tree, pathfinding,
 * animation system, or world event bus. Consumers:
 *   - NPC AI system: every tick, call `driver.tick(clock)`; if a
 *     change event fires, push the new goal (walk-to waypoint,
 *     play animation, trigger dialogue, etc.) onto the AI stack.
 *   - Editor: use `resolveActivity(schedule, clock)` statelessly to
 *     scrub the timeline preview.
 */

import {
  type DayOfWeek,
  type NpcActivityKind,
  type NpcSchedule,
  type NpcScheduleManifest,
  type NpcScheduleSlot,
  NpcScheduleManifestSchema,
} from "@hyperforge/manifest-schema";

/** Clock input for resolution — `day` defaults to "mon" if omitted. */
export interface WorldClock {
  hour: number; // 0..23
  minute: number; // 0..59
  day?: DayOfWeek;
}

/** Resolution result — either a matched slot or the fallback activity. */
export type ResolvedActivity =
  | { slot: NpcScheduleSlot; kind: NpcActivityKind }
  | { slot: null; kind: NpcActivityKind };

/** Emitted by `NPCScheduleDriver.tick` when the active slot changes. */
export interface ScheduleChangeEvent {
  previousSlotId: string | null;
  previousActivity: NpcActivityKind;
  current: ResolvedActivity;
}

export class UnknownNpcScheduleError extends Error {
  readonly scheduleId: string;
  readonly availableIds: readonly string[];
  constructor(scheduleId: string, availableIds: readonly string[]) {
    super(
      `npc schedule "${scheduleId}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownNpcScheduleError";
    this.scheduleId = scheduleId;
    this.availableIds = availableIds;
  }
}

/** Stateless resolver — picks the first slot that matches `clock`. */
export function resolveActivity(
  schedule: NpcSchedule,
  clock: WorldClock,
): ResolvedActivity {
  validateClock(clock);
  const nowMin = clock.hour * 60 + clock.minute;
  const day = clock.day ?? "mon";
  for (const slot of schedule.slots) {
    if (slot.days.length > 0 && !slot.days.includes(day)) continue;
    if (matchesTime(slot, nowMin)) {
      return { slot, kind: slot.activity };
    }
  }
  return { slot: null, kind: schedule.fallbackActivity };
}

function matchesTime(slot: NpcScheduleSlot, nowMin: number): boolean {
  const startMin = parseTime(slot.startTime);
  const endMin = parseTime(slot.endTime);
  if (startMin < endMin) {
    return nowMin >= startMin && nowMin < endMin;
  }
  // Overnight: wraps past midnight. Active if now >= start OR now < end.
  return nowMin >= startMin || nowMin < endMin;
}

function parseTime(hhmm: string): number {
  // Schema guarantees "HH:MM"
  const h = Number(hhmm.slice(0, 2));
  const m = Number(hhmm.slice(3, 5));
  return h * 60 + m;
}

function validateClock(clock: WorldClock): void {
  if (
    !Number.isInteger(clock.hour) ||
    clock.hour < 0 ||
    clock.hour > 23 ||
    !Number.isInteger(clock.minute) ||
    clock.minute < 0 ||
    clock.minute > 59
  ) {
    throw new TypeError(
      `WorldClock must have integer hour ∈ [0,23] and minute ∈ [0,59] (got ${clock.hour}:${clock.minute})`,
    );
  }
}

/** Stateful driver — emits change events on slot transitions. */
export class NPCScheduleDriver {
  readonly schedule: NpcSchedule;
  private _currentSlotId: string | null = null;
  private _currentActivity: NpcActivityKind;

  constructor(schedule: NpcSchedule) {
    this.schedule = schedule;
    this._currentActivity = schedule.fallbackActivity;
  }

  get currentSlotId(): string | null {
    return this._currentSlotId;
  }

  get currentActivity(): NpcActivityKind {
    return this._currentActivity;
  }

  /** Reset bookkeeping so the next `tick` emits a fresh change. */
  reset(): void {
    this._currentSlotId = null;
    this._currentActivity = this.schedule.fallbackActivity;
  }

  /**
   * Evaluate the schedule at `clock`. If the active slot id (or the
   * fallback kind after being in a slot) differs from last tick,
   * returns a `ScheduleChangeEvent`; otherwise returns `null`.
   */
  tick(clock: WorldClock): ScheduleChangeEvent | null {
    const resolved = resolveActivity(this.schedule, clock);
    const newSlotId = resolved.slot ? resolved.slot.id : null;
    const isFirst =
      this._currentSlotId === null &&
      newSlotId === null &&
      this._currentActivity === this.schedule.fallbackActivity;
    const changed =
      newSlotId !== this._currentSlotId ||
      (newSlotId === null && resolved.kind !== this._currentActivity);
    if (!changed) return null;
    // First-tick fallback → fallback is not a "change" to surface (nothing
    // was ever different). But first-tick into a real slot IS a change.
    if (isFirst && newSlotId === null) {
      // Lock in without emitting.
      this._currentSlotId = null;
      this._currentActivity = resolved.kind;
      return null;
    }
    const event: ScheduleChangeEvent = {
      previousSlotId: this._currentSlotId,
      previousActivity: this._currentActivity,
      current: resolved,
    };
    this._currentSlotId = newSlotId;
    this._currentActivity = resolved.kind;
    return event;
  }
}

/** Registry — indexes schedules by id + offers NPC→schedule lookup. */
export class NpcScheduleRegistry {
  private _byId = new Map<string, NpcSchedule>();
  private _byNpcId = new Map<string, NpcSchedule>();

  constructor(manifest?: NpcScheduleManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: NpcScheduleManifest): void {
    this._byId.clear();
    this._byNpcId.clear();
    for (const s of manifest) {
      this._byId.set(s.id, s);
      for (const npcId of s.npcIds) {
        // Last-wins for conflicting assignments — schema doesn't enforce
        // uniqueness of npcId across schedules, so we deterministically
        // keep the later manifest entry.
        this._byNpcId.set(npcId, s);
      }
    }
  }

  loadFromJson(raw: unknown): void {
    this.load(NpcScheduleManifestSchema.parse(raw));
  }

  get size(): number {
    return this._byId.size;
  }

  /**
   * Non-throwing check for consumers that want to prefer the registry
   * when a schedule manifest has been loaded and fall back to default
   * AI behavior otherwise. Symmetric with `WorldAreasRegistry.isLoaded()`.
   */
  isLoaded(): boolean {
    return this._byId.size > 0;
  }

  get ids(): readonly string[] {
    return Array.from(this._byId.keys());
  }

  has(id: string): boolean {
    return this._byId.has(id);
  }

  get(id: string): NpcSchedule {
    const s = this._byId.get(id);
    if (!s) {
      throw new UnknownNpcScheduleError(id, Array.from(this._byId.keys()));
    }
    return s;
  }

  /** Returns the schedule the given npc id is mapped to, or null. */
  findForNpc(npcId: string): NpcSchedule | null {
    return this._byNpcId.get(npcId) ?? null;
  }

  /** Convenience: `new NPCScheduleDriver(registry.get(id))`. */
  createDriver(id: string): NPCScheduleDriver {
    return new NPCScheduleDriver(this.get(id));
  }
}

/**
 * World-events registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `world-events.ts`.
 * Pure logic: event lookup (by id / category / trigger kind / zone),
 * phase chain traversal (next on success/failure), participation-tier
 * resolution by contribution fraction, eligibility gate (level+lockout),
 * schedule/random next-roll math. Runtime `WorldEventSystem` owns the
 * scheduler, live participant tracking, and map markers.
 */

import {
  type WorldEvent,
  type WorldEventCategory,
  type WorldEventParticipationTier,
  type WorldEventPhase,
  type WorldEventTrigger,
  type WorldEventsManifest,
  WorldEventsManifestSchema,
} from "@hyperforge/manifest-schema";

export class WorldEventsNotLoadedError extends Error {
  constructor() {
    super("WorldEventsRegistry used before load()");
    this.name = "WorldEventsNotLoadedError";
  }
}

export class UnknownWorldEventError extends Error {
  readonly eventId: string;
  readonly availableIds: readonly string[];
  constructor(id: string, availableIds: readonly string[]) {
    super(
      `world-event "${id}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownWorldEventError";
    this.eventId = id;
    this.availableIds = availableIds;
  }
}

export class UnknownPhaseError extends Error {
  readonly eventId: string;
  readonly phaseId: string;
  constructor(eventId: string, phaseId: string) {
    super(`world-event "${eventId}" has no phase "${phaseId}"`);
    this.name = "UnknownPhaseError";
    this.eventId = eventId;
    this.phaseId = phaseId;
  }
}

export type EligibilityReason =
  | "allowed"
  | "event-not-found"
  | "below-level"
  | "above-level"
  | "reward-lockout";

export interface EligibilityInput {
  characterLevel: number;
  hoursSinceLastReward: number;
}

export interface EligibilityResult {
  allowed: boolean;
  reason: EligibilityReason;
}

export class WorldEventsRegistry {
  private _manifest: WorldEventsManifest | null = null;
  private _byId = new Map<string, WorldEvent>();

  constructor(manifest?: WorldEventsManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: WorldEventsManifest): void {
    this._manifest = manifest;
    this._byId.clear();
    for (const e of manifest) this._byId.set(e.id, e);
  }

  loadFromJson(raw: unknown): void {
    this.load(WorldEventsManifestSchema.parse(raw));
  }

  get manifest(): WorldEventsManifest {
    if (!this._manifest) throw new WorldEventsNotLoadedError();
    return this._manifest;
  }

  isLoaded(): boolean {
    return this._manifest !== null;
  }

  /* --- lookup --- */

  has(id: string): boolean {
    return this._byId.has(id);
  }

  get(id: string): WorldEvent {
    const e = this._byId.get(id);
    if (!e) {
      throw new UnknownWorldEventError(id, Array.from(this._byId.keys()));
    }
    return e;
  }

  ids(): string[] {
    return Array.from(this._byId.keys());
  }

  byCategory(category: WorldEventCategory): WorldEvent[] {
    return Array.from(this._byId.values()).filter(
      (e) => e.category === category,
    );
  }

  byTriggerKind(kind: WorldEventTrigger["kind"]): WorldEvent[] {
    return Array.from(this._byId.values()).filter(
      (e) => e.trigger.kind === kind,
    );
  }

  byZone(zoneId: string): WorldEvent[] {
    return Array.from(this._byId.values()).filter((e) => e.zoneId === zoneId);
  }

  /* --- phases --- */

  phase(eventId: string, phaseId: string): WorldEventPhase {
    const e = this.get(eventId);
    const p = e.phases.find((q) => q.id === phaseId);
    if (!p) throw new UnknownPhaseError(eventId, phaseId);
    return p;
  }

  startPhase(eventId: string): WorldEventPhase {
    const e = this.get(eventId);
    return this.phase(eventId, e.startPhaseId);
  }

  /**
   * Resolve the next phase in the chain. Returns null when the branch
   * ends the event (success or failure terminal).
   */
  nextPhase(
    eventId: string,
    phaseId: string,
    outcome: "success" | "failure",
  ): WorldEventPhase | null {
    const p = this.phase(eventId, phaseId);
    const next = outcome === "success" ? p.nextOnSuccess : p.nextOnFailure;
    if (next === "") return null;
    return this.phase(eventId, next);
  }

  /* --- participation tiers --- */

  /**
   * Pick the highest-qualifying tier given the player's contribution
   * fraction. Returns null when no tier's `minContribution` is met.
   */
  resolveParticipationTier(
    eventId: string,
    contributionFraction: number,
  ): WorldEventParticipationTier | null {
    const e = this.get(eventId);
    const sorted = [...e.participationTiers].sort(
      (a, b) => a.minContribution - b.minContribution,
    );
    let match: WorldEventParticipationTier | null = null;
    for (const t of sorted) {
      if (contributionFraction >= t.minContribution) match = t;
      else break;
    }
    return match;
  }

  /* --- eligibility --- */

  checkEligibility(
    eventId: string,
    input: EligibilityInput,
  ): EligibilityResult {
    if (!this._byId.has(eventId)) {
      return { allowed: false, reason: "event-not-found" };
    }
    const e = this.get(eventId);
    if (input.characterLevel < e.minLevel) {
      return { allowed: false, reason: "below-level" };
    }
    if (input.characterLevel > e.maxLevel) {
      return { allowed: false, reason: "above-level" };
    }
    if (
      e.rewardLockoutHours > 0 &&
      input.hoursSinceLastReward < e.rewardLockoutHours
    ) {
      return { allowed: false, reason: "reward-lockout" };
    }
    return { allowed: true, reason: "allowed" };
  }

  /* --- schedule math --- */

  /**
   * For a `schedule`-triggered event: average seconds between spawns.
   * Throws if trigger kind differs. Used by offline/planning code.
   */
  averageScheduleIntervalSec(eventId: string): number {
    const e = this.get(eventId);
    if (e.trigger.kind !== "schedule") {
      throw new Error(
        `world-event "${eventId}" trigger is not 'schedule' (got '${e.trigger.kind}')`,
      );
    }
    return e.trigger.intervalMinutes * 60;
  }

  /**
   * For a `random`-triggered event: expected seconds between spawns
   * given the authored `chancePerRoll` + `rollIntervalSec`. Geometric
   * distribution mean.
   */
  expectedRandomIntervalSec(eventId: string): number {
    const e = this.get(eventId);
    if (e.trigger.kind !== "random") {
      throw new Error(
        `world-event "${eventId}" trigger is not 'random' (got '${e.trigger.kind}')`,
      );
    }
    const { chancePerRoll, rollIntervalSec } = e.trigger;
    if (chancePerRoll <= 0) return Number.POSITIVE_INFINITY;
    return rollIntervalSec / chancePerRoll;
  }
}

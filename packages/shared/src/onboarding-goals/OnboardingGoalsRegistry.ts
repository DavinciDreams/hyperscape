/**
 * Onboarding-goals registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s
 * `onboarding-goals.ts`. Pure logic: goal lookup (by id / display
 * order), topological ordering of the prerequisite DAG, availability
 * check (prereqs satisfied), goal advancement selection, skip-all
 * gate, abort-rules lookup. Runtime `OnboardingSystem` owns per-player
 * completion state, HUD tracker, and reward application.
 */

import {
  type AbortRules,
  type OnboardingGoal,
  type OnboardingGoalsManifest,
  OnboardingGoalsManifestSchema,
} from "@hyperforge/manifest-schema";

export class OnboardingGoalsNotLoadedError extends Error {
  constructor() {
    super("OnboardingGoalsRegistry used before load()");
    this.name = "OnboardingGoalsNotLoadedError";
  }
}

export class UnknownOnboardingGoalError extends Error {
  readonly goalId: string;
  readonly availableIds: readonly string[];
  constructor(id: string, availableIds: readonly string[]) {
    super(
      `onboarding-goal "${id}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownOnboardingGoalError";
    this.goalId = id;
    this.availableIds = availableIds;
  }
}

export type AvailabilityReason =
  | "available"
  | "already-complete"
  | "missing-prereq"
  | "goal-not-found";

export interface AvailabilityResult {
  available: boolean;
  reason: AvailabilityReason;
  /** First missing prereq id when reason is "missing-prereq"; empty otherwise. */
  missingPrereqId: string;
}

export class OnboardingGoalsRegistry {
  private _manifest: OnboardingGoalsManifest | null = null;
  private _byId = new Map<string, OnboardingGoal>();

  constructor(manifest?: OnboardingGoalsManifest) {
    if (manifest) this.load(manifest);
  }

  isLoaded(): boolean {
    return this._manifest !== null;
  }

  load(manifest: OnboardingGoalsManifest): void {
    this._manifest = manifest;
    this._byId.clear();
    for (const g of manifest.goals) this._byId.set(g.id, g);
  }

  loadFromJson(raw: unknown): void {
    this.load(OnboardingGoalsManifestSchema.parse(raw));
  }

  get manifest(): OnboardingGoalsManifest {
    if (!this._manifest) throw new OnboardingGoalsNotLoadedError();
    return this._manifest;
  }

  get enabled(): boolean {
    return this.manifest.enabled;
  }
  get abort(): AbortRules {
    return this.manifest.abort;
  }

  /* --- lookup --- */

  has(id: string): boolean {
    return this._byId.has(id);
  }

  get(id: string): OnboardingGoal {
    const g = this._byId.get(id);
    if (!g) {
      throw new UnknownOnboardingGoalError(id, Array.from(this._byId.keys()));
    }
    return g;
  }

  ids(): string[] {
    return Array.from(this._byId.keys());
  }

  /** Goals sorted by authored `displayOrder` ascending. */
  goalsByDisplayOrder(): OnboardingGoal[] {
    return Array.from(this._byId.values()).sort(
      (a, b) => a.displayOrder - b.displayOrder,
    );
  }

  /** Only goals marked `showInTracker`, sorted by displayOrder. */
  trackerGoals(): OnboardingGoal[] {
    return this.goalsByDisplayOrder().filter((g) => g.showInTracker);
  }

  /* --- topological order --- */

  /**
   * Kahn topo-sort of the prerequisite DAG. Ties break by
   * `displayOrder` then by id for determinism. Throws if a cycle is
   * detected (should never happen post-schema-validation).
   */
  topologicalOrder(): OnboardingGoal[] {
    const indeg = new Map<string, number>();
    const revAdj = new Map<string, string[]>();
    for (const g of this._byId.values()) {
      indeg.set(g.id, g.prerequisites.length);
      revAdj.set(g.id, []);
    }
    for (const g of this._byId.values()) {
      for (const p of g.prerequisites) {
        revAdj.get(p)?.push(g.id);
      }
    }
    const ready: OnboardingGoal[] = [];
    for (const g of this._byId.values()) {
      if ((indeg.get(g.id) ?? 0) === 0) ready.push(g);
    }
    const order: OnboardingGoal[] = [];
    const sortKey = (g: OnboardingGoal) => `${g.displayOrder}_${g.id}`;
    while (ready.length > 0) {
      ready.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
      const next = ready.shift();
      if (!next) break;
      order.push(next);
      for (const childId of revAdj.get(next.id) ?? []) {
        const d = (indeg.get(childId) ?? 0) - 1;
        indeg.set(childId, d);
        if (d === 0) {
          const child = this._byId.get(childId);
          if (child) ready.push(child);
        }
      }
    }
    if (order.length !== this._byId.size) {
      throw new Error("onboarding-goals contains a prerequisite cycle");
    }
    return order;
  }

  /* --- availability --- */

  /**
   * Is a goal available for the player given their set of completed
   * goal ids?
   */
  checkAvailability(
    goalId: string,
    completedGoalIds: ReadonlySet<string>,
  ): AvailabilityResult {
    if (!this._byId.has(goalId)) {
      return {
        available: false,
        reason: "goal-not-found",
        missingPrereqId: "",
      };
    }
    if (completedGoalIds.has(goalId)) {
      return {
        available: false,
        reason: "already-complete",
        missingPrereqId: "",
      };
    }
    const g = this.get(goalId);
    for (const p of g.prerequisites) {
      if (!completedGoalIds.has(p)) {
        return {
          available: false,
          reason: "missing-prereq",
          missingPrereqId: p,
        };
      }
    }
    return { available: true, reason: "available", missingPrereqId: "" };
  }

  /**
   * Pick the next goal the player should work on: topologically-first
   * available goal. Returns null if every goal is already complete.
   */
  nextGoal(completedGoalIds: ReadonlySet<string>): OnboardingGoal | null {
    for (const g of this.topologicalOrder()) {
      if (completedGoalIds.has(g.id)) continue;
      const ok = g.prerequisites.every((p) => completedGoalIds.has(p));
      if (ok) return g;
    }
    return null;
  }

  /* --- skip-all gate --- */

  canSkipAll(characterLevel: number): boolean {
    if (!this.abort.allowSkipAll) return false;
    return characterLevel >= this.abort.skipAllAvailableAtLevel;
  }
}

/**
 * Tutorial-flows registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s
 * `tutorial-flows.ts`. Pure logic: flow lookup, step lookup inside a
 * flow, start-step + next-step resolution, auto-start candidate
 * selection (filtered+sorted by priority), prerequisite DAG topo
 * order, availability check. Runtime `TutorialSystem` owns trigger
 * matching, overlay UI, and persistence.
 */

import {
  type TutorialFlow,
  type TutorialFlowsManifest,
  type TutorialStep,
  TutorialFlowsManifestSchema,
} from "@hyperforge/manifest-schema";

export class TutorialFlowsNotLoadedError extends Error {
  constructor() {
    super("TutorialFlowsRegistry used before load()");
    this.name = "TutorialFlowsNotLoadedError";
  }
}

export class UnknownTutorialFlowError extends Error {
  readonly flowId: string;
  readonly availableIds: readonly string[];
  constructor(id: string, availableIds: readonly string[]) {
    super(
      `tutorial-flow "${id}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownTutorialFlowError";
    this.flowId = id;
    this.availableIds = availableIds;
  }
}

export class UnknownTutorialStepError extends Error {
  readonly flowId: string;
  readonly stepId: string;
  constructor(flowId: string, stepId: string) {
    super(`tutorial-flow "${flowId}" has no step "${stepId}"`);
    this.name = "UnknownTutorialStepError";
    this.flowId = flowId;
    this.stepId = stepId;
  }
}

export type AvailabilityReason =
  | "available"
  | "flow-not-found"
  | "already-complete"
  | "missing-prereq";

export interface AvailabilityResult {
  available: boolean;
  reason: AvailabilityReason;
  missingPrereqId: string;
}

/** Listener invoked after every successful `load()` / `loadFromJson()`. */
export type TutorialFlowsReloadListener = () => void;

export class TutorialFlowsRegistry {
  private _manifest: TutorialFlowsManifest | null = null;
  private _byId = new Map<string, TutorialFlow>();
  private _reloadListeners = new Set<TutorialFlowsReloadListener>();

  constructor(manifest?: TutorialFlowsManifest) {
    if (manifest) this.load(manifest);
  }

  isLoaded(): boolean {
    return this._manifest !== null;
  }

  load(manifest: TutorialFlowsManifest): void {
    this._manifest = manifest;
    this._byId.clear();
    for (const f of manifest) this._byId.set(f.id, f);
    this._emitReloaded();
  }

  /**
   * Subscribe to reload notifications. Returns unsubscribe.
   * Listener throws are caught + logged. Pattern matches
   * `SkillIconsRegistry.onReloaded`.
   */
  onReloaded(cb: TutorialFlowsReloadListener): () => void {
    this._reloadListeners.add(cb);
    return () => {
      this._reloadListeners.delete(cb);
    };
  }

  private _emitReloaded(): void {
    if (this._reloadListeners.size === 0) return;
    for (const cb of this._reloadListeners) {
      try {
        cb();
      } catch (err) {
        console.warn(
          "[tutorialFlowsRegistry] reload listener threw:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  loadFromJson(raw: unknown): void {
    this.load(TutorialFlowsManifestSchema.parse(raw));
  }

  get manifest(): TutorialFlowsManifest {
    if (!this._manifest) throw new TutorialFlowsNotLoadedError();
    return this._manifest;
  }

  /* --- flow lookup --- */

  has(id: string): boolean {
    return this._byId.has(id);
  }

  get(id: string): TutorialFlow {
    const f = this._byId.get(id);
    if (!f) {
      throw new UnknownTutorialFlowError(id, Array.from(this._byId.keys()));
    }
    return f;
  }

  ids(): string[] {
    return Array.from(this._byId.keys());
  }

  byCategory(category: string): TutorialFlow[] {
    return Array.from(this._byId.values()).filter(
      (f) => f.category === category,
    );
  }

  /* --- step traversal --- */

  startStep(flowId: string): TutorialStep {
    const f = this.get(flowId);
    return this.step(flowId, f.startStepId);
  }

  step(flowId: string, stepId: string): TutorialStep {
    const f = this.get(flowId);
    const s = f.steps[stepId];
    if (!s) throw new UnknownTutorialStepError(flowId, stepId);
    return s;
  }

  /**
   * Resolve the next step from `stepId`. Returns null if it's the end
   * of the flow.
   */
  nextStep(flowId: string, stepId: string): TutorialStep | null {
    const s = this.step(flowId, stepId);
    if (s.nextStepId === "") return null;
    return this.step(flowId, s.nextStepId);
  }

  /**
   * Resolve the skip-target step for `stepId`. Returns null when the
   * step has no skip target configured.
   */
  skipStep(flowId: string, stepId: string): TutorialStep | null {
    const s = this.step(flowId, stepId);
    if (s.skipToStepId === "") return null;
    return this.step(flowId, s.skipToStepId);
  }

  /* --- prerequisite DAG --- */

  /**
   * Kahn topo-sort of the prerequisite DAG. Ties break by priority
   * desc then id for determinism.
   */
  topologicalOrder(): TutorialFlow[] {
    const indeg = new Map<string, number>();
    const revAdj = new Map<string, string[]>();
    for (const f of this._byId.values()) {
      indeg.set(f.id, f.prerequisiteFlowIds.length);
      revAdj.set(f.id, []);
    }
    for (const f of this._byId.values()) {
      for (const p of f.prerequisiteFlowIds) {
        revAdj.get(p)?.push(f.id);
      }
    }
    const ready: TutorialFlow[] = [];
    for (const f of this._byId.values()) {
      if ((indeg.get(f.id) ?? 0) === 0) ready.push(f);
    }
    const order: TutorialFlow[] = [];
    const sort = (arr: TutorialFlow[]) => {
      arr.sort((a, b) => {
        if (a.priority !== b.priority) return b.priority - a.priority;
        return a.id.localeCompare(b.id);
      });
    };
    while (ready.length > 0) {
      sort(ready);
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
      throw new Error("tutorial-flows contains a prerequisite cycle");
    }
    return order;
  }

  /* --- availability --- */

  checkAvailability(
    flowId: string,
    completedFlowIds: ReadonlySet<string>,
  ): AvailabilityResult {
    if (!this._byId.has(flowId)) {
      return {
        available: false,
        reason: "flow-not-found",
        missingPrereqId: "",
      };
    }
    if (completedFlowIds.has(flowId)) {
      return {
        available: false,
        reason: "already-complete",
        missingPrereqId: "",
      };
    }
    const f = this.get(flowId);
    for (const p of f.prerequisiteFlowIds) {
      if (!completedFlowIds.has(p)) {
        return {
          available: false,
          reason: "missing-prereq",
          missingPrereqId: p,
        };
      }
    }
    return {
      available: true,
      reason: "available",
      missingPrereqId: "",
    };
  }

  /**
   * Auto-start candidates: flows with `autoStart=true`, not already
   * complete, with all prereqs satisfied. Sorted by priority desc.
   */
  autoStartCandidates(completedFlowIds: ReadonlySet<string>): TutorialFlow[] {
    return Array.from(this._byId.values())
      .filter((f) => f.autoStart)
      .filter((f) => !completedFlowIds.has(f.id))
      .filter((f) =>
        f.prerequisiteFlowIds.every((p) => completedFlowIds.has(p)),
      )
      .sort((a, b) => {
        if (a.priority !== b.priority) return b.priority - a.priority;
        return a.id.localeCompare(b.id);
      });
  }
}

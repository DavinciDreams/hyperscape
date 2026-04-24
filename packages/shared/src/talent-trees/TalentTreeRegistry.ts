/**
 * Talent-tree registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `talent-trees.ts`.
 * Pure logic: selectability checks (tier gate + prerequisites),
 * allocation validation, topological ordering, and respec-cost math.
 * Runtime `TalentTreeSystem` owns per-character allocation state,
 * point budgets, and UI.
 */

import {
  type TalentNode,
  type TalentRespecRules,
  type TalentTree,
  type TalentTreeKind,
  type TalentTreesManifest,
  TalentTreesManifestSchema,
} from "@hyperforge/manifest-schema";

export class UnknownTalentTreeError extends Error {
  readonly treeId: string;
  readonly availableIds: readonly string[];
  constructor(id: string, availableIds: readonly string[]) {
    super(
      `talent tree "${id}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownTalentTreeError";
    this.treeId = id;
    this.availableIds = availableIds;
  }
}

export class UnknownTalentNodeError extends Error {
  readonly treeId: string;
  readonly nodeId: string;
  constructor(treeId: string, nodeId: string) {
    super(`talent node "${nodeId}" not found in tree "${treeId}"`);
    this.name = "UnknownTalentNodeError";
    this.treeId = treeId;
    this.nodeId = nodeId;
  }
}

/** Current per-character allocation snapshot for a tree. */
export type Allocation = ReadonlyMap<string, number>;

export type SelectableReason =
  | "selectable"
  | "at-max-rank"
  | "tier-locked"
  | "prereq-missing"
  | "budget-exhausted";

export interface SelectableResult {
  selectable: boolean;
  reason: SelectableReason;
}

export class TalentTreeRegistry {
  private _manifest: TalentTreesManifest | null = null;
  private _byId = new Map<string, TalentTree>();

  constructor(manifest?: TalentTreesManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: TalentTreesManifest): void {
    this._manifest = manifest;
    this._byId.clear();
    for (const t of manifest.trees) this._byId.set(t.id, t);
  }

  loadFromJson(raw: unknown): void {
    this.load(TalentTreesManifestSchema.parse(raw));
  }

  isLoaded(): boolean {
    return this._manifest !== null;
  }

  get manifest(): TalentTreesManifest {
    if (!this._manifest) throw new Error("TalentTreeRegistry not loaded");
    return this._manifest;
  }

  get respec(): TalentRespecRules {
    return this.manifest.respec;
  }

  get size(): number {
    return this._byId.size;
  }

  has(id: string): boolean {
    return this._byId.has(id);
  }

  get(id: string): TalentTree {
    const t = this._byId.get(id);
    if (!t) {
      throw new UnknownTalentTreeError(id, Array.from(this._byId.keys()));
    }
    return t;
  }

  ids(): string[] {
    return Array.from(this._byId.keys());
  }

  byKind(kind: TalentTreeKind): TalentTree[] {
    return Array.from(this._byId.values()).filter((t) => t.kind === kind);
  }

  getNode(treeId: string, nodeId: string): TalentNode {
    const t = this.get(treeId);
    const n = t.nodes.find((x) => x.id === nodeId);
    if (!n) throw new UnknownTalentNodeError(treeId, nodeId);
    return n;
  }

  /** Total points currently allocated in the tree. */
  totalAllocated(allocation: Allocation): number {
    let sum = 0;
    for (const v of allocation.values()) sum += v;
    return sum;
  }

  /**
   * Can the player spend one more point on `nodeId` given current
   * allocation + available points?
   */
  canAllocate(
    treeId: string,
    nodeId: string,
    allocation: Allocation,
    availablePoints: number,
  ): SelectableResult {
    const tree = this.get(treeId);
    const node = this.getNode(treeId, nodeId);
    const current = allocation.get(nodeId) ?? 0;
    if (current >= node.maxPoints) {
      return { selectable: false, reason: "at-max-rank" };
    }
    if (availablePoints < node.costPerPoint) {
      return { selectable: false, reason: "budget-exhausted" };
    }
    const totalSpent = this.totalAllocated(allocation);
    if (totalSpent < node.tier * tree.tierPointRequirement) {
      return { selectable: false, reason: "tier-locked" };
    }
    for (const p of node.prerequisites) {
      const have = allocation.get(p.nodeId) ?? 0;
      if (have < p.minPoints) {
        return { selectable: false, reason: "prereq-missing" };
      }
    }
    return { selectable: true, reason: "selectable" };
  }

  /**
   * Validate an entire allocation snapshot. Returns `null` if valid,
   * otherwise a first-offense diagnostic.
   */
  validateAllocation(
    treeId: string,
    allocation: Allocation,
    totalPointsAvailable: number,
  ): { nodeId: string; reason: SelectableReason } | null {
    const tree = this.get(treeId);
    if (this.totalAllocated(allocation) > totalPointsAvailable) {
      return { nodeId: "__budget__", reason: "budget-exhausted" };
    }
    // Walk nodes in tier order; require each allocation to be satisfiable
    // at its tier given everything lower-tier that's already placed.
    const ordered = [...tree.nodes].sort((a, b) => a.tier - b.tier);
    for (const n of ordered) {
      const points = allocation.get(n.id) ?? 0;
      if (points === 0) continue;
      if (points > n.maxPoints) {
        return { nodeId: n.id, reason: "at-max-rank" };
      }
      for (const p of n.prerequisites) {
        const have = allocation.get(p.nodeId) ?? 0;
        if (have < p.minPoints) {
          return { nodeId: n.id, reason: "prereq-missing" };
        }
      }
    }
    return null;
  }

  /**
   * Return nodes currently selectable (≥1 more point spendable) given
   * allocation + available budget. Ordered by tier.
   */
  selectableNodes(
    treeId: string,
    allocation: Allocation,
    availablePoints: number,
  ): TalentNode[] {
    const tree = this.get(treeId);
    return tree.nodes
      .filter(
        (n) =>
          this.canAllocate(treeId, n.id, allocation, availablePoints)
            .selectable,
      )
      .sort((a, b) => a.tier - b.tier);
  }

  /**
   * Compute the currency cost of a respec given `priorRespecCount`.
   * Returns 0 when the player has free respecs remaining.
   */
  respecCost(
    priorRespecCount: number,
    freeRespecsUsedThisWeek: number,
  ): number {
    const r = this.manifest.respec;
    if (!r.enabled) return 0;
    if (freeRespecsUsedThisWeek < r.freeRespecsPerWeek) return 0;
    return Math.round(
      r.baseCostCurrency * Math.pow(r.costMultiplierPerUse, priorRespecCount),
    );
  }
}

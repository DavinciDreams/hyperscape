/**
 * Fast-travel graph.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s
 * `fast-travel.ts`. Pure logic: indexes nodes + edges, computes
 * adjacency, runs a Dijkstra shortest-path across the travel graph
 * using `travelTimeSec` as edge weight, and evaluates
 * unlock/use predicates against an abstract player snapshot.
 *
 * Scope: graph queries only. Caller owns cooldown tracking, cost
 * settlement, animation playback, and discovery persistence.
 */

import {
  type FastTravelEdge,
  type FastTravelGlobalRules,
  type FastTravelManifest,
  FastTravelManifestSchema,
  type FastTravelNode,
} from "@hyperforge/manifest-schema";

export class UnknownNodeError extends Error {
  readonly nodeId: string;
  constructor(nodeId: string) {
    super(`fast-travel node "${nodeId}" not found`);
    this.name = "UnknownNodeError";
    this.nodeId = nodeId;
  }
}

export interface TravelerState {
  characterLevel: number;
  factionId?: string;
  inCombat: boolean;
  pvpFlagged: boolean;
  inInstancedContent: boolean;
  /** Set of already-discovered node ids. */
  discoveredNodeIds: Set<string>;
  /** Completed quest ids for unlock gating. */
  completedQuestIds?: Set<string>;
  /** Completed achievements for unlock gating. */
  completedAchievementIds?: Set<string>;
  /** Reputation standings by factionId for unlock gating. */
  reputationStandings?: Map<string, number>;
  /** World-state flags (used by edge requiresWorldStateFlag). */
  worldStateFlags?: Set<string>;
}

export type UsableReason =
  | "ok"
  | "disabled-global"
  | "blocked-combat"
  | "blocked-pvp"
  | "blocked-instanced"
  | "not-discovered"
  | "faction-gate"
  | "unlock-gate";

export interface UsabilityOutcome {
  usable: boolean;
  reason: UsableReason;
}

export interface PathStep {
  edgeId: string;
  fromNodeId: string;
  toNodeId: string;
  travelTimeSec: number;
  travelCostCurrency: number;
}

export interface PathResult {
  totalSec: number;
  totalCost: number;
  steps: PathStep[];
}

export class FastTravelGraph {
  private _manifest: FastTravelManifest | null = null;
  private _nodesById = new Map<string, FastTravelNode>();
  private _edgesById = new Map<string, FastTravelEdge>();
  /** from → [{edge, toNodeId}] — includes reverse-expanded bidirectional edges. */
  private _adjacency = new Map<
    string,
    Array<{ edge: FastTravelEdge; toNodeId: string }>
  >();

  constructor(manifest?: FastTravelManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: FastTravelManifest): void {
    this._manifest = manifest;
    this._nodesById.clear();
    this._edgesById.clear();
    this._adjacency.clear();
    for (const n of manifest.nodes) this._nodesById.set(n.id, n);
    for (const e of manifest.edges) {
      this._edgesById.set(e.id, e);
      const fwd = this._adjacency.get(e.fromNodeId) ?? [];
      fwd.push({ edge: e, toNodeId: e.toNodeId });
      this._adjacency.set(e.fromNodeId, fwd);
      if (e.direction === "bidirectional") {
        const rev = this._adjacency.get(e.toNodeId) ?? [];
        rev.push({ edge: e, toNodeId: e.fromNodeId });
        this._adjacency.set(e.toNodeId, rev);
      }
    }
  }

  loadFromJson(raw: unknown): void {
    this.load(FastTravelManifestSchema.parse(raw));
  }

  isLoaded(): boolean {
    return this._manifest !== null;
  }

  get nodeCount(): number {
    return this._nodesById.size;
  }

  get edgeCount(): number {
    return this._edgesById.size;
  }

  get rules(): FastTravelGlobalRules {
    return this._require().global;
  }

  hasNode(id: string): boolean {
    return this._nodesById.has(id);
  }

  getNode(id: string): FastTravelNode {
    const n = this._nodesById.get(id);
    if (!n) throw new UnknownNodeError(id);
    return n;
  }

  getEdge(id: string): FastTravelEdge {
    const e = this._edgesById.get(id);
    if (!e) throw new Error(`fast-travel edge "${id}" not found`);
    return e;
  }

  neighbors(nodeId: string): Array<{ edge: FastTravelEdge; toNodeId: string }> {
    return this._adjacency.get(nodeId) ?? [];
  }

  /**
   * Is a node currently usable for the traveler? Combines global rules,
   * discovery, unlock gates, and faction allow list.
   */
  usability(nodeId: string, traveler: TravelerState): UsabilityOutcome {
    const rules = this.rules;
    if (!rules.enabled) return { usable: false, reason: "disabled-global" };
    if (rules.blockedInCombat && traveler.inCombat) {
      return { usable: false, reason: "blocked-combat" };
    }
    if (rules.blockedWhilePvPFlagged && traveler.pvpFlagged) {
      return { usable: false, reason: "blocked-pvp" };
    }
    if (rules.blockedInInstancedContent && traveler.inInstancedContent) {
      return { usable: false, reason: "blocked-instanced" };
    }
    const node = this.getNode(nodeId);
    if (!traveler.discoveredNodeIds.has(nodeId)) {
      return { usable: false, reason: "not-discovered" };
    }
    if (!node.neutralToAllFactions && node.factionAllowList.length > 0) {
      if (
        !traveler.factionId ||
        !node.factionAllowList.includes(traveler.factionId)
      ) {
        return { usable: false, reason: "faction-gate" };
      }
    }
    if (!this._unlockSatisfied(node, traveler)) {
      return { usable: false, reason: "unlock-gate" };
    }
    return { usable: true, reason: "ok" };
  }

  /**
   * Dijkstra shortest path by `travelTimeSec`. Returns null if no route
   * exists. Faction/world-state-gated edges for this traveler are
   * filtered out of the graph before the walk.
   */
  shortestPath(
    fromNodeId: string,
    toNodeId: string,
    traveler?: TravelerState,
  ): PathResult | null {
    this.getNode(fromNodeId);
    this.getNode(toNodeId);
    if (fromNodeId === toNodeId) {
      return { totalSec: 0, totalCost: 0, steps: [] };
    }

    const dist = new Map<string, number>();
    const prev = new Map<string, { edge: FastTravelEdge; from: string }>();
    dist.set(fromNodeId, 0);
    const remaining = new Set(this._nodesById.keys());

    while (remaining.size > 0) {
      // Pick the remaining node with the smallest distance.
      let current: string | null = null;
      let bestDist = Infinity;
      for (const id of remaining) {
        const d = dist.get(id) ?? Infinity;
        if (d < bestDist) {
          bestDist = d;
          current = id;
        }
      }
      if (current === null || bestDist === Infinity) break;
      remaining.delete(current);
      if (current === toNodeId) break;

      for (const neigh of this.neighbors(current)) {
        if (traveler && !this._edgePassable(neigh.edge, traveler)) continue;
        const tentative = bestDist + neigh.edge.travelTimeSec;
        const existing = dist.get(neigh.toNodeId) ?? Infinity;
        if (tentative < existing) {
          dist.set(neigh.toNodeId, tentative);
          prev.set(neigh.toNodeId, { edge: neigh.edge, from: current });
        }
      }
    }

    if (!dist.has(toNodeId)) return null;

    // Reconstruct path.
    const steps: PathStep[] = [];
    let cursor: string | null = toNodeId;
    let totalCost = 0;
    while (cursor && cursor !== fromNodeId) {
      const p = prev.get(cursor);
      if (!p) return null;
      const nodeCost =
        p.edge.travelCostCurrency > 0
          ? p.edge.travelCostCurrency
          : this.getNode(p.from).useCostCurrency;
      totalCost += nodeCost;
      steps.push({
        edgeId: p.edge.id,
        fromNodeId: p.from,
        toNodeId: cursor,
        travelTimeSec: p.edge.travelTimeSec,
        travelCostCurrency: nodeCost,
      });
      cursor = p.from;
    }
    steps.reverse();
    return {
      totalSec: dist.get(toNodeId) ?? 0,
      totalCost,
      steps,
    };
  }

  private _unlockSatisfied(
    node: FastTravelNode,
    traveler: TravelerState,
  ): boolean {
    const u = node.unlock;
    if (
      u.minCharacterLevel > 0 &&
      traveler.characterLevel < u.minCharacterLevel
    ) {
      return false;
    }
    if (u.requiresQuestId !== "") {
      if (!traveler.completedQuestIds?.has(u.requiresQuestId)) return false;
    }
    if (u.requiresAchievementId !== "") {
      if (!traveler.completedAchievementIds?.has(u.requiresAchievementId)) {
        return false;
      }
    }
    if (u.requiresReputation.factionId !== "") {
      const std =
        traveler.reputationStandings?.get(u.requiresReputation.factionId) ?? 0;
      if (std < u.requiresReputation.minStanding) return false;
    }
    return true;
  }

  private _edgePassable(e: FastTravelEdge, traveler: TravelerState): boolean {
    if (e.factionAllowList.length > 0) {
      if (
        !traveler.factionId ||
        !e.factionAllowList.includes(traveler.factionId)
      ) {
        return false;
      }
    }
    if (e.requiresWorldStateFlag !== "") {
      if (!traveler.worldStateFlags?.has(e.requiresWorldStateFlag)) {
        return false;
      }
    }
    return true;
  }

  private _require(): FastTravelManifest {
    if (!this._manifest) throw new Error("FastTravelGraph.load not called");
    return this._manifest;
  }
}

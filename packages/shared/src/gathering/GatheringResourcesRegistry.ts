/**
 * Gathering-resources registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s
 * `gathering-resources.ts`. Indexes the three sibling manifests
 * (woodcutting trees, mining rocks, fishing spots) by resource id
 * and provides harvest-skill / tool / level accessors so the
 * harvest pipeline can resolve the target resource without a
 * linear scan.
 *
 * Each sub-manifest is independent — callers can load trees
 * without rocks or vice versa. Accessors throw `UnknownResourceError`
 * for missing ids with the list of known siblings.
 */

import {
  type FishingManifest,
  FishingManifestSchema,
  type FishingSpot,
  type MiningManifest,
  MiningManifestSchema,
  type RockResource,
  type TreeResource,
  type WoodcuttingManifest,
  WoodcuttingManifestSchema,
} from "@hyperforge/manifest-schema";

export type HarvestSkill = "woodcutting" | "mining" | "fishing";

export class UnknownResourceError extends Error {
  readonly resourceId: string;
  readonly skill: HarvestSkill;
  constructor(skill: HarvestSkill, id: string, available: readonly string[]) {
    super(
      `${skill} resource "${id}" not found. Known: ${
        available.length > 0 ? available.join(", ") : "(none)"
      }`,
    );
    this.name = "UnknownResourceError";
    this.resourceId = id;
    this.skill = skill;
  }
}

/** Listener invoked after every successful load*() / load*FromJson(). */
export type GatheringResourcesReloadListener = () => void;

export class GatheringResourcesRegistry {
  private _trees = new Map<string, TreeResource>();
  private _rocks = new Map<string, RockResource>();
  private _spots = new Map<string, FishingSpot>();
  private _reloadListeners = new Set<GatheringResourcesReloadListener>();

  loadWoodcutting(manifest: WoodcuttingManifest): void {
    this._trees.clear();
    for (const t of manifest.trees) this._trees.set(t.id, t);
    this._emitReloaded();
  }
  loadMining(manifest: MiningManifest): void {
    this._rocks.clear();
    for (const r of manifest.rocks) this._rocks.set(r.id, r);
    this._emitReloaded();
  }
  loadFishing(manifest: FishingManifest): void {
    this._spots.clear();
    for (const s of manifest.spots) this._spots.set(s.id, s);
    this._emitReloaded();
  }

  /**
   * Subscribe to reload notifications. Returns unsubscribe.
   * Listener throws are caught + logged. Pattern matches
   * `SkillIconsRegistry.onReloaded`. Fires on any of the three
   * load* methods (woodcutting / mining / fishing).
   */
  onReloaded(cb: GatheringResourcesReloadListener): () => void {
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
          "[gatheringResourcesRegistry] reload listener threw:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  loadWoodcuttingFromJson(raw: unknown): void {
    this.loadWoodcutting(WoodcuttingManifestSchema.parse(raw));
  }
  loadMiningFromJson(raw: unknown): void {
    this.loadMining(MiningManifestSchema.parse(raw));
  }
  loadFishingFromJson(raw: unknown): void {
    this.loadFishing(FishingManifestSchema.parse(raw));
  }

  get trees(): readonly TreeResource[] {
    return Array.from(this._trees.values());
  }
  get rocks(): readonly RockResource[] {
    return Array.from(this._rocks.values());
  }
  get fishingSpots(): readonly FishingSpot[] {
    return Array.from(this._spots.values());
  }

  hasTree(id: string): boolean {
    return this._trees.has(id);
  }
  hasRock(id: string): boolean {
    return this._rocks.has(id);
  }
  hasFishingSpot(id: string): boolean {
    return this._spots.has(id);
  }

  tree(id: string): TreeResource {
    const t = this._trees.get(id);
    if (!t) {
      throw new UnknownResourceError(
        "woodcutting",
        id,
        Array.from(this._trees.keys()),
      );
    }
    return t;
  }
  rock(id: string): RockResource {
    const r = this._rocks.get(id);
    if (!r) {
      throw new UnknownResourceError(
        "mining",
        id,
        Array.from(this._rocks.keys()),
      );
    }
    return r;
  }
  fishingSpot(id: string): FishingSpot {
    const s = this._spots.get(id);
    if (!s) {
      throw new UnknownResourceError(
        "fishing",
        id,
        Array.from(this._spots.keys()),
      );
    }
    return s;
  }

  /**
   * Look up a resource by id across all three skills. Returns `null` if
   * the id is unknown. Prefer this over the per-skill throwing accessors
   * when the caller does not already know which skill the id belongs to
   * (e.g., generic "examine" text or a raycast-target handler).
   */
  findResource(id: string): TreeResource | RockResource | FishingSpot | null {
    return (
      this._trees.get(id) ?? this._rocks.get(id) ?? this._spots.get(id) ?? null
    );
  }

  /** All resources requiring a given tool id across all skills. */
  requiringTool(
    toolId: string,
  ): Array<TreeResource | RockResource | FishingSpot> {
    const out: Array<TreeResource | RockResource | FishingSpot> = [];
    for (const t of this._trees.values()) {
      if (t.toolRequired === toolId) out.push(t);
    }
    for (const r of this._rocks.values()) {
      if (r.toolRequired === toolId) out.push(r);
    }
    for (const s of this._spots.values()) {
      if (s.toolRequired === toolId) out.push(s);
    }
    return out;
  }
}

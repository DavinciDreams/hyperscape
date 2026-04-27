/**
 * Item-set registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `item-sets.ts`.
 * Pure logic: reverse-lookup from item id to owning set(s), stage
 * resolution given equipped counts, stat delta aggregation, and
 * triggered-effect lookup. Runtime `ItemSetSystem` owns per-player
 * equipped-piece tracking and event-bus binding.
 */

import {
  type ItemSet,
  type ItemSetCategory,
  type ItemSetStage,
  type ItemSetStatModifier,
  type ItemSetTriggeredEffect,
  type ItemSetsManifest,
  ItemSetsManifestSchema,
} from "@hyperforge/manifest-schema";

export class UnknownItemSetError extends Error {
  readonly setId: string;
  readonly availableIds: readonly string[];
  constructor(id: string, availableIds: readonly string[]) {
    super(
      `item-set "${id}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownItemSetError";
    this.setId = id;
    this.availableIds = availableIds;
  }
}

/** Aggregated bonuses active at a given equipped-piece count. */
export interface ActiveSetBonuses {
  setId: string;
  equippedCount: number;
  unlockedStages: readonly ItemSetStage[];
  statModifiers: readonly ItemSetStatModifier[];
  triggeredEffects: readonly ItemSetTriggeredEffect[];
}

/** Listener invoked after every successful `load()` / `loadFromJson()`. */
export type ItemSetReloadListener = () => void;

export class ItemSetRegistry {
  private _byId = new Map<string, ItemSet>();
  /** Reverse index: item id → set ids that include it. */
  private _itemToSets = new Map<string, string[]>();
  private _loaded = false;
  private _reloadListeners = new Set<ItemSetReloadListener>();

  constructor(manifest?: ItemSetsManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: ItemSetsManifest): void {
    this._byId.clear();
    this._itemToSets.clear();
    for (const s of manifest) {
      this._byId.set(s.id, s);
      for (const itemId of s.memberItemIds) {
        const arr = this._itemToSets.get(itemId);
        if (arr) arr.push(s.id);
        else this._itemToSets.set(itemId, [s.id]);
      }
    }
    this._loaded = true;
    this._emitReloaded();
  }

  /**
   * Subscribe to reload notifications. Returns unsubscribe.
   * Listener throws are caught + logged. Pattern matches
   * `SkillIconsRegistry.onReloaded`.
   */
  onReloaded(cb: ItemSetReloadListener): () => void {
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
          "[itemSetRegistry] reload listener threw:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  isLoaded(): boolean {
    return this._loaded;
  }

  loadFromJson(raw: unknown): void {
    this.load(ItemSetsManifestSchema.parse(raw));
  }

  get size(): number {
    return this._byId.size;
  }

  has(id: string): boolean {
    return this._byId.has(id);
  }

  get(id: string): ItemSet {
    const s = this._byId.get(id);
    if (!s) {
      throw new UnknownItemSetError(id, Array.from(this._byId.keys()));
    }
    return s;
  }

  ids(): string[] {
    return Array.from(this._byId.keys());
  }

  byCategory(category: ItemSetCategory): ItemSet[] {
    return Array.from(this._byId.values()).filter(
      (s) => s.category === category,
    );
  }

  /** Set ids that include the given item. Empty if item is in no sets. */
  setsContainingItem(itemId: string): readonly string[] {
    return this._itemToSets.get(itemId) ?? [];
  }

  /**
   * Given the equipped item ids, produce per-set aggregated bonuses.
   * Only sets with at least one equipped piece are included.
   */
  resolveBonuses(equippedItemIds: readonly string[]): ActiveSetBonuses[] {
    // Count pieces per set.
    const counts = new Map<string, number>();
    for (const itemId of equippedItemIds) {
      const sets = this._itemToSets.get(itemId);
      if (!sets) continue;
      for (const sid of sets) {
        counts.set(sid, (counts.get(sid) ?? 0) + 1);
      }
    }
    const out: ActiveSetBonuses[] = [];
    for (const [setId, equippedCount] of counts) {
      const set = this._byId.get(setId);
      if (!set) continue;
      const unlockedStages = set.stages.filter(
        (s) => equippedCount >= s.requiredPieces,
      );
      const statModifiers: ItemSetStatModifier[] = [];
      const triggeredEffects: ItemSetTriggeredEffect[] = [];
      for (const stage of unlockedStages) {
        for (const m of stage.statModifiers) statModifiers.push(m);
        for (const e of stage.triggeredEffects) triggeredEffects.push(e);
      }
      out.push({
        setId,
        equippedCount,
        unlockedStages,
        statModifiers,
        triggeredEffects,
      });
    }
    return out;
  }

  /** Next stage not yet unlocked, given equipped-piece count. */
  nextStage(setId: string, equippedCount: number): ItemSetStage | null {
    const s = this.get(setId);
    for (const stage of s.stages) {
      if (stage.requiredPieces > equippedCount) return stage;
    }
    return null;
  }
}

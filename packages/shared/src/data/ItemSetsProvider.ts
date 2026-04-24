/**
 * ItemSetsProvider
 *
 * Singleton persistence layer for the authored item-sets
 * manifest — array of set definitions (6-category raid/dungeon/
 * crafted/world/pvp/legacy) with tiered incremental stages
 * (2pc/4pc/6pc...), 20-stat enum shared with enchantments.ts,
 * add/multiply modifier ops (multiply>0 refinement), triggered
 * effects with chance/cooldown/status-effect/damage/heal.
 *
 * Refinements: reachable-requiredPieces + strictly-monotonic
 * stages + globally-unique triggered-effect ids across the
 * whole set + each stage has at least one effect payload.
 *
 * Array-shape manifest (not object-shape) — empty `[]`
 * baseline keeps the pipeline inert until sets are authored.
 *
 * Runtime ItemSetSystem not yet shipped.
 */

import {
  ItemSetsManifestSchema,
  type ItemSetsManifest,
} from "@hyperforge/manifest-schema";

class ItemSetsProvider {
  private static _instance: ItemSetsProvider | null = null;
  private _manifest: ItemSetsManifest | null = null;

  public static getInstance(): ItemSetsProvider {
    if (!ItemSetsProvider._instance) {
      ItemSetsProvider._instance = new ItemSetsProvider();
    }
    return ItemSetsProvider._instance;
  }

  public load(manifest: ItemSetsManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): ItemSetsManifest {
    const parsed = ItemSetsManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: ItemSetsManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): ItemSetsManifest | null {
    return this._manifest;
  }
}

export { ItemSetsProvider };
export const itemSetsProvider = ItemSetsProvider.getInstance();

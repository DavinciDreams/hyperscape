/**
 * Stores registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `stores.ts`.
 * Indexes stores by id and supports per-store item lookup + buyback
 * price resolution against the global commerce defaults.
 */

import {
  type Store,
  type StoreItem,
  type StoresManifest,
  StoresManifestSchema,
} from "@hyperforge/manifest-schema";

export class StoresNotLoadedError extends Error {
  constructor() {
    super("StoresRegistry used before load()");
    this.name = "StoresNotLoadedError";
  }
}

export class UnknownStoreError extends Error {
  readonly storeId: string;
  readonly availableIds: readonly string[];
  constructor(id: string, availableIds: readonly string[]) {
    super(
      `store "${id}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownStoreError";
    this.storeId = id;
    this.availableIds = availableIds;
  }
}

export class UnknownStoreItemError extends Error {
  readonly storeId: string;
  readonly entryId: string;
  constructor(storeId: string, entryId: string, availableIds: string[]) {
    super(
      `store "${storeId}" has no item "${entryId}". Known: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none)"
      }`,
    );
    this.name = "UnknownStoreItemError";
    this.storeId = storeId;
    this.entryId = entryId;
  }
}

/** Listener invoked after every successful `load()` / `loadFromJson()`. */
export type StoresReloadListener = () => void;

export class StoresRegistry {
  private _manifest: StoresManifest | null = null;
  private _byId = new Map<string, Store>();
  private _itemsByStore = new Map<string, Map<string, StoreItem>>();
  private _reloadListeners = new Set<StoresReloadListener>();

  constructor(manifest?: StoresManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: StoresManifest): void {
    this._manifest = manifest;
    this._byId.clear();
    this._itemsByStore.clear();
    for (const s of manifest) {
      this._byId.set(s.id, s);
      const m = new Map<string, StoreItem>();
      for (const it of s.items) m.set(it.id, it);
      this._itemsByStore.set(s.id, m);
    }
    this._emitReloaded();
  }

  loadFromJson(raw: unknown): void {
    this.load(StoresManifestSchema.parse(raw));
  }

  /**
   * Subscribe to reload notifications. Returns unsubscribe.
   * Listener throws are caught + logged. Pattern matches
   * `SkillIconsRegistry.onReloaded`.
   */
  onReloaded(cb: StoresReloadListener): () => void {
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
          "[storesRegistry] reload listener threw:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  isLoaded(): boolean {
    return this._manifest !== null;
  }

  /**
   * Test-only reset back to the unloaded state. Mirrors the
   * `WorldAreasRegistry._unloadForTests` / `NPCSizesRegistry._unloadForTests`
   * pattern — the module-level singleton needs a way to clear state
   * between integration tests that exercise the registry-prefer-fallback
   * branch in consumer systems. Don't call from production code.
   */
  _unloadForTests(): void {
    this._manifest = null;
    this._byId.clear();
    this._itemsByStore.clear();
  }

  /**
   * All loaded stores in manifest order. Companion to `ids` for
   * consumers that need the full store records (StoreSystem.init,
   * vendor-list UI, etc.) without doing N×`get(id)` calls.
   */
  all(): readonly Store[] {
    return Array.from(this._byId.values());
  }

  get manifest(): StoresManifest {
    if (!this._manifest) throw new StoresNotLoadedError();
    return this._manifest;
  }

  get ids(): string[] {
    return Array.from(this._byId.keys());
  }

  has(id: string): boolean {
    return this._byId.has(id);
  }

  get(id: string): Store {
    const s = this._byId.get(id);
    if (!s) throw new UnknownStoreError(id, this.ids);
    return s;
  }

  items(storeId: string): readonly StoreItem[] {
    return this.get(storeId).items;
  }

  item(storeId: string, entryId: string): StoreItem {
    const m = this._itemsByStore.get(storeId);
    if (!m) throw new UnknownStoreError(storeId, this.ids);
    const item = m.get(entryId);
    if (!item) {
      throw new UnknownStoreItemError(storeId, entryId, Array.from(m.keys()));
    }
    return item;
  }

  isUnlimitedStock(entry: StoreItem): boolean {
    return entry.stockQuantity === -1;
  }

  /**
   * Resolve the buyback price the store will pay for an item worth
   * `itemValue`. `fallbackRate` is used when the store enables buyback
   * but doesn't declare its own rate (runtime defaults to commerce
   * manifest's `defaultBuybackRate`).
   */
  buybackPrice(
    storeId: string,
    itemValue: number,
    fallbackRate: number,
  ): number {
    const s = this.get(storeId);
    if (!s.buyback) return 0;
    if (itemValue <= 0) return 0;
    const rate = s.buybackRate ?? fallbackRate;
    return Math.floor(itemValue * rate);
  }
}

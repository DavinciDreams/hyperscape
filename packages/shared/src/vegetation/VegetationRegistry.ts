/**
 * Vegetation registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `vegetation.ts`.
 * Indexes vegetation assets by id and category, and supports weighted
 * sampling by category for procgen scatter placement.
 */

import {
  type VegetationAsset,
  type VegetationManifest,
  VegetationManifestSchema,
} from "@hyperforge/manifest-schema";

export class VegetationNotLoadedError extends Error {
  constructor() {
    super("VegetationRegistry used before load()");
    this.name = "VegetationNotLoadedError";
  }
}

export class UnknownVegetationAssetError extends Error {
  readonly assetId: string;
  readonly availableIds: readonly string[];
  constructor(id: string, availableIds: readonly string[]) {
    super(
      `vegetation asset "${id}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownVegetationAssetError";
    this.assetId = id;
    this.availableIds = availableIds;
  }
}

/** Listener invoked after every successful `load()` / `loadFromJson()`. */
export type VegetationReloadListener = () => void;

export class VegetationRegistry {
  private _manifest: VegetationManifest | null = null;
  private _byId = new Map<string, VegetationAsset>();
  private _byCategory = new Map<string, VegetationAsset[]>();
  private _reloadListeners = new Set<VegetationReloadListener>();

  constructor(manifest?: VegetationManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: VegetationManifest): void {
    this._manifest = manifest;
    this._byId.clear();
    this._byCategory.clear();
    for (const asset of manifest.assets) {
      this._byId.set(asset.id, asset);
      const arr = this._byCategory.get(asset.category);
      if (arr) arr.push(asset);
      else this._byCategory.set(asset.category, [asset]);
    }
    this._emitReloaded();
  }

  loadFromJson(raw: unknown): void {
    this.load(VegetationManifestSchema.parse(raw));
  }

  /**
   * Subscribe to reload notifications. Returns unsubscribe.
   * Listener throws are caught + logged. Pattern matches
   * `SkillIconsRegistry.onReloaded`.
   */
  onReloaded(cb: VegetationReloadListener): () => void {
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
          "[vegetationRegistry] reload listener threw:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  isLoaded(): boolean {
    return this._manifest !== null;
  }

  get manifest(): VegetationManifest {
    if (!this._manifest) throw new VegetationNotLoadedError();
    return this._manifest;
  }

  get ids(): string[] {
    return Array.from(this._byId.keys());
  }

  has(id: string): boolean {
    return this._byId.has(id);
  }

  get(id: string): VegetationAsset {
    const a = this._byId.get(id);
    if (!a) throw new UnknownVegetationAssetError(id, this.ids);
    return a;
  }

  categories(): string[] {
    return Array.from(this._byCategory.keys());
  }

  forCategory(category: string): readonly VegetationAsset[] {
    return this._byCategory.get(category) ?? [];
  }

  /**
   * Pick a vegetation asset from `category` by `weight`. Deterministic
   * when `rand` is supplied; defaults to Math.random. Returns
   * `undefined` when the category has no assets.
   */
  pickByWeight(
    category: string,
    rand: () => number = Math.random,
  ): VegetationAsset | undefined {
    const pool = this.forCategory(category);
    if (pool.length === 0) return undefined;
    const total = pool.reduce((acc, a) => acc + a.weight, 0);
    if (total <= 0) return pool[0];
    const roll = rand() * total;
    let running = 0;
    for (const a of pool) {
      running += a.weight;
      if (roll < running) return a;
    }
    return pool[pool.length - 1];
  }
}

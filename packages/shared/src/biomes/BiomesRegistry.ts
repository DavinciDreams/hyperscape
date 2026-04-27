/**
 * Biomes registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `biomes.ts`.
 * Indexes biomes by id and supports difficulty-level filtering +
 * height-range lookup for procgen terrain classification.
 */

import {
  type Biome,
  type BiomesManifest,
  BiomesManifestSchema,
} from "@hyperforge/manifest-schema";

export class BiomesNotLoadedError extends Error {
  constructor() {
    super("BiomesRegistry used before load()");
    this.name = "BiomesNotLoadedError";
  }
}

export class UnknownBiomeError extends Error {
  readonly biomeId: string;
  readonly availableIds: readonly string[];
  constructor(id: string, availableIds: readonly string[]) {
    super(
      `biome "${id}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownBiomeError";
    this.biomeId = id;
    this.availableIds = availableIds;
  }
}

/** Listener invoked after every successful `load()` / `loadFromJson()`. */
export type BiomesReloadListener = () => void;

export class BiomesRegistry {
  private _manifest: BiomesManifest | null = null;
  private _byId = new Map<string, Biome>();
  private _reloadListeners = new Set<BiomesReloadListener>();

  constructor(manifest?: BiomesManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: BiomesManifest): void {
    this._manifest = manifest;
    this._byId.clear();
    for (const b of manifest) this._byId.set(b.id, b);
    this._emitReloaded();
  }

  loadFromJson(raw: unknown): void {
    this.load(BiomesManifestSchema.parse(raw));
  }

  /**
   * Subscribe to reload notifications. Returns unsubscribe.
   * Listener throws are caught + logged. Pattern matches
   * `SkillIconsRegistry.onReloaded`.
   */
  onReloaded(cb: BiomesReloadListener): () => void {
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
          "[biomesRegistry] reload listener threw:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  isLoaded(): boolean {
    return this._manifest !== null;
  }

  get manifest(): BiomesManifest {
    if (!this._manifest) throw new BiomesNotLoadedError();
    return this._manifest;
  }

  get ids(): string[] {
    return Array.from(this._byId.keys());
  }

  has(id: string): boolean {
    return this._byId.has(id);
  }

  get(id: string): Biome {
    const b = this._byId.get(id);
    if (!b) throw new UnknownBiomeError(id, this.ids);
    return b;
  }

  all(): readonly Biome[] {
    return this.manifest;
  }

  /** Biomes whose difficultyLevel falls within [minLevel, maxLevel]. */
  atDifficultyRange(minLevel: number, maxLevel: number): Biome[] {
    return this.manifest.filter(
      (b) => b.difficultyLevel >= minLevel && b.difficultyLevel <= maxLevel,
    );
  }

  /** First biome whose heightRange contains `height`; undefined if none. */
  biomeAtHeight(height: number): Biome | undefined {
    return this.manifest.find(
      (b) => height >= b.heightRange[0] && height <= b.heightRange[1],
    );
  }
}

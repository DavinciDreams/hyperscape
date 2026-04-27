/**
 * LOD-settings registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s
 * `lod-settings.ts`. Resolves per-category distance thresholds with
 * a guaranteed `"default"` fallback when a category is missing.
 */

import {
  type LODDissolve,
  type LODSettingsManifest,
  LODSettingsManifestSchema,
  type LODThreshold,
} from "@hyperforge/manifest-schema";

export class LODSettingsNotLoadedError extends Error {
  constructor() {
    super("LODSettingsRegistry used before load()");
    this.name = "LODSettingsNotLoadedError";
  }
}

export class LODSettingsMissingDefaultError extends Error {
  constructor() {
    super(
      "LOD settings manifest has no `default` threshold entry — required as fallback",
    );
    this.name = "LODSettingsMissingDefaultError";
  }
}

/** Listener invoked after every successful `load()` / `loadFromJson()`. */
export type LODSettingsReloadListener = () => void;

export class LODSettingsRegistry {
  private _manifest: LODSettingsManifest | null = null;
  private _reloadListeners = new Set<LODSettingsReloadListener>();

  constructor(manifest?: LODSettingsManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: LODSettingsManifest): void {
    this._manifest = manifest;
    this._emitReloaded();
  }

  loadFromJson(raw: unknown): void {
    this.load(LODSettingsManifestSchema.parse(raw));
  }

  /**
   * Subscribe to reload notifications. Returns unsubscribe.
   * Listener throws are caught + logged. Pattern matches
   * `SkillIconsRegistry.onReloaded`.
   */
  onReloaded(cb: LODSettingsReloadListener): () => void {
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
          "[lodSettingsRegistry] reload listener threw:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  isLoaded(): boolean {
    return this._manifest !== null;
  }

  get manifest(): LODSettingsManifest {
    if (!this._manifest) throw new LODSettingsNotLoadedError();
    return this._manifest;
  }

  get dissolve(): LODDissolve {
    return this.manifest.dissolve;
  }

  categories(): string[] {
    return Object.keys(this.manifest.distanceThresholds);
  }

  hasCategory(category: string): boolean {
    return Object.prototype.hasOwnProperty.call(
      this.manifest.distanceThresholds,
      category,
    );
  }

  /**
   * Threshold for a category, falling back to the `"default"` entry.
   * Throws if neither the requested category nor `"default"` exists.
   */
  thresholdFor(category: string): LODThreshold {
    const direct = this.manifest.distanceThresholds[category];
    if (direct) return direct;
    const def = this.manifest.distanceThresholds["default"];
    if (!def) throw new LODSettingsMissingDefaultError();
    return def;
  }

  /**
   * Classify an object's current distance against the threshold
   * ladder for a category.
   */
  levelForDistance(
    category: string,
    distance: number,
  ): "lod0" | "lod1" | "imposter" | "culled" {
    const t = this.thresholdFor(category);
    if (distance >= t.fadeOut) return "culled";
    if (distance >= t.imposter) return "imposter";
    if (distance >= t.lod1) return "lod1";
    return "lod0";
  }
}

/**
 * Lighting bake registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `lighting-bake.ts`.
 * Indexes lightprobe volumes by id, per-sublevel bake overrides by
 * `sublevelId`, and surfaces `effectiveBakeFor(sublevelId)` which merges
 * manifest defaults with any matching override.
 */

import {
  type LevelBakeOverride,
  type LightingBakeManifest,
  LightingBakeManifestSchema,
  type LightprobeVolume,
} from "@hyperforge/manifest-schema";

export class LightingBakeNotLoadedError extends Error {
  constructor() {
    super("LightingBakeRegistry used before load()");
    this.name = "LightingBakeNotLoadedError";
  }
}

export interface EffectiveBakeSettings {
  quality: LightingBakeManifest["quality"];
  lightmapResolutionTexelsPerMeter: number;
  ao: LightingBakeManifest["ao"];
  gi: LightingBakeManifest["gi"];
}

/** Listener invoked after every successful `load()` / `loadFromJson()`. */
export type LightingBakeReloadListener = () => void;

export class LightingBakeRegistry {
  private _manifest: LightingBakeManifest | null = null;
  private _volumesById = new Map<string, LightprobeVolume>();
  private _overridesBySublevel = new Map<string, LevelBakeOverride>();
  private _reloadListeners = new Set<LightingBakeReloadListener>();

  constructor(manifest?: LightingBakeManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: LightingBakeManifest): void {
    this._manifest = manifest;
    this._volumesById.clear();
    this._overridesBySublevel.clear();
    for (const v of manifest.lightprobeVolumes) this._volumesById.set(v.id, v);
    for (const o of manifest.levelOverrides) {
      this._overridesBySublevel.set(o.sublevelId, o);
    }
    this._emitReloaded();
  }

  /**
   * Subscribe to reload notifications. Returns unsubscribe.
   * Listener throws are caught + logged. Pattern matches
   * `SkillIconsRegistry.onReloaded`.
   */
  onReloaded(cb: LightingBakeReloadListener): () => void {
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
          "[lightingBakeRegistry] reload listener threw:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  loadFromJson(raw: unknown): void {
    this.load(LightingBakeManifestSchema.parse(raw));
  }

  get manifest(): LightingBakeManifest {
    if (!this._manifest) throw new LightingBakeNotLoadedError();
    return this._manifest;
  }

  isLoaded(): boolean {
    return this._manifest !== null;
  }

  get skipBake(): boolean {
    return this.manifest.skipBake;
  }

  get quality() {
    return this.manifest.quality;
  }

  get lightprobeVolumes(): readonly LightprobeVolume[] {
    return this.manifest.lightprobeVolumes;
  }

  lightprobeVolume(id: string): LightprobeVolume | undefined {
    return this._volumesById.get(id);
  }

  overrideFor(sublevelId: string): LevelBakeOverride | undefined {
    return this._overridesBySublevel.get(sublevelId);
  }

  /**
   * Effective bake settings for a sublevel: manifest defaults, with any
   * per-sublevel override fields layered on top.
   */
  effectiveBakeFor(sublevelId: string): EffectiveBakeSettings {
    const m = this.manifest;
    const o = this._overridesBySublevel.get(sublevelId);
    return {
      quality: o?.quality ?? m.quality,
      lightmapResolutionTexelsPerMeter:
        o?.lightmapResolutionTexelsPerMeter ??
        m.lightmapResolutionTexelsPerMeter,
      ao: o?.ao ?? m.ao,
      gi: o?.gi ?? m.gi,
    };
  }
}

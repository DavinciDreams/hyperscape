/**
 * Processing registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `processing.ts`.
 * Wraps the processing-skill constants (firemaking/cooking mechanics,
 * fire properties, walk-priority sequence) behind typed accessors.
 */

import {
  type CookingMechanics,
  type FireProperties,
  type FireWalkDirection,
  type FiremakingMechanics,
  type FiremakingSuccessRate,
  type ProcessingManifest,
  ProcessingManifestSchema,
} from "@hyperforge/manifest-schema";

export class ProcessingNotLoadedError extends Error {
  constructor() {
    super("ProcessingRegistry used before load()");
    this.name = "ProcessingNotLoadedError";
  }
}

/** Listener invoked after every successful `load()` / `loadFromJson()`. */
export type ProcessingReloadListener = () => void;

export class ProcessingRegistry {
  private _manifest: ProcessingManifest | null = null;
  private _reloadListeners = new Set<ProcessingReloadListener>();

  constructor(manifest?: ProcessingManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: ProcessingManifest): void {
    this._manifest = manifest;
    this._emitReloaded();
  }

  loadFromJson(raw: unknown): void {
    this.load(ProcessingManifestSchema.parse(raw));
  }

  /**
   * Subscribe to reload notifications. Returns unsubscribe.
   * Listener throws are caught + logged. Pattern matches
   * `SkillIconsRegistry.onReloaded`.
   */
  onReloaded(cb: ProcessingReloadListener): () => void {
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
          "[processingRegistry] reload listener threw:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  isLoaded(): boolean {
    return this._manifest !== null;
  }

  get manifest(): ProcessingManifest {
    if (!this._manifest) throw new ProcessingNotLoadedError();
    return this._manifest;
  }

  get firemaking(): FiremakingMechanics {
    return this.manifest.skillMechanics.firemaking;
  }

  get cooking(): CookingMechanics {
    return this.manifest.skillMechanics.cooking;
  }

  get firemakingSuccessRate(): FiremakingSuccessRate {
    return this.manifest.firemakingSuccessRate;
  }

  get fire(): FireProperties {
    return this.manifest.fire;
  }

  get fireWalkPriority(): readonly FireWalkDirection[] {
    return this.manifest.fireWalkPriority;
  }

  get rateLimitMs(): number {
    return this.manifest.timing.rateLimitMs;
  }

  get minimumCycleTicks(): number {
    return this.manifest.timing.minimumCycleTicks;
  }
}

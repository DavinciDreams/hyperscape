/**
 * Spell-visuals registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s
 * `spell-visuals.ts`. Resolves per-spell and per-arrow projectile
 * visual configs with an explicit fallback contract:
 *   - `spellVisual(id)` → config, falling back to `fallbackSpell`
 *   - `arrowVisual(id)` → config, falling back to the guaranteed
 *     `"default"` entry
 */

import {
  type ArrowVisualConfig,
  type SpellVisualConfig,
  type SpellVisualsManifest,
  SpellVisualsManifestSchema,
} from "@hyperforge/manifest-schema";

export class SpellVisualsNotLoadedError extends Error {
  constructor() {
    super("SpellVisualsRegistry used before load()");
    this.name = "SpellVisualsNotLoadedError";
  }
}

/** Listener invoked after every successful `load()` / `loadFromJson()`. */
export type SpellVisualsReloadListener = () => void;

export class SpellVisualsRegistry {
  private _manifest: SpellVisualsManifest | null = null;
  private _reloadListeners = new Set<SpellVisualsReloadListener>();

  constructor(manifest?: SpellVisualsManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: SpellVisualsManifest): void {
    this._manifest = manifest;
    this._emitReloaded();
  }

  loadFromJson(raw: unknown): void {
    this.load(SpellVisualsManifestSchema.parse(raw));
  }

  /**
   * Subscribe to reload notifications. Returns unsubscribe.
   * Listener throws are caught + logged. Pattern matches
   * `SkillIconsRegistry.onReloaded`.
   */
  onReloaded(cb: SpellVisualsReloadListener): () => void {
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
          "[spellVisualsRegistry] reload listener threw:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  isLoaded(): boolean {
    return this._manifest !== null;
  }

  get manifest(): SpellVisualsManifest {
    if (!this._manifest) throw new SpellVisualsNotLoadedError();
    return this._manifest;
  }

  hasSpell(id: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.manifest.spells, id);
  }

  hasArrow(id: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.manifest.arrows, id);
  }

  /** Resolve a spell's visual config, falling back to the fallbackSpell entry. */
  spellVisual(id: string): SpellVisualConfig {
    const cfg = this.manifest.spells[id];
    return cfg ?? this.manifest.fallbackSpell;
  }

  /**
   * Resolve an arrow's visual config, falling back to the `"default"`
   * entry (schema guarantees its presence).
   */
  arrowVisual(id: string): ArrowVisualConfig {
    const cfg = this.manifest.arrows[id];
    if (cfg) return cfg;
    const def = this.manifest.arrows["default"];
    // Schema refinement guarantees the default entry exists.
    return def as ArrowVisualConfig;
  }

  get spellIds(): string[] {
    return Object.keys(this.manifest.spells);
  }

  get arrowIds(): string[] {
    return Object.keys(this.manifest.arrows);
  }
}

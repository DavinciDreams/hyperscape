/**
 * StatusEffectsProvider
 *
 * Singleton persistence layer for the authored status-effects
 * manifest — buffs, debuffs, neutral effects, their stat
 * modifiers, stack rules, per-tick damage/heal, and VFX/SFX hooks.
 *
 * Runtime `StatusEffectSystem` (not yet wired) will pull on world
 * construction and drive the live effect stack.
 */

import {
  StatusEffectsManifestSchema,
  type StatusEffectsManifest,
} from "@hyperforge/manifest-schema";

class StatusEffectsProvider {
  private static _instance: StatusEffectsProvider | null = null;
  private _manifest: StatusEffectsManifest | null = null;

  public static getInstance(): StatusEffectsProvider {
    if (!StatusEffectsProvider._instance) {
      StatusEffectsProvider._instance = new StatusEffectsProvider();
    }
    return StatusEffectsProvider._instance;
  }

  /** Install an already-validated manifest. */
  public load(manifest: StatusEffectsManifest): void {
    this._manifest = manifest;
  }

  /** Validate and install a raw JSON-parsed payload. */
  public loadRaw(raw: unknown): StatusEffectsManifest {
    const parsed = StatusEffectsManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  /** Detach the authored manifest. `isLoaded()` becomes false. */
  public unload(): void {
    this._manifest = null;
  }

  /** Hot-reload entry point. `null` clears the authored manifest. */
  public hotReload(manifest: StatusEffectsManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  /** Array of effects, or `[]` when unloaded. */
  public getEffects(): StatusEffectsManifest {
    return this._manifest ?? [];
  }

  public getManifest(): StatusEffectsManifest | null {
    return this._manifest;
  }
}

export { StatusEffectsProvider };
export const statusEffectsProvider = StatusEffectsProvider.getInstance();

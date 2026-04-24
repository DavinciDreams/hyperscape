/**
 * SpellVisualsProvider
 *
 * Singleton persistence layer for the authored spell-visuals
 * manifest — projectile visual parameters (color, size, glow, trail,
 * pulse) keyed by spell id, plus per-arrow visual configs and a
 * fallback spell visual.
 *
 * No safe baseline — `arrows` record must include a `"default"`
 * fallback entry and `fallbackSpell` is required. Runtime falls back
 * to legacy hardcoded projectile visuals when provider is unloaded.
 */

import {
  SpellVisualsManifestSchema,
  type SpellVisualsManifest,
} from "@hyperforge/manifest-schema";

class SpellVisualsProvider {
  private static _instance: SpellVisualsProvider | null = null;
  private _manifest: SpellVisualsManifest | null = null;

  public static getInstance(): SpellVisualsProvider {
    if (!SpellVisualsProvider._instance) {
      SpellVisualsProvider._instance = new SpellVisualsProvider();
    }
    return SpellVisualsProvider._instance;
  }

  public load(manifest: SpellVisualsManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): SpellVisualsManifest {
    const parsed = SpellVisualsManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: SpellVisualsManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): SpellVisualsManifest | null {
    return this._manifest;
  }
}

export { SpellVisualsProvider };
export const spellVisualsProvider = SpellVisualsProvider.getInstance();

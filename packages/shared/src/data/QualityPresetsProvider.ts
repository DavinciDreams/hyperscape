/**
 * QualityPresetsProvider
 *
 * Singleton persistence layer for the authored quality-presets
 * manifest — ordered list of preset tiers (low/medium/high/ultra)
 * each carrying shadow resolution, reflection quality, post-process
 * passes, etc. Refinements: unique preset ids + at least one preset.
 *
 * No baseline fixture — empty preset list is schema-invalid. The
 * provider stays unloaded if the manifest is absent and runtime
 * quality selection must fall back to built-in defaults.
 *
 * Runtime QualityPresetSystem not yet shipped.
 */

import {
  QualityPresetsManifestSchema,
  type QualityPresetsManifest,
} from "@hyperforge/manifest-schema";

class QualityPresetsProvider {
  private static _instance: QualityPresetsProvider | null = null;
  private _manifest: QualityPresetsManifest | null = null;

  public static getInstance(): QualityPresetsProvider {
    if (!QualityPresetsProvider._instance) {
      QualityPresetsProvider._instance = new QualityPresetsProvider();
    }
    return QualityPresetsProvider._instance;
  }

  public load(manifest: QualityPresetsManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): QualityPresetsManifest {
    const parsed = QualityPresetsManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: QualityPresetsManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): QualityPresetsManifest | null {
    return this._manifest;
  }
}

export { QualityPresetsProvider };
export const qualityPresetsProvider = QualityPresetsProvider.getInstance();

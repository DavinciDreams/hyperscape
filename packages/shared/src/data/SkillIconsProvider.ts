/**
 * SkillIconsProvider
 *
 * Singleton persistence layer for the authored skill-icons manifest —
 * UI skill definitions (label/icon/category/defaultLevel) plus the
 * emoji lookup table keyed by lowercase skill name.
 *
 * No safe baseline — `SkillIconsManifestSchema` requires at least one
 * definition plus a fallbackIcon. Runtime falls back to legacy
 * hardcoded skill icons when provider is unloaded.
 */

import {
  SkillIconsManifestSchema,
  type SkillIconsManifest,
} from "@hyperforge/manifest-schema";

class SkillIconsProvider {
  private static _instance: SkillIconsProvider | null = null;
  private _manifest: SkillIconsManifest | null = null;

  public static getInstance(): SkillIconsProvider {
    if (!SkillIconsProvider._instance) {
      SkillIconsProvider._instance = new SkillIconsProvider();
    }
    return SkillIconsProvider._instance;
  }

  public load(manifest: SkillIconsManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): SkillIconsManifest {
    const parsed = SkillIconsManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: SkillIconsManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): SkillIconsManifest | null {
    return this._manifest;
  }
}

export { SkillIconsProvider };
export const skillIconsProvider = SkillIconsProvider.getInstance();

/**
 * SkillUnlocksProvider
 *
 * Singleton persistence layer for the authored skill-unlocks
 * manifest — tile-based-MMORPG-style content unlock arrays keyed by skill name,
 * displayed in the level-up notification popup.
 *
 * Baseline `{skills:{}}` is schema-valid. Runtime falls back to
 * legacy hardcoded unlock arrays when provider is unloaded.
 */

import {
  SkillUnlocksManifestSchema,
  type SkillUnlocksManifest,
} from "@hyperforge/manifest-schema";

class SkillUnlocksProvider {
  private static _instance: SkillUnlocksProvider | null = null;
  private _manifest: SkillUnlocksManifest | null = null;

  public static getInstance(): SkillUnlocksProvider {
    if (!SkillUnlocksProvider._instance) {
      SkillUnlocksProvider._instance = new SkillUnlocksProvider();
    }
    return SkillUnlocksProvider._instance;
  }

  public load(manifest: SkillUnlocksManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): SkillUnlocksManifest {
    const parsed = SkillUnlocksManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: SkillUnlocksManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): SkillUnlocksManifest | null {
    return this._manifest;
  }
}

export { SkillUnlocksProvider };
export const skillUnlocksProvider = SkillUnlocksProvider.getInstance();

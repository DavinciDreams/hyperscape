/**
 * ProjectSettingsProvider
 *
 * Singleton persistence layer for the authored project-settings
 * manifest — project identity (projectName, gameModeId), enabled
 * plugins array, default render profile preset, default input
 * scheme, default locale, world seed, PIE flag map.
 *
 * Refinement: unique plugin ids.
 *
 * No baseline fixture — `projectName` and `gameModeId` are
 * `.min(1)` required. Safe default is unloaded.
 *
 * Runtime editor reads this at boot to seed GameMode + plugin
 * lineup.
 */

import {
  ProjectSettingsManifestSchema,
  type ProjectSettingsManifest,
} from "@hyperforge/manifest-schema";

class ProjectSettingsProvider {
  private static _instance: ProjectSettingsProvider | null = null;
  private _manifest: ProjectSettingsManifest | null = null;

  public static getInstance(): ProjectSettingsProvider {
    if (!ProjectSettingsProvider._instance) {
      ProjectSettingsProvider._instance = new ProjectSettingsProvider();
    }
    return ProjectSettingsProvider._instance;
  }

  public load(manifest: ProjectSettingsManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): ProjectSettingsManifest {
    const parsed = ProjectSettingsManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: ProjectSettingsManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): ProjectSettingsManifest | null {
    return this._manifest;
  }
}

export { ProjectSettingsProvider };
export const projectSettingsProvider = ProjectSettingsProvider.getInstance();

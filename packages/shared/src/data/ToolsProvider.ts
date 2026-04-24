/**
 * ToolsProvider
 *
 * Singleton persistence layer for the authored tools manifest —
 * gathering-skill tools catalog (hatchets, pickaxes, fishing gear)
 * with skill/tier/priority metadata.
 *
 * Baseline fixture is `[]` (empty catalog). Runtime gathering systems
 * fall back to legacy hardcoded lookups when provider is unloaded.
 */

import {
  ToolsManifestSchema,
  type ToolsManifest,
} from "@hyperforge/manifest-schema";

class ToolsProvider {
  private static _instance: ToolsProvider | null = null;
  private _manifest: ToolsManifest | null = null;

  public static getInstance(): ToolsProvider {
    if (!ToolsProvider._instance) {
      ToolsProvider._instance = new ToolsProvider();
    }
    return ToolsProvider._instance;
  }

  public load(manifest: ToolsManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): ToolsManifest {
    const parsed = ToolsManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: ToolsManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): ToolsManifest | null {
    return this._manifest;
  }
}

export { ToolsProvider };
export const toolsProvider = ToolsProvider.getInstance();

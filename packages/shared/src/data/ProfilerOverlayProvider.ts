/**
 * ProfilerOverlayProvider
 *
 * Singleton persistence layer for the authored profiler-overlay
 * manifest — declarative metrics with threshold-driven color bands,
 * groups with unique metric ids across the whole overlay.
 *
 * Refinements: unique profiler group ids + unique metric ids across
 * all groups.
 *
 * Baseline fixture is `{}` — every field has a default (enabled=false,
 * empty groups).
 *
 * Runtime profiler overlay consumes this to configure the HUD panel.
 */

import {
  ProfilerOverlayManifestSchema,
  type ProfilerOverlayManifest,
} from "@hyperforge/manifest-schema";

class ProfilerOverlayProvider {
  private static _instance: ProfilerOverlayProvider | null = null;
  private _manifest: ProfilerOverlayManifest | null = null;

  public static getInstance(): ProfilerOverlayProvider {
    if (!ProfilerOverlayProvider._instance) {
      ProfilerOverlayProvider._instance = new ProfilerOverlayProvider();
    }
    return ProfilerOverlayProvider._instance;
  }

  public load(manifest: ProfilerOverlayManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): ProfilerOverlayManifest {
    const parsed = ProfilerOverlayManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: ProfilerOverlayManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): ProfilerOverlayManifest | null {
    return this._manifest;
  }
}

export { ProfilerOverlayProvider };
export const profilerOverlayProvider = ProfilerOverlayProvider.getInstance();

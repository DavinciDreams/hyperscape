/**
 * ProfilerProvider
 *
 * Singleton persistence layer for the authored profiler-overlay
 * manifest — on-screen performance HUD configuration (anchor, refresh
 * interval, grouped metrics).
 *
 * Baseline `{}` acceptable — all fields have defaults and the empty
 * `groups` array satisfies the unique-group-id + unique-metric-id
 * refinements trivially. Runtime falls back to the built-in profiler
 * defaults when provider is unloaded.
 */

import {
  ProfilerOverlayManifestSchema,
  type ProfilerOverlayManifest,
} from "@hyperforge/manifest-schema";

class ProfilerProvider {
  private static _instance: ProfilerProvider | null = null;
  private _manifest: ProfilerOverlayManifest | null = null;

  public static getInstance(): ProfilerProvider {
    if (!ProfilerProvider._instance) {
      ProfilerProvider._instance = new ProfilerProvider();
    }
    return ProfilerProvider._instance;
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

export { ProfilerProvider };
export const profilerProvider = ProfilerProvider.getInstance();

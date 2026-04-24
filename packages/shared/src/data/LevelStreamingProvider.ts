/**
 * LevelStreamingProvider
 *
 * Singleton persistence layer for the authored level-streaming
 * manifest — array-shape sublevel registry with 4 policies
 * (always-loaded/proximity/on-demand/server-authoritative),
 * 3 trigger-volume kinds (sphere/aabb/tag), dependsOn DAG with
 * cycle detection + hysteresis via unloadPaddingMeters.
 *
 * Refinements: unique sublevel ids + `dependsOn` resolves + no
 * cycles in depends-on graph.
 *
 * Baseline fixture is an empty array `[]`.
 *
 * Runtime LevelStreamingSystem pending.
 */

import {
  LevelStreamingManifestSchema,
  type LevelStreamingManifest,
} from "@hyperforge/manifest-schema";

class LevelStreamingProvider {
  private static _instance: LevelStreamingProvider | null = null;
  private _manifest: LevelStreamingManifest | null = null;

  public static getInstance(): LevelStreamingProvider {
    if (!LevelStreamingProvider._instance) {
      LevelStreamingProvider._instance = new LevelStreamingProvider();
    }
    return LevelStreamingProvider._instance;
  }

  public load(manifest: LevelStreamingManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): LevelStreamingManifest {
    const parsed = LevelStreamingManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: LevelStreamingManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): LevelStreamingManifest | null {
    return this._manifest;
  }
}

export { LevelStreamingProvider };
export const levelStreamingProvider = LevelStreamingProvider.getInstance();

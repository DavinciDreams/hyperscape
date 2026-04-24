/**
 * MatchmakingTuningProvider
 *
 * Singleton persistence layer for the authored matchmaking-tuning
 * manifest — automatic matchmaking queue policy (skill model,
 * bucket widening schedule, party constraints, backfill rules,
 * dodge penalties).
 *
 * Baseline `{enabled:false}` is schema-valid (all other fields have
 * defaults, and the `enabled → queues.length > 0` refinement only
 * fires when `enabled=true`). Runtime falls back to built-in
 * matchmaking defaults when provider is unloaded.
 */

import {
  MatchmakingTuningManifestSchema,
  type MatchmakingTuningManifest,
} from "@hyperforge/manifest-schema";

class MatchmakingTuningProvider {
  private static _instance: MatchmakingTuningProvider | null = null;
  private _manifest: MatchmakingTuningManifest | null = null;

  public static getInstance(): MatchmakingTuningProvider {
    if (!MatchmakingTuningProvider._instance) {
      MatchmakingTuningProvider._instance = new MatchmakingTuningProvider();
    }
    return MatchmakingTuningProvider._instance;
  }

  public load(manifest: MatchmakingTuningManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): MatchmakingTuningManifest {
    const parsed = MatchmakingTuningManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: MatchmakingTuningManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): MatchmakingTuningManifest | null {
    return this._manifest;
  }
}

export { MatchmakingTuningProvider };
export const matchmakingTuningProvider =
  MatchmakingTuningProvider.getInstance();

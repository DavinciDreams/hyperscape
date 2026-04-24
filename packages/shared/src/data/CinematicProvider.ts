/**
 * CinematicProvider
 *
 * Singleton persistence layer for the authored cinematic manifest —
 * array-shape registry of timeline cinematics with 5-kind track
 * discriminated union (camera/entity-pose/dialogue/audio/event),
 * per-track monotonic-time refinement + cinematic-level durationSec
 * containment refinement.
 *
 * Refinement: unique cinematic ids across the array.
 *
 * Baseline fixture is an empty array `[]`.
 *
 * Runtime CinematicPlayer not yet shipped.
 */

import {
  CinematicManifestSchema,
  type CinematicManifest,
} from "@hyperforge/manifest-schema";

class CinematicProvider {
  private static _instance: CinematicProvider | null = null;
  private _manifest: CinematicManifest | null = null;

  public static getInstance(): CinematicProvider {
    if (!CinematicProvider._instance) {
      CinematicProvider._instance = new CinematicProvider();
    }
    return CinematicProvider._instance;
  }

  public load(manifest: CinematicManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): CinematicManifest {
    const parsed = CinematicManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: CinematicManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): CinematicManifest | null {
    return this._manifest;
  }
}

export { CinematicProvider };
export const cinematicProvider = CinematicProvider.getInstance();

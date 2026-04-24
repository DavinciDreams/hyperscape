/**
 * ParticleGraphProvider
 *
 * Singleton persistence layer for the authored particle-graph
 * manifest — Niagara-style declarative particle systems (emitter,
 * ordered initializers, ordered updaters, renderer) with spawn
 * rate/burst + lifetime, velocity-cone/vector initializers, gravity/
 * drag/curl-noise/color-over-life updaters, billboard/mesh/ribbon
 * renderers.
 *
 * Refinements: unique system ids + at-least-one-velocity-initializer
 * per system + `rate > 0 || burstCount > 0` per emitter.
 *
 * Baseline fixture is an empty array `[]` — no systems authored yet.
 *
 * Runtime ParticleSystem compiler not yet shipped.
 */

import {
  ParticleGraphManifestSchema,
  type ParticleGraphManifest,
} from "@hyperforge/manifest-schema";

class ParticleGraphProvider {
  private static _instance: ParticleGraphProvider | null = null;
  private _manifest: ParticleGraphManifest | null = null;

  public static getInstance(): ParticleGraphProvider {
    if (!ParticleGraphProvider._instance) {
      ParticleGraphProvider._instance = new ParticleGraphProvider();
    }
    return ParticleGraphProvider._instance;
  }

  public load(manifest: ParticleGraphManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): ParticleGraphManifest {
    const parsed = ParticleGraphManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: ParticleGraphManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): ParticleGraphManifest | null {
    return this._manifest;
  }
}

export { ParticleGraphProvider };
export const particleGraphProvider = ParticleGraphProvider.getInstance();

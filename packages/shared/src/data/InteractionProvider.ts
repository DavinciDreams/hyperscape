/**
 * InteractionProvider
 *
 * Singleton persistence layer for the authored interaction manifest —
 * session-type tuning (store/bank/dialogue), per-type interaction
 * distances, transaction rate limit, session validation tick config,
 * generic input validation limits.
 *
 * No safe baseline — schema requires `$schema` + every nested config
 * block populated. Runtime falls back to legacy hardcoded interaction
 * constants when provider is unloaded.
 */

import {
  InteractionManifestSchema,
  type InteractionManifest,
} from "@hyperforge/manifest-schema";

class InteractionProvider {
  private static _instance: InteractionProvider | null = null;
  private _manifest: InteractionManifest | null = null;

  public static getInstance(): InteractionProvider {
    if (!InteractionProvider._instance) {
      InteractionProvider._instance = new InteractionProvider();
    }
    return InteractionProvider._instance;
  }

  public load(manifest: InteractionManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): InteractionManifest {
    const parsed = InteractionManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: InteractionManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): InteractionManifest | null {
    return this._manifest;
  }
}

export { InteractionProvider };
export const interactionProvider = InteractionProvider.getInstance();

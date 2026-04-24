/**
 * AnimationsProvider
 *
 * Singleton persistence layer for the authored animation manifest —
 * an object with `clips` (animation asset definitions) + `bindings`
 * (action→clip wiring). Both arrays default to `[]`.
 *
 * Baseline fixture is `{}` — no authored clips or bindings, which
 * leaves the runtime AnimationSystem (future) with nothing to play
 * beyond built-in defaults.
 *
 * Runtime AnimationSystem not yet shipped.
 */

import {
  AnimationManifestSchema,
  type AnimationManifest,
} from "@hyperforge/manifest-schema";

class AnimationsProvider {
  private static _instance: AnimationsProvider | null = null;
  private _manifest: AnimationManifest | null = null;

  public static getInstance(): AnimationsProvider {
    if (!AnimationsProvider._instance) {
      AnimationsProvider._instance = new AnimationsProvider();
    }
    return AnimationsProvider._instance;
  }

  public load(manifest: AnimationManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): AnimationManifest {
    const parsed = AnimationManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: AnimationManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): AnimationManifest | null {
    return this._manifest;
  }
}

export { AnimationsProvider };
export const animationsProvider = AnimationsProvider.getInstance();

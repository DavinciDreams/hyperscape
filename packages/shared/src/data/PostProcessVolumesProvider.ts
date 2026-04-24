/**
 * PostProcessVolumesProvider
 *
 * Singleton persistence layer for authored post-process volumes —
 * region-bounded render-profile overrides with unbounded / sphere
 * / aabb shapes, priority, and blend weights. Complements the
 * `RenderProfilesProvider` base profile + the `PostProcessVolumeCompositor`
 * runtime shipped Apr-20.
 *
 * Array-shaped manifest with safe empty semantics: `getVolumes()`
 * returns `[]` when unloaded so the compositor simply has no
 * overrides to apply.
 */

import {
  PostProcessVolumeManifestSchema,
  type PostProcessVolumeManifest,
} from "@hyperforge/manifest-schema";

class PostProcessVolumesProvider {
  private static _instance: PostProcessVolumesProvider | null = null;
  private _manifest: PostProcessVolumeManifest | null = null;

  public static getInstance(): PostProcessVolumesProvider {
    if (!PostProcessVolumesProvider._instance) {
      PostProcessVolumesProvider._instance = new PostProcessVolumesProvider();
    }
    return PostProcessVolumesProvider._instance;
  }

  /** Install an already-validated manifest. */
  public load(manifest: PostProcessVolumeManifest): void {
    this._manifest = manifest;
  }

  /** Validate and install a raw JSON-parsed payload. */
  public loadRaw(raw: unknown): PostProcessVolumeManifest {
    const parsed = PostProcessVolumeManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  /** Detach the authored manifest. `isLoaded()` becomes false. */
  public unload(): void {
    this._manifest = null;
  }

  /** Hot-reload entry point. `null` clears the authored manifest. */
  public hotReload(manifest: PostProcessVolumeManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  /** Volumes array, or `[]` when unloaded. */
  public getVolumes(): PostProcessVolumeManifest {
    return this._manifest ?? [];
  }

  public getManifest(): PostProcessVolumeManifest | null {
    return this._manifest;
  }
}

export { PostProcessVolumesProvider };
export const postProcessVolumesProvider =
  PostProcessVolumesProvider.getInstance();

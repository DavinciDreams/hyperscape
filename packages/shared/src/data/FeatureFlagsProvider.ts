/**
 * FeatureFlagsProvider
 *
 * Singleton persistence layer for the authored feature-flags
 * manifest — named targeting rules (platform/region/age/level/
 * rollout-percent/allow-block lists) + boolean or variant flag
 * registry + mutual-exclusion groups. Wraps the
 * `@hyperforge/manifest-schema` `FeatureFlagsManifestSchema` with
 * object-shape, null-when-unloaded semantics.
 *
 * Runtime `FeatureFlagRegistry` (hash bucketing, evaluation order,
 * remote-config bridge, admin override layer) is a separate slice
 * that will consume this provider; persistence-only for now.
 */

import {
  FeatureFlagsManifestSchema,
  type FeatureFlagsManifest,
} from "@hyperforge/manifest-schema";

class FeatureFlagsProvider {
  private static _instance: FeatureFlagsProvider | null = null;
  private _manifest: FeatureFlagsManifest | null = null;

  public static getInstance(): FeatureFlagsProvider {
    if (!FeatureFlagsProvider._instance) {
      FeatureFlagsProvider._instance = new FeatureFlagsProvider();
    }
    return FeatureFlagsProvider._instance;
  }

  /** Install an already-validated manifest. */
  public load(manifest: FeatureFlagsManifest): void {
    this._manifest = manifest;
  }

  /** Validate and install a raw JSON-parsed payload. */
  public loadRaw(raw: unknown): FeatureFlagsManifest {
    const parsed = FeatureFlagsManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  /** Detach the authored manifest. `isLoaded()` becomes false. */
  public unload(): void {
    this._manifest = null;
  }

  /** Hot-reload entry point. `null` clears the authored manifest. */
  public hotReload(manifest: FeatureFlagsManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): FeatureFlagsManifest | null {
    return this._manifest;
  }
}

export { FeatureFlagsProvider };
export const featureFlagsProvider = FeatureFlagsProvider.getInstance();

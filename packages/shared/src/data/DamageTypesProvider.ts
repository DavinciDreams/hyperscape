/**
 * DamageTypesProvider
 *
 * Singleton persistence layer for the authored damage-types manifest
 * — typed damage namespace (physical/fire/ice/...), family tags,
 * sparse (attacker, target) resistance matrix + default multiplier,
 * and `ignoresResistances` bypass contract.
 *
 * The runtime `DamageTypeRegistry` (shipped Apr 20) consumes the
 * manifest on construction and exposes `resolveMultiplier` /
 * `applyDamage` helpers to the combat stack.
 */

import {
  DamageTypesManifestSchema,
  type DamageTypesManifest,
} from "@hyperforge/manifest-schema";

class DamageTypesProvider {
  private static _instance: DamageTypesProvider | null = null;
  private _manifest: DamageTypesManifest | null = null;

  public static getInstance(): DamageTypesProvider {
    if (!DamageTypesProvider._instance) {
      DamageTypesProvider._instance = new DamageTypesProvider();
    }
    return DamageTypesProvider._instance;
  }

  /** Install an already-validated manifest. */
  public load(manifest: DamageTypesManifest): void {
    this._manifest = manifest;
  }

  /** Validate and install a raw JSON-parsed payload. */
  public loadRaw(raw: unknown): DamageTypesManifest {
    const parsed = DamageTypesManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  /** Detach the authored manifest. `isLoaded()` becomes false. */
  public unload(): void {
    this._manifest = null;
  }

  /** Hot-reload entry point. `null` clears the authored manifest. */
  public hotReload(manifest: DamageTypesManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  /**
   * Current manifest, or `null` when unloaded. The schema requires
   * `types.min(1)`, so there is no safe empty fallback —
   * consumers must guard or supply their own default (a single
   * "true" damage type is the minimum viable baseline).
   */
  public getManifest(): DamageTypesManifest | null {
    return this._manifest;
  }
}

export { DamageTypesProvider };
export const damageTypesProvider = DamageTypesProvider.getInstance();

/**
 * Weapon styles registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s
 * `weapon-styles.ts`. Maps each weapon type to its allowed combat
 * styles; first entry is the default.
 */

import {
  type CombatStyleExtendedLiteral,
  type WeaponStylesManifest,
  type WeaponTypeId,
  WeaponStylesManifestSchema,
} from "@hyperforge/manifest-schema";

export class WeaponStylesNotLoadedError extends Error {
  constructor() {
    super("WeaponStylesRegistry used before load()");
    this.name = "WeaponStylesNotLoadedError";
  }
}

export class UnknownWeaponTypeError extends Error {
  readonly weaponType: string;
  readonly availableTypes: readonly string[];
  constructor(weaponType: string, availableTypes: readonly string[]) {
    super(
      `weapon type "${weaponType}" has no styles defined. Known: ${
        availableTypes.length > 0 ? availableTypes.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownWeaponTypeError";
    this.weaponType = weaponType;
    this.availableTypes = availableTypes;
  }
}

export class WeaponStylesRegistry {
  private _manifest: WeaponStylesManifest | null = null;

  constructor(manifest?: WeaponStylesManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: WeaponStylesManifest): void {
    this._manifest = manifest;
  }

  loadFromJson(raw: unknown): void {
    this.load(WeaponStylesManifestSchema.parse(raw));
  }

  isLoaded(): boolean {
    return this._manifest !== null;
  }

  get manifest(): WeaponStylesManifest {
    if (!this._manifest) throw new WeaponStylesNotLoadedError();
    return this._manifest;
  }

  has(weaponType: WeaponTypeId): boolean {
    return Object.prototype.hasOwnProperty.call(
      this.manifest.styles,
      weaponType,
    );
  }

  /** Allowed styles for a weapon type, in authored order. */
  stylesFor(weaponType: WeaponTypeId): CombatStyleExtendedLiteral[] {
    const s = this.manifest.styles[weaponType];
    if (!s) {
      throw new UnknownWeaponTypeError(
        weaponType,
        Object.keys(this.manifest.styles),
      );
    }
    return s;
  }

  /** First style (default). */
  defaultStyle(weaponType: WeaponTypeId): CombatStyleExtendedLiteral {
    return this.stylesFor(weaponType)[0]!;
  }

  allows(weaponType: WeaponTypeId, style: CombatStyleExtendedLiteral): boolean {
    const list = this.manifest.styles[weaponType];
    return list ? list.includes(style) : false;
  }
}

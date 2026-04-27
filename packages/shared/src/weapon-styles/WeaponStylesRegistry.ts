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

/** Listener invoked after every successful `load()` / `loadFromJson()`. */
export type WeaponStylesReloadListener = () => void;

export class WeaponStylesRegistry {
  private _manifest: WeaponStylesManifest | null = null;
  private _reloadListeners = new Set<WeaponStylesReloadListener>();

  constructor(manifest?: WeaponStylesManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: WeaponStylesManifest): void {
    this._manifest = manifest;
    this._emitReloaded();
  }

  loadFromJson(raw: unknown): void {
    this.load(WeaponStylesManifestSchema.parse(raw));
  }

  /**
   * Subscribe to reload notifications. Returns unsubscribe.
   * Listener throws are caught + logged. Pattern matches
   * `SkillIconsRegistry.onReloaded`.
   */
  onReloaded(cb: WeaponStylesReloadListener): () => void {
    this._reloadListeners.add(cb);
    return () => {
      this._reloadListeners.delete(cb);
    };
  }

  private _emitReloaded(): void {
    if (this._reloadListeners.size === 0) return;
    for (const cb of this._reloadListeners) {
      try {
        cb();
      } catch (err) {
        console.warn(
          "[weaponStylesRegistry] reload listener threw:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }
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

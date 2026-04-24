/**
 * Ammunition registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s
 * `ammunition.ts`. Bow tier + arrow lookup, with a shooting-gate
 * predicate enforcing required ranged level and bow tier ≥ arrow's
 * requiredBowTier.
 */

import {
  type AmmunitionManifest,
  type ArrowEntry,
  AmmunitionManifestSchema,
} from "@hyperforge/manifest-schema";

export class AmmunitionNotLoadedError extends Error {
  constructor() {
    super("AmmunitionRegistry used before load()");
    this.name = "AmmunitionNotLoadedError";
  }
}

export class UnknownArrowError extends Error {
  readonly arrowId: string;
  readonly availableIds: readonly string[];
  constructor(id: string, availableIds: readonly string[]) {
    super(
      `arrow "${id}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownArrowError";
    this.arrowId = id;
    this.availableIds = availableIds;
  }
}

export class UnknownBowError extends Error {
  readonly bowId: string;
  readonly availableIds: readonly string[];
  constructor(id: string, availableIds: readonly string[]) {
    super(
      `bow "${id}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownBowError";
    this.bowId = id;
    this.availableIds = availableIds;
  }
}

export type ShotGateReason =
  | "ok"
  | "unknown-arrow"
  | "unknown-bow"
  | "below-ranged-level"
  | "bow-tier-too-low";

export interface ShotGateResult {
  ok: boolean;
  reason: ShotGateReason;
}

export class AmmunitionRegistry {
  private _manifest: AmmunitionManifest | null = null;

  constructor(manifest?: AmmunitionManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: AmmunitionManifest): void {
    this._manifest = manifest;
  }

  loadFromJson(raw: unknown): void {
    this.load(AmmunitionManifestSchema.parse(raw));
  }

  isLoaded(): boolean {
    return this._manifest !== null;
  }

  get manifest(): AmmunitionManifest {
    if (!this._manifest) throw new AmmunitionNotLoadedError();
    return this._manifest;
  }

  hasBow(bowId: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.manifest.bowTiers, bowId);
  }

  bowTier(bowId: string): number {
    const t = this.manifest.bowTiers[bowId];
    if (t === undefined) {
      throw new UnknownBowError(bowId, Object.keys(this.manifest.bowTiers));
    }
    return t;
  }

  hasArrow(arrowId: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.manifest.arrows, arrowId);
  }

  arrow(arrowId: string): ArrowEntry {
    const a = this.manifest.arrows[arrowId];
    if (!a) {
      throw new UnknownArrowError(arrowId, Object.keys(this.manifest.arrows));
    }
    return a;
  }

  /**
   * Check whether a shooter with `rangedLevel` wielding `bowId` may
   * fire `arrowId`.
   */
  canShoot(
    arrowId: string,
    bowId: string,
    rangedLevel: number,
  ): ShotGateResult {
    if (!this.hasArrow(arrowId)) {
      return { ok: false, reason: "unknown-arrow" };
    }
    if (!this.hasBow(bowId)) {
      return { ok: false, reason: "unknown-bow" };
    }
    const a = this.arrow(arrowId);
    if (rangedLevel < a.requiredRangedLevel) {
      return { ok: false, reason: "below-ranged-level" };
    }
    if (this.bowTier(bowId) < a.requiredBowTier) {
      return { ok: false, reason: "bow-tier-too-low" };
    }
    return { ok: true, reason: "ok" };
  }
}

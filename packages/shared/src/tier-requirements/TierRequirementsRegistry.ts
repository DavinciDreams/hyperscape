/**
 * Tier requirements registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s
 * `tier-requirements.ts`. Lookup of skill requirements for OSRS-style
 * equipment/tool tiers across four families (melee/tools/ranged/magic).
 */

import {
  type MagicTierData,
  type MeleeTierData,
  type RangedTierData,
  type TierRequirementsManifest,
  type ToolTierData,
  TierRequirementsManifestSchema,
} from "@hyperforge/manifest-schema";

export class TierRequirementsNotLoadedError extends Error {
  constructor() {
    super("TierRequirementsRegistry used before load()");
    this.name = "TierRequirementsNotLoadedError";
  }
}

export class UnknownTierError extends Error {
  readonly family: "melee" | "tools" | "ranged" | "magic";
  readonly tier: string;
  readonly availableTiers: readonly string[];
  constructor(
    family: "melee" | "tools" | "ranged" | "magic",
    tier: string,
    availableTiers: readonly string[],
  ) {
    super(
      `tier "${tier}" not defined for family "${family}". Known: ${
        availableTiers.length > 0 ? availableTiers.join(", ") : "(none)"
      }`,
    );
    this.name = "UnknownTierError";
    this.family = family;
    this.tier = tier;
    this.availableTiers = availableTiers;
  }
}

/** Skill levels required to equip/use. */
export interface SkillRequirements {
  attack?: number;
  defence?: number;
  ranged?: number;
  magic?: number;
  woodcutting?: number;
  mining?: number;
}

export class TierRequirementsRegistry {
  private _manifest: TierRequirementsManifest | null = null;

  constructor(manifest?: TierRequirementsManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: TierRequirementsManifest): void {
    this._manifest = manifest;
  }

  loadFromJson(raw: unknown): void {
    this.load(TierRequirementsManifestSchema.parse(raw));
  }

  get manifest(): TierRequirementsManifest {
    if (!this._manifest) throw new TierRequirementsNotLoadedError();
    return this._manifest;
  }

  melee(tier: string): MeleeTierData {
    const v = this.manifest.melee[tier];
    if (!v) {
      throw new UnknownTierError(
        "melee",
        tier,
        Object.keys(this.manifest.melee),
      );
    }
    return v;
  }

  tools(tier: string): ToolTierData {
    const v = this.manifest.tools[tier];
    if (!v) {
      throw new UnknownTierError(
        "tools",
        tier,
        Object.keys(this.manifest.tools),
      );
    }
    return v;
  }

  ranged(tier: string): RangedTierData {
    const v = this.manifest.ranged[tier];
    if (!v) {
      throw new UnknownTierError(
        "ranged",
        tier,
        Object.keys(this.manifest.ranged),
      );
    }
    return v;
  }

  magic(tier: string): MagicTierData {
    const v = this.manifest.magic[tier];
    if (!v) {
      throw new UnknownTierError(
        "magic",
        tier,
        Object.keys(this.manifest.magic),
      );
    }
    return v;
  }

  /** Whether the viewer's stats meet a tier's requirement. */
  meetsMelee(tier: string, stats: SkillRequirements): boolean {
    const r = this.melee(tier);
    return (stats.attack ?? 0) >= r.attack && (stats.defence ?? 0) >= r.defence;
  }

  meetsTools(tier: string, stats: SkillRequirements): boolean {
    const r = this.tools(tier);
    return (
      (stats.attack ?? 0) >= r.attack &&
      (stats.woodcutting ?? 0) >= r.woodcutting &&
      (stats.mining ?? 0) >= r.mining
    );
  }

  meetsRanged(tier: string, stats: SkillRequirements): boolean {
    const r = this.ranged(tier);
    return (stats.ranged ?? 0) >= r.ranged && (stats.defence ?? 0) >= r.defence;
  }

  meetsMagic(tier: string, stats: SkillRequirements): boolean {
    const r = this.magic(tier);
    if ((stats.magic ?? 0) < r.magic) return false;
    if (r.defence !== undefined && (stats.defence ?? 0) < r.defence) {
      return false;
    }
    return true;
  }
}

/**
 * Tier Data Provider
 *
 * Provides OSRS-accurate tier-based level requirements for equipment and tools.
 * Single source of truth - loaded from tier-requirements.json manifest.
 * Validated via `TierRequirementsManifestSchema` on load.
 *
 * Usage:
 * - TierDataProvider.getInstance().getRequirements(tier, itemType, equipSlot)
 * - Returns skill requirements object or null
 */

import {
  TierRequirementsManifestSchema,
  type TierRequirementsManifest as SchemaTierRequirementsManifest,
  type MeleeTierData as SchemaMeleeTierData,
  type ToolTierData as SchemaToolTierData,
  type RangedTierData as SchemaRangedTierData,
  type MagicTierData as SchemaMagicTierData,
} from "@hyperforge/manifest-schema";

// Types for tier requirements data
export interface TierRequirements {
  attack?: number;
  defence?: number;
  ranged?: number;
  magic?: number;
  woodcutting?: number;
  mining?: number;
  fishing?: number;
}

export type MeleeTierData = SchemaMeleeTierData;
export type ToolTierData = SchemaToolTierData;
export type RangedTierData = SchemaRangedTierData;
export type MagicTierData = SchemaMagicTierData;
export type TierRequirementsManifest = SchemaTierRequirementsManifest;

// Item type for tier derivation
export interface TierableItem {
  id: string;
  type: string;
  tier?: string;
  equipSlot?: string;
  attackType?: string;
  requirements?: {
    level?: number;
    skills?: Record<string, number>;
  };
  tool?: {
    skill: "woodcutting" | "mining" | "fishing";
    priority: number;
    rollTicks?: number;
  };
}

/**
 * TierDataProvider - Singleton for tier-based level requirements
 */
class TierDataProviderImpl {
  private static instance: TierDataProviderImpl;
  private tiers: TierRequirementsManifest | null = null;
  private loaded = false;

  private constructor() {}

  static getInstance(): TierDataProviderImpl {
    if (!TierDataProviderImpl.instance) {
      TierDataProviderImpl.instance = new TierDataProviderImpl();
    }
    return TierDataProviderImpl.instance;
  }

  /**
   * Load tier requirements from manifest data.
   * Validates against `TierRequirementsManifestSchema` — invalid
   * manifests are rejected with a thrown ZodError so callers can
   * surface the issue immediately.
   */
  load(manifest: TierRequirementsManifest): void {
    this.tiers = TierRequirementsManifestSchema.parse(manifest);
    this.loaded = true;
  }

  /**
   * Hot-reload the tier manifest from the editor's PIE session. Validates,
   * swaps state in one shot. No derived indexes to rebuild — each
   * `getRequirements()` call reads straight off `this.tiers`, so systems
   * observe the new values on their next lookup.
   *
   * Throws if the manifest fails schema validation; prior state is
   * retained in that case.
   */
  hotReload(manifest: TierRequirementsManifest): void {
    this.load(manifest);
  }

  /**
   * Check if tier data is loaded
   */
  isLoaded(): boolean {
    return this.loaded;
  }

  /**
   * Reset tier data (for testing)
   */
  reset(): void {
    this.tiers = null;
    this.loaded = false;
  }

  /**
   * Get requirements for an item based on its tier
   *
   * Order of precedence:
   * 1. Explicit item.requirements (for special items like Barrows, fishing tools)
   * 2. Tier-derived requirements (for standard equipment/tools)
   * 3. null (for items without requirements)
   */
  getRequirements(item: TierableItem): TierRequirements | null {
    // 1. Explicit requirements take priority (special items)
    if (item.requirements?.skills) {
      return item.requirements.skills;
    }

    // 2. No tier = no requirements (food, resources)
    if (!item.tier) {
      return null;
    }

    // 3. Tier data not loaded
    if (!this.tiers) {
      return null;
    }

    const tier = item.tier;

    // Tools (hatchets, pickaxes)
    // NOTE: Fishing tools DON'T use tiers - they have explicit requirements
    if (item.type === "tool" && item.tool) {
      // Fishing tools should have explicit requirements field (not tier-based)
      if (item.tool.skill === "fishing") {
        return null; // Use explicit item.requirements instead
      }

      const toolTier = this.tiers.tools[tier];
      if (!toolTier) return null;

      // Return skill requirement based on tool's skill
      if (item.tool.skill === "woodcutting") {
        return {
          attack: toolTier.attack,
          woodcutting: toolTier.woodcutting,
        };
      }
      if (item.tool.skill === "mining") {
        return {
          attack: toolTier.attack,
          mining: toolTier.mining,
        };
      }
    }

    // Weapons
    if (item.equipSlot === "weapon") {
      // Check ranged weapons first
      if (item.attackType === "RANGED") {
        const rangedTier = this.tiers.ranged[tier];
        if (rangedTier) {
          return { ranged: rangedTier.ranged };
        }
      }

      // Check magic weapons
      if (item.attackType === "MAGIC") {
        const magicTier = this.tiers.magic[tier];
        if (magicTier) {
          return { magic: magicTier.magic };
        }
      }

      // Default to melee weapons
      const meleeTier = this.tiers.melee[tier];
      if (meleeTier) {
        return { attack: meleeTier.attack };
      }
    }

    // Armor
    if (
      ["head", "body", "legs", "shield", "hands", "feet", "cape"].includes(
        item.equipSlot || "",
      )
    ) {
      // Check for ranged armor
      const rangedTier = this.tiers.ranged[tier];
      if (rangedTier) {
        return { ranged: rangedTier.ranged, defence: rangedTier.defence };
      }

      // Check for magic armor
      const magicTier = this.tiers.magic[tier];
      if (magicTier) {
        return {
          magic: magicTier.magic,
          defence: magicTier.defence,
        };
      }

      // Default to melee armor
      const meleeTier = this.tiers.melee[tier];
      if (meleeTier) {
        return { defence: meleeTier.defence };
      }
    }

    return null;
  }

  /**
   * Get raw tier data for a specific category and tier
   */
  getTierData(
    category: "melee" | "tools" | "ranged" | "magic",
    tier: string,
  ): MeleeTierData | ToolTierData | RangedTierData | MagicTierData | null {
    if (!this.tiers) return null;
    return this.tiers[category]?.[tier] || null;
  }

  /**
   * Get all available tiers for a category
   */
  getAvailableTiers(
    category: "melee" | "tools" | "ranged" | "magic",
  ): string[] {
    if (!this.tiers) return [];
    return Object.keys(this.tiers[category] || {});
  }
}

// Export singleton accessor
export const TierDataProvider = TierDataProviderImpl.getInstance();

// Export function to load tier data
export function loadTierRequirements(manifest: TierRequirementsManifest): void {
  TierDataProvider.load(manifest);
}

// Export function to check if tier data is loaded
export function isTierDataLoaded(): boolean {
  return TierDataProvider.isLoaded();
}

// Export function to reset tier data (for testing)
export function resetTierData(): void {
  TierDataProvider.reset();
}

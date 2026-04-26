/**
 * RuneService - Handles rune validation and consumption for magic combat
 *
 * Responsibilities:
 * - Validate player has required runes for a spell
 * - Account for elemental staves (infinite elemental runes)
 * - Consume runes on spell cast
 */

import type { Item } from "@hyperforge/shared";
import { ELEMENTAL_STAVES, RUNE_NAMES, VALID_RUNES } from "@hyperforge/shared";
import { runesRegistry } from "@hyperforge/shared";

/**
 * Rune requirement for a spell
 */
export interface RuneRequirement {
  runeId: string;
  quantity: number;
}

/**
 * Result of rune validation
 */
export interface RuneValidationResult {
  valid: boolean;
  error?: string;
  errorCode?: "MISSING_RUNES" | "INSUFFICIENT_RUNES";
  missing?: RuneRequirement[];
}

/**
 * Inventory item representation for rune checking
 */
export interface InventoryItem {
  itemId: string;
  quantity: number;
  slot: number;
}

/**
 * RuneService class for managing rune consumption
 */
export class RuneService {
  /**
   * Get the infinite runes provided by an equipped staff
   *
   * @param weapon - The equipped weapon item
   * @returns Array of rune IDs that are infinite
   */
  getInfiniteRunesFromStaff(weapon: Item | null): string[] {
    if (!weapon) {
      return [];
    }

    // Check if weapon is an elemental staff. Prefers the runtime
    // runesRegistry (manifest-loaded; honors PIE hot-reload + authored
    // staff-substitution rules) and falls back to the in-tree
    // ELEMENTAL_STAVES constant when the registry hasn't been loaded.
    const infiniteRunes = runesRegistry.isLoaded()
      ? runesRegistry.staff(weapon.id)?.providesInfinite
      : ELEMENTAL_STAVES[weapon.id];
    if (infiniteRunes && infiniteRunes.length > 0) {
      return [...infiniteRunes];
    }

    // Check for providesInfiniteRunes property on the item
    const providedRunes = (
      weapon as Item & { providesInfiniteRunes?: string[] }
    ).providesInfiniteRunes;
    if (providedRunes && Array.isArray(providedRunes)) {
      return providedRunes;
    }

    return [];
  }

  /**
   * Check if player has required runes for a spell
   *
   * @param inventory - Player's inventory items
   * @param requirements - Runes required for the spell
   * @param equippedWeapon - Player's equipped weapon (for elemental staff check)
   * @returns Validation result
   */
  hasRequiredRunes(
    inventory: InventoryItem[],
    requirements: RuneRequirement[],
    equippedWeapon: Item | null = null,
  ): RuneValidationResult {
    const infiniteRunes = this.getInfiniteRunesFromStaff(equippedWeapon);
    const missing: RuneRequirement[] = [];

    for (const requirement of requirements) {
      // Skip if this rune is provided infinitely by staff
      if (infiniteRunes.includes(requirement.runeId)) {
        continue;
      }

      // Count runes in inventory
      const runeCount = this.countRunesInInventory(
        inventory,
        requirement.runeId,
      );

      if (runeCount < requirement.quantity) {
        missing.push({
          runeId: requirement.runeId,
          quantity: requirement.quantity - runeCount,
        });
      }
    }

    if (missing.length > 0) {
      const missingNames = missing
        .map((r) => `${r.quantity} ${this.getRuneName(r.runeId)}`)
        .join(", ");

      return {
        valid: false,
        error: `You need ${missingNames} to cast this spell`,
        errorCode: "INSUFFICIENT_RUNES",
        missing,
      };
    }

    return { valid: true };
  }

  /**
   * Count how many of a specific rune the player has in inventory
   */
  countRunesInInventory(inventory: InventoryItem[], runeId: string): number {
    let count = 0;
    for (const item of inventory) {
      if (item.itemId === runeId) {
        count += item.quantity;
      }
    }
    return count;
  }

  /**
   * Calculate which runes need to be consumed (accounting for infinite runes from staff)
   *
   * @param requirements - Runes required for the spell
   * @param equippedWeapon - Player's equipped weapon (for elemental staff check)
   * @returns Runes that actually need to be consumed
   */
  getRunesToConsume(
    requirements: RuneRequirement[],
    equippedWeapon: Item | null = null,
  ): RuneRequirement[] {
    const infiniteRunes = this.getInfiniteRunesFromStaff(equippedWeapon);
    const toConsume: RuneRequirement[] = [];

    for (const requirement of requirements) {
      // Skip if this rune is provided infinitely by staff
      if (infiniteRunes.includes(requirement.runeId)) {
        continue;
      }

      toConsume.push(requirement);
    }

    return toConsume;
  }

  /**
   * Get human-readable rune name
   */
  getRuneName(runeId: string): string {
    if (runesRegistry.isLoaded()) {
      return runesRegistry.has(runeId)
        ? runesRegistry.get(runeId).name
        : runeId;
    }
    return RUNE_NAMES[runeId] ?? runeId;
  }

  /**
   * Check if a rune ID is valid
   */
  isValidRune(runeId: string): boolean {
    if (runesRegistry.isLoaded()) {
      return runesRegistry.has(runeId);
    }
    return (VALID_RUNES as readonly string[]).includes(runeId);
  }

  /**
   * Check if an item is an elemental staff
   */
  isElementalStaff(itemId: string): boolean {
    if (runesRegistry.isLoaded()) {
      return runesRegistry.staff(itemId) !== null;
    }
    return itemId in ELEMENTAL_STAVES;
  }

  /**
   * Get which elemental rune a staff provides
   */
  getStaffElement(staffId: string): string | null {
    if (runesRegistry.isLoaded()) {
      const provided = runesRegistry.staff(staffId)?.providesInfinite;
      return provided?.[0] ?? null;
    }
    const runes = ELEMENTAL_STAVES[staffId];
    return runes?.[0] ?? null;
  }
}

// Export singleton instance
export const runeService = new RuneService();

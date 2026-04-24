/**
 * WeaponStyleConfig — MANIFEST FAÇADE
 *
 * As of Phase A8 of PLAN_WORLD_STUDIO_AAA_COMPLETION.md, the OSRS-accurate
 * combat style availability table lives in `weapon-styles.json`, validated
 * at module load time against `WeaponStylesManifestSchema` from
 * `@hyperforge/manifest-schema`.
 *
 * This TS file preserves the exact legacy export shape
 * (`WEAPON_STYLE_CONFIG`, `getAvailableStyles`, `isStyleValidForWeapon`,
 * `getDefaultStyleForWeapon`) so existing consumers don't have to change.
 * A runtime integrity check asserts every `WeaponType` enum value has a
 * style list in the JSON.
 *
 * In OSRS, different weapon types have different available combat styles.
 *
 * @see https://oldschool.runescape.wiki/w/Combat_Options
 */

import { WeaponStylesManifestSchema } from "@hyperforge/manifest-schema";

import type { CombatStyleExtended } from "../types/game/combat-types";
import { WeaponType } from "../types/game/item-types";
import weaponStylesManifestJson from "./weapon-styles.json" with { type: "json" };

const manifest = WeaponStylesManifestSchema.parse(weaponStylesManifestJson);

/**
 * Combat styles available for each weapon type.
 * OSRS-accurate: Not all weapons have all 4 styles.
 *
 * Built at module load by iterating `WeaponType` enum values and looking
 * up the manifest. Fails fast if any enum value is missing from the JSON.
 */
export const WEAPON_STYLE_CONFIG: Record<WeaponType, CombatStyleExtended[]> =
  (() => {
    const config: Partial<Record<WeaponType, CombatStyleExtended[]>> = {};
    for (const weaponType of Object.values(WeaponType)) {
      const styles = manifest.styles[weaponType];
      if (!styles) {
        throw new Error(
          `WeaponStyleConfig drift: manifest missing styles for WeaponType "${weaponType}"`,
        );
      }
      // Copy the styles into a new mutable array so external consumers that
      // have historically mutated the arrays (none found today, but the
      // original declaration wasn't Readonly) continue to work.
      config[weaponType] = [...styles] as CombatStyleExtended[];
    }
    return config as Record<WeaponType, CombatStyleExtended[]>;
  })();

/**
 * Get available combat styles for a weapon type
 * @param weaponType - The type of weapon equipped
 * @returns Array of available combat styles
 */
export function getAvailableStyles(
  weaponType: WeaponType,
): CombatStyleExtended[] {
  return WEAPON_STYLE_CONFIG[weaponType] ?? ["accurate"];
}

/**
 * Check if a combat style is valid for the given weapon type
 * @param weaponType - The type of weapon equipped
 * @param style - The combat style to check
 * @returns true if the style is valid for this weapon
 */
export function isStyleValidForWeapon(
  weaponType: WeaponType,
  style: CombatStyleExtended,
): boolean {
  const availableStyles = getAvailableStyles(weaponType);
  return availableStyles.includes(style);
}

/**
 * Get the default combat style for a weapon type
 * Falls back to "accurate" if the weapon's first style is not available
 * @param weaponType - The type of weapon equipped
 * @returns The default combat style for this weapon
 */
export function getDefaultStyleForWeapon(
  weaponType: WeaponType,
): CombatStyleExtended {
  const availableStyles = getAvailableStyles(weaponType);
  return availableStyles[0] ?? "accurate";
}

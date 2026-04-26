/**
 * Skill name constants — shared between PlayerSystem (still in
 * @hyperforge/shared) and SkillsSystem (migrated to
 * @hyperforge/hyperscape, 2026-04-26).
 *
 * Extracted out of SkillsSystem.ts in the same diff that migrated
 * the system, so PlayerSystem can keep importing `Skill` from
 * `@hyperforge/shared` (cross-package consumer wiring).
 */

import type { Skills } from "../../types/entities/entity-types";

/** Skill name constants for type-safe skill references. */
export const Skill = {
  ATTACK: "attack" as keyof Skills,
  STRENGTH: "strength" as keyof Skills,
  DEFENSE: "defense" as keyof Skills,
  RANGE: "ranged" as keyof Skills,
  MAGIC: "magic" as keyof Skills,
  CONSTITUTION: "constitution" as keyof Skills,
  PRAYER: "prayer" as keyof Skills,
  WOODCUTTING: "woodcutting" as keyof Skills,
  MINING: "mining" as keyof Skills,
  FISHING: "fishing" as keyof Skills,
  FIREMAKING: "firemaking" as keyof Skills,
  COOKING: "cooking" as keyof Skills,
  SMITHING: "smithing" as keyof Skills,
  AGILITY: "agility" as keyof Skills,
  CRAFTING: "crafting" as keyof Skills,
  FLETCHING: "fletching" as keyof Skills,
  RUNECRAFTING: "runecrafting" as keyof Skills,
};

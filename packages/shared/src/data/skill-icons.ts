/**
 * Skill Data — Definitions and metadata for tile-based-MMORPG-style skills.
 *
 * Manifest façade: data loaded from `skill-icons.json` and
 * validated by `SkillIconsManifestSchema` from
 * `@hyperforge/manifest-schema` at module load time. Legacy exports
 * (`SkillCategory`, `SkillDefinition`, `SKILL_DEFINITIONS`,
 * `SKILL_ICONS`, helpers) are preserved unchanged for consumers.
 *
 * Shared constant used by:
 * - XPProgressOrb (HUD orbs)
 * - XPDropSystem (3D floating drops)
 * - SkillsPanel (skill grid display)
 * - Other UI components displaying skill information
 *
 * Extracted as part of Phase A11 of
 * `PLAN_WORLD_STUDIO_AAA_COMPLETION.md`.
 */

import {
  SkillIconsManifestSchema,
  type SkillCategory as SchemaSkillCategory,
} from "@hyperforge/manifest-schema";

import type { Skills } from "../types/entities/entity-types";

import skillIconsManifestJson from "./skill-icons.json" with { type: "json" };

// ============================================================================
// SKILL CATEGORIES
// ============================================================================

/** Skill category for grouping in UI */
export type SkillCategory = SchemaSkillCategory;

// ============================================================================
// SKILL DEFINITIONS
// ============================================================================

/** Complete skill definition with metadata for UI display */
export interface SkillDefinition {
  /** Skill key matching the Skills interface */
  key: keyof Skills;
  /** Display label */
  label: string;
  /** Emoji icon */
  icon: string;
  /** Category for grouping */
  category: SkillCategory;
  /** Default starting level (usually 1, constitution starts at 10) */
  defaultLevel: number;
}

export const manifest = SkillIconsManifestSchema.parse(skillIconsManifestJson);

/**
 * All skill definitions in tile-based-MMORPG-style display order.
 *
 * Arranged in 3-column grid matching classic MMORPG layout:
 *   Column 1: Combat (Attack, Strength, Defence, Ranged, Magic, Prayer)
 *   Column 2: Support (Constitution, Agility)
 *   Column 3: Gathering/Production (Mining, Smithing, Fishing, Cooking, Firemaking, Woodcutting)
 */
export const SKILL_DEFINITIONS: readonly SkillDefinition[] = Object.freeze(
  manifest.definitions.map(
    (d) =>
      Object.freeze({
        key: d.key as keyof Skills,
        label: d.label,
        icon: d.icon,
        category: d.category,
        defaultLevel: d.defaultLevel,
      }) as SkillDefinition,
  ),
);

/**
 * Get skill definitions by category
 * @param category - The skill category to filter by
 * @returns Array of skill definitions in that category
 */
export function getSkillsByCategory(
  category: SkillCategory,
): SkillDefinition[] {
  return SKILL_DEFINITIONS.filter((skill) => skill.category === category);
}

/**
 * Get a skill definition by key
 * @param key - The skill key (e.g., "attack", "agility")
 * @returns The skill definition or undefined if not found
 */
export function getSkillDefinition(
  key: keyof Skills,
): SkillDefinition | undefined {
  return SKILL_DEFINITIONS.find((skill) => skill.key === key);
}

// ============================================================================
// SKILL ICONS (Legacy - kept for backward compatibility)
// ============================================================================

/** Emoji icons for each skill, keyed by lowercase skill name */
export const SKILL_ICONS: Readonly<Record<string, string>> = Object.freeze({
  ...manifest.icons,
});

/**
 * Get the emoji icon for a skill (legacy in-tree path).
 *
 * Prefer `getEffectiveSkillIcon` from `../skill-icons` for new
 * consumers — it adds runtime-registry preference (PIE hot-reload)
 * with safe fallback to this same constant. Consolidating this
 * helper to delegate is blocked by a module-load cycle
 * (`skill-icons/index.ts` already imports from this file). Refactor
 * is a separate slice once the legacy constant is deletable.
 *
 * @param skill - Skill name (case-insensitive)
 * @returns Emoji icon or fallback icon
 */
export function getSkillIcon(skill: string): string {
  return SKILL_ICONS[skill.toLowerCase()] ?? manifest.fallbackIcon;
}

import {
  SKILL_ICONS,
  manifest as legacyManifest,
} from "../data/skill-icons.js";
import { SkillIconsRegistry } from "./SkillIconsRegistry.js";

export {
  SkillIconsNotLoadedError,
  SkillIconsRegistry,
  UnknownSkillDefinitionError,
} from "./SkillIconsRegistry.js";

/**
 * Module-level singleton. Mirrors the other registry patterns so
 * `PIEEditorSession.updateManifests({ skillIcons })` can live-
 * dispatch authored icon/label edits to the HUD / skill panel on
 * the next `.get(key)` / `.fallbackIcon` lookup.
 *
 * Pre-populated at module load from the legacy manifest so
 * `getEffectiveSkillIcon` (and any future consumers) hit the
 * registry-prefer branch in production — not just after a PIE edit.
 * The boot-load happens HERE (not in `data/skill-icons.ts`) to avoid
 * a circular import: skill-icons/index.ts already imports from
 * data/skill-icons.ts, and the reverse direction would cycle.
 */
export const skillIconsRegistry = new SkillIconsRegistry();
skillIconsRegistry.load(legacyManifest);

/**
 * Resolve a skill's emoji icon with the canonical registry-prefer-
 * fallback semantics. Loaded registry wins (returns the manifest's
 * authored icon for the skill, or the manifest's fallbackIcon when
 * the skill key isn't defined). Unloaded registry falls back to the
 * in-tree `SKILL_ICONS` constant + the legacy module's `fallbackIcon`.
 *
 * Centralized so HUD, XP-drop overlay, skill-panel rows, etc. share
 * the same lookup semantics — keeps the deletion of the legacy
 * constant a one-place change when the substrate is ready.
 */
export function getEffectiveSkillIcon(skillKey: string): string {
  const key = skillKey.toLowerCase();
  if (skillIconsRegistry.isLoaded()) {
    return skillIconsRegistry.hasDefinition(key)
      ? skillIconsRegistry.definition(key).icon
      : skillIconsRegistry.fallbackIcon;
  }
  return SKILL_ICONS[key] ?? legacyManifest.fallbackIcon;
}

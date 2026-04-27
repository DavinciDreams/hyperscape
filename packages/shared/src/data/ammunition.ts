/**
 * Ammunition Manifest — MANIFEST FAÇADE
 *
 * As of Phase A11 of PLAN_WORLD_STUDIO_AAA_COMPLETION.md, bow tier
 * requirements and arrow data live in `ammunition.json`, validated at
 * module load time against `AmmunitionManifestSchema` from
 * `@hyperforge/manifest-schema`.
 *
 * Defines bow tiers and arrow data for ranged combat.
 * F2P scope: standard arrows only (no bolts, no thrown weapons).
 * @see
 *
 * **Hot-reload**: `BOW_TIERS` and `ARROW_DATA` are mutable maps with
 * stable top-level references. `hotReloadAmmunition(manifest)` clears
 * all keys and re-populates from a new manifest so `AmmunitionService`
 * callers that read via `ARROW_DATA[id]` / `BOW_TIERS[id]` at lookup
 * time pick up editor edits without re-importing. No caller caches
 * the inner `ArrowData` objects by reference.
 */

import {
  AmmunitionManifestSchema,
  type AmmunitionManifest,
} from "@hyperforge/manifest-schema";

import { ammunitionRegistry } from "../ammunition/index.js";

import ammunitionManifestJson from "./ammunition.json" with { type: "json" };

export interface ArrowData {
  id: string;
  name: string;
  rangedStrength: number;
  requiredRangedLevel: number;
  requiredBowTier: number;
}

/**
 * Bow tier requirements for arrows.
 * Maps bow ID to its tier level — arrows require a bow of equal or higher tier.
 */
export const BOW_TIERS: Record<string, number> = {};

/**
 * Arrow strength bonuses and requirements.
 * F2P scope: standard arrows only (no bolts, no thrown weapons).
 */
export const ARROW_DATA: Record<string, ArrowData> = {};

function rebuildAmmunition(manifest: AmmunitionManifest): void {
  // Clear in-place — callers read through `BOW_TIERS[id]` /
  // `ARROW_DATA[id]` at lookup time, so the stable top-level reference
  // is what matters. Replacing the maps themselves would force every
  // consumer to re-import.
  for (const key of Object.keys(BOW_TIERS)) delete BOW_TIERS[key];
  for (const key of Object.keys(ARROW_DATA)) delete ARROW_DATA[key];

  for (const [bowId, tier] of Object.entries(manifest.bowTiers)) {
    BOW_TIERS[bowId] = tier;
  }
  for (const [arrowId, entry] of Object.entries(manifest.arrows)) {
    ARROW_DATA[arrowId] = {
      id: entry.id,
      name: entry.name,
      rangedStrength: entry.rangedStrength,
      requiredRangedLevel: entry.requiredRangedLevel,
      requiredBowTier: entry.requiredBowTier,
    };
  }
  // Mirror into the runtime ammunitionRegistry so future ranged-combat
  // consumers (shot-gate dispatcher, arrow-tier UI) hit the registry-
  // prefer branch in production. No system reads through the registry
  // yet (greenfield consumer queue), but landing the boot-load
  // alongside the legacy maps means the wiring is ready when consumers
  // arrive — no follow-up DataManager change required.
  ammunitionRegistry.load(manifest);
}

// Initial load — module-level parse + rebuild. Happens once on import.
rebuildAmmunition(AmmunitionManifestSchema.parse(ammunitionManifestJson));

/**
 * Swap in a new ammunition manifest at runtime — used by
 * `PIEEditorSession.updateManifests` for editor hot-reload.
 *
 * Zod-validates the input; on failure the current `BOW_TIERS` /
 * `ARROW_DATA` state is retained and the error bubbles to the caller.
 */
export function hotReloadAmmunition(manifest: AmmunitionManifest): void {
  rebuildAmmunition(AmmunitionManifestSchema.parse(manifest));
}

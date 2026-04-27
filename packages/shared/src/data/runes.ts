/**
 * Rune Data — MANIFEST FAÇADE
 *
 * As of Phase A11 of PLAN_WORLD_STUDIO_AAA_COMPLETION.md, rune metadata
 * and elemental staff mappings live in `runes.json`, validated at
 * module load time against `RunesManifestSchema` from
 * `@hyperforge/manifest-schema`.
 *
 * This TS file preserves the exact legacy export shape
 * (`ELEMENTAL_STAVES`, `RUNE_NAMES`, `VALID_RUNES`) so the existing
 * consumers (`RuneService`, `DuelOrchestrator`, the `@hyperforge/shared`
 * public barrel) don't have to change.
 *
 * The exported maps/array references themselves are stable; their
 * contents are rebuilt in-place by `hotReloadRunes()` (Phase B3.1e) so
 * the editor's PIE session can swap manifests without a Stop → Play
 * cycle. They are intentionally NOT `Object.freeze`d so the hot-reload
 * path can clear and refill them.
 *
 * @see
 */

import {
  RunesManifestSchema,
  type RunesManifest,
} from "@hyperforge/manifest-schema";

import { runesRegistry } from "../runes/index.js";

import runesManifestJson from "./runes.json" with { type: "json" };

/**
 * Elemental staff → rune ids map. Built at module load from the
 * manifest's `elementalStaves` array.
 */
export const ELEMENTAL_STAVES: Record<string, string[]> = {};

/** Human-readable rune names for UI display */
export const RUNE_NAMES: Record<string, string> = {};

/** All valid rune IDs, ordered as listed in the manifest */
export const VALID_RUNES: string[] = [];

function rebuildFromManifest(manifest: RunesManifest): void {
  for (const k of Object.keys(ELEMENTAL_STAVES)) delete ELEMENTAL_STAVES[k];
  for (const entry of manifest.elementalStaves) {
    ELEMENTAL_STAVES[entry.staffId] = [...entry.providesInfinite];
  }

  for (const k of Object.keys(RUNE_NAMES)) delete RUNE_NAMES[k];
  for (const rune of manifest.runes) {
    // Preserve legacy pluralized form ("Air runes" vs "Air rune")
    RUNE_NAMES[rune.id] = rune.name.endsWith("s") ? rune.name : `${rune.name}s`;
  }

  VALID_RUNES.length = 0;
  for (const rune of manifest.runes) VALID_RUNES.push(rune.id);

  // Mirror into the runtime runesRegistry so RuneService's
  // registry-prefer branch (added 2026-04-24) actually fires in
  // production. Without this the legacy ELEMENTAL_STAVES/RUNE_NAMES/
  // VALID_RUNES would still work (consumers would fall through), but
  // the PIE-hot-reload path wouldn't carry through to the registry.
  runesRegistry.load(manifest);
}

// Initial load — schema-validated at module load so bad JSON fails fast.
rebuildFromManifest(RunesManifestSchema.parse(runesManifestJson));

/**
 * Hot-reload runes from the editor's PIE session (Phase B3). Validates
 * the manifest; on success, clears and refills the exported maps/array
 * in-place so all existing consumers see the new values on their next
 * read without needing to re-import. Throws (and leaves prior state
 * intact) if the manifest fails schema validation.
 */
export function hotReloadRunes(manifest: RunesManifest): void {
  rebuildFromManifest(RunesManifestSchema.parse(manifest));
}

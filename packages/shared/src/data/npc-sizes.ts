/**
 * NPC Size Data — MANIFEST FAÇADE
 *
 * As of Phase A11 of PLAN_WORLD_STUDIO_AAA_COMPLETION.md, NPC
 * collision footprints live in `npc-sizes.json`, validated at module
 * load time against `NPCSizesManifestSchema` from
 * `@hyperforge/manifest-schema`.
 *
 * Most NPCs are 1×1 tiles. Bosses occupy larger footprints.
 * @see https://oldschool.runescape.wiki/w/Non-player_character
 *
 * **Hot-reload**: `NPC_SIZES` is a mutable `Record<string, NPCSize>`
 * with a stable top-level reference. `hotReloadNPCSizes(manifest)`
 * clears all keys and re-populates from a new manifest so callers
 * that read via `NPC_SIZES[id]` at lookup time (e.g., `RangeSystem`,
 * `LargeNPCSupport`) pick up editor edits without re-importing. No
 * caller caches the inner `NPCSize` objects by reference.
 */

import {
  NPCSizesManifestSchema,
  type NPCSizesManifest,
} from "@hyperforge/manifest-schema";

import { npcSizesRegistry } from "../npc-sizes/index.js";

import npcSizesManifestJson from "./npc-sizes.json" with { type: "json" };

export interface NPCSize {
  width: number;
  depth: number;
}

export const NPC_SIZES: Record<string, NPCSize> = {};

function rebuildNPCSizes(manifest: NPCSizesManifest): void {
  // Clear in-place — callers read through `NPC_SIZES[id]` at lookup
  // time, so the stable top-level reference is what matters. Replacing
  // the map itself would force every consumer to re-import.
  for (const key of Object.keys(NPC_SIZES)) delete NPC_SIZES[key];
  for (const [npcId, size] of Object.entries(manifest.sizes)) {
    NPC_SIZES[npcId] = { width: size.width, depth: size.depth };
  }
  // Mirror into the runtime npcSizesRegistry so RangeSystem.getNPCSize
  // and LargeNPCSupport.getNPCSize hit the registry-prefer branch in
  // production — not just after a PIE edit.
  npcSizesRegistry.load(manifest);
}

// Initial load — module-level parse + rebuild. Happens once on import.
rebuildNPCSizes(NPCSizesManifestSchema.parse(npcSizesManifestJson));

/**
 * Swap in a new NPC size manifest at runtime — used by
 * `PIEEditorSession.updateManifests` for editor hot-reload.
 *
 * Zod-validates the input; on failure the current `NPC_SIZES` state
 * is retained and the error bubbles to the caller.
 */
export function hotReloadNPCSizes(manifest: NPCSizesManifest): void {
  rebuildNPCSizes(NPCSizesManifestSchema.parse(manifest));
}

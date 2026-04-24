/**
 * NPC → authored-dialogue-tree-id bindings manifest.
 *
 * Pairs an NPC id (same key `DialogueSystem` consults when resolving
 * an interaction) with the id of a tree inside the authored
 * `DialogueManifest`. Shipped as a companion manifest to `dialogue.json`
 * so an NPC's binding can be edited, hot-reloaded, and versioned
 * independently without reshaping the dialogue library itself.
 *
 * Cross-manifest integrity (every `treeId` resolves to a tree in the
 * loaded dialogue manifest) is validated at install/resolve time, not
 * at schema-parse time, because the dialogue manifest isn't visible
 * from this schema's scope — `DialogueSystem.resolveAuthoredTreeIdForNpc`
 * already returns `null` for stale references so bindings can survive
 * a temporarily-absent tree.
 */

import { z } from "zod";

/**
 * `Record<npcId, treeId>`.
 *
 * Both sides are required non-empty strings; a missing npcId key falls
 * through to the legacy `NPCDialogueTree` embedded in `npcs.json`, so
 * an empty mapping is not an error.
 */
export const NpcDialogueBindingsManifestSchema = z.record(
  z.string().min(1),
  z.string().min(1),
);
export type NpcDialogueBindingsManifest = z.infer<
  typeof NpcDialogueBindingsManifestSchema
>;

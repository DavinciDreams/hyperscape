/**
 * Tools manifest schema.
 *
 * Covers `packages/server/world/assets/manifests/tools.json` — the catalog
 * of tools used by gathering skills (hatchets, pickaxes, fishing gear) and
 * their skill/tier/priority metadata.
 *
 * `tier` is intentionally a free-form string — it mixes canonical metal
 * names (`bronze`, `iron`, `steel`, `mithril`, `adamant`, `rune`, `dragon`,
 * `crystal`) with fishing-specific tiers (`net`, `standard`, `fly`,
 * `barbarian`). A GameMode can add new tiers without a schema update.
 */

import { z } from "zod";

export const ToolEntrySchema = z.object({
  itemId: z.string().min(1),
  skill: z.enum(["woodcutting", "mining", "fishing"]),
  tier: z.string().min(1),
  levelRequired: z.number().int().positive(),
  priority: z
    .number()
    .int()
    .nonnegative()
    .describe("Higher = preferred when auto-selecting best tool"),
  rollTicks: z
    .number()
    .int()
    .positive()
    .nullable()
    .optional()
    .describe("Optional custom roll tick interval (fishing)"),
  bonusRollTicks: z
    .number()
    .int()
    .positive()
    .nullable()
    .optional()
    .describe("Optional bonus-roll tick interval (fishing)"),
  bonusTickChance: z
    .number()
    .min(0)
    .max(1)
    .nullable()
    .optional()
    .describe("Optional chance for bonus-roll to fire (fishing)"),
});
export type ToolEntry = z.infer<typeof ToolEntrySchema>;

/** The manifest JSON is a bare array. */
export const ToolsManifestSchema = z.array(ToolEntrySchema);
export type ToolsManifest = z.infer<typeof ToolsManifestSchema>;

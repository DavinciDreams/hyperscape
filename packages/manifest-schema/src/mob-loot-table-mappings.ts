/**
 * Mob → loot-table-id mappings manifest.
 *
 * Pairs a `mobType` (same key `LootSystem.handleMobDeath` consults) with
 * a `tableId` defined inside the `LootTablesManifest`. Shipped as a
 * companion manifest to `loot-tables.json` so the two can be edited,
 * hot-reloaded, and versioned independently without reshaping the loot
 * library itself.
 *
 * Cross-manifest integrity (every `tableId` resolves to an entry in the
 * loaded loot-tables manifest) is validated at install time, not at
 * schema-parse time, because the loot-tables manifest isn't visible
 * from this schema's scope.
 */

import { z } from "zod";

/**
 * `Record<mobType, tableId>`.
 *
 * Both sides are required non-empty strings; the runtime falls back to
 * the legacy `LootTableService` path when a `mobType` has no entry
 * here, so a missing key is not an error.
 */
export const MobLootTableMappingsManifestSchema = z.record(
  z.string().min(1),
  z.string().min(1),
);
export type MobLootTableMappingsManifest = z.infer<
  typeof MobLootTableMappingsManifestSchema
>;

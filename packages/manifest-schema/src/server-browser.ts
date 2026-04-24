/**
 * Server-browser manifest schema.
 *
 * Authored policy for the in-game server/realm browser: which
 * filter facets to expose, default sort order, displayed columns,
 * favorite/history caps, and refresh cadence.
 *
 * Scope-isolated from:
 *   - `deploy-targets.ts` (real URLs/endpoints — the browser
 *     asks the backend by name; names live there)
 *   - `matchmaking-tuning.ts` (automatic matchmaking — the
 *     server browser is the *manual* counterpart)
 *   - `region-preferences.ts` / future region schemas (ISO codes
 *     may be referenced; rules live here for display)
 */

import { z } from "zod";

const Id = z
  .string()
  .regex(/^[a-z][a-zA-Z0-9_-]*$/, "id must be lowerCamelCase ASCII identifier");

/** Filter facet kinds. */
export const FilterFacetKindSchema = z.enum([
  "textSearch",
  "region",
  "gameMode",
  "playerCountRange",
  "pingRange",
  "privacy",
  "mods",
  "version",
  "custom",
]);
export type FilterFacetKind = z.infer<typeof FilterFacetKindSchema>;

/** One filter facet configuration. */
export const FilterFacetSchema = z
  .object({
    id: Id,
    kind: FilterFacetKindSchema,
    labelLocalizationKey: z.string().min(1),
    /** Default state — "on" means it's pre-applied. */
    enabledByDefault: z.boolean().default(false),
    /** Custom facet key (required iff kind='custom'). */
    customKey: z.string().default(""),
    /** Display order in UI. */
    displayOrder: z.number().int().min(0).max(10000).default(0),
  })
  .strict()
  .refine((f) => f.kind !== "custom" || f.customKey.length > 0, {
    message: "custom facet requires customKey",
    path: ["customKey"],
  });
export type FilterFacet = z.infer<typeof FilterFacetSchema>;

/** Sort column kinds. */
export const SortColumnSchema = z.enum([
  "name",
  "ping",
  "playerCount",
  "playerCapacity",
  "region",
  "gameMode",
  "uptime",
  "version",
  "favorite",
]);
export type SortColumn = z.infer<typeof SortColumnSchema>;

/** Sort direction. */
export const SortDirectionSchema = z.enum(["ascending", "descending"]);
export type SortDirection = z.infer<typeof SortDirectionSchema>;

/** Displayed column configuration. */
export const ColumnDefinitionSchema = z
  .object({
    column: SortColumnSchema,
    labelLocalizationKey: z.string().min(1),
    visibleByDefault: z.boolean().default(true),
    /** Preferred width in CSS px (0 = flex). */
    widthPx: z.number().int().min(0).max(2000).default(0),
    /** Display order. */
    displayOrder: z.number().int().min(0).max(1000).default(0),
  })
  .strict();
export type ColumnDefinition = z.infer<typeof ColumnDefinitionSchema>;

/** Cap/cadence rules. */
export const ListRulesSchema = z
  .object({
    /** Max results returned per query (0 = server decides). */
    maxResults: z.number().int().min(0).max(10000).default(200),
    /** Auto-refresh interval in seconds (0 = manual only). */
    autoRefreshIntervalSec: z.number().int().min(0).max(3600).default(30),
    /** Max favorite servers a player can save. */
    maxFavorites: z.number().int().min(0).max(1000).default(20),
    /** Max history entries retained. */
    maxHistoryEntries: z.number().int().min(0).max(1000).default(50),
    /** Ping threshold (ms) considered "good" (green). */
    pingGoodMs: z.number().int().min(0).max(1000).default(80),
    /** Ping threshold (ms) considered "ok" (yellow). */
    pingOkMs: z.number().int().min(0).max(2000).default(200),
  })
  .strict()
  .refine((r) => r.pingOkMs > r.pingGoodMs, {
    message: "pingOkMs must be > pingGoodMs",
    path: ["pingOkMs"],
  });
export type ListRules = z.infer<typeof ListRulesSchema>;

/** Top-level server-browser manifest. */
export const ServerBrowserManifestSchema = z
  .object({
    enabled: z.boolean().default(true),
    filters: z.array(FilterFacetSchema).default([]),
    columns: z.array(ColumnDefinitionSchema).default([]),
    list: ListRulesSchema.default(() => ListRulesSchema.parse({})),
    defaultSortColumn: SortColumnSchema.default("ping"),
    defaultSortDirection: SortDirectionSchema.default("ascending"),
    /** Allow password-protected server entries. */
    allowPasswordProtected: z.boolean().default(true),
    /** Allow direct IP-connect (no browser listing). */
    allowDirectConnect: z.boolean().default(false),
  })
  .strict()
  .refine(
    (m) => new Set(m.filters.map((f) => f.id)).size === m.filters.length,
    { message: "filter ids must be unique", path: ["filters"] },
  )
  .refine(
    (m) => new Set(m.columns.map((c) => c.column)).size === m.columns.length,
    { message: "column kinds must be unique", path: ["columns"] },
  );
export type ServerBrowserManifest = z.infer<typeof ServerBrowserManifestSchema>;

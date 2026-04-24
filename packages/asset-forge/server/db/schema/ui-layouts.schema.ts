/**
 * UI Layouts Schema
 * Stores standalone UI layout manifests authored in the World Studio
 * UI Layout Editor. Follows the UE5 "asset editor" pattern — each
 * layout is a content asset that lives in the project, can be
 * referenced by id from game code, and is edited in its own editor.
 *
 * A UI layout is always team-owned and optionally scoped to a single
 * gameId (matching how scripts.schema scopes graphs). Game code
 * references layouts by `{ layoutId }`; the full UILayoutManifest JSON
 * lives in this table.
 */

import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  jsonb,
  unique,
  index,
} from "drizzle-orm/pg-core";

import { teams } from "./teams.schema";
import { forgeUsers } from "./forge-users.schema";

/**
 * UI Layouts table
 * Each row is a standalone named UILayoutManifest validated by
 * `UILayoutManifestSchema` on insert/update.
 */
export const uiLayouts = pgTable(
  "ui_layouts",
  {
    id: text("id").primaryKey(), // e.g. "uilayout_1713100000000_a1b2c3"

    // Ownership / scoping — same pattern as scripts.schema.
    teamId: uuid("team_id")
      .references(() => teams.id, { onDelete: "cascade" })
      .notNull(),
    // Optional game / project scope. `null` = team-wide (library).
    gameId: text("game_id"),

    // Identity
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    version: text("version").notNull().default("1.0.0"),

    // Full UILayoutManifest JSON
    manifestData: jsonb("manifest_data").notNull(),

    // Flags
    isTemplate: boolean("is_template").notNull().default(false),
    isPublic: boolean("is_public").notNull().default(false),

    // Metadata
    createdBy: uuid("created_by").references(() => forgeUsers.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    // Slugs unique within a (team, gameId) bucket — matches scripts.
    teamGameSlugUnique: unique("ui_layouts_team_game_slug_unique").on(
      table.teamId,
      table.gameId,
      table.slug,
    ),
    teamIdx: index("idx_ui_layouts_team").on(table.teamId),
    gameIdx: index("idx_ui_layouts_game").on(table.gameId),
    publicIdx: index("idx_ui_layouts_public").on(table.isPublic),
    templateIdx: index("idx_ui_layouts_template").on(table.isTemplate),
  }),
);

// Type exports
export type UILayoutRow = typeof uiLayouts.$inferSelect;
export type NewUILayoutRow = typeof uiLayouts.$inferInsert;

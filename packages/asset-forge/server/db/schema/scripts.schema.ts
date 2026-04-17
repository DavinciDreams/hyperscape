/**
 * Scripts Schema
 * Stores standalone script graphs (visual scripting / node graphs) that can
 * be referenced by world entities, reused across projects, and shared as
 * public templates.
 *
 * A script lives at one of three visibility tiers:
 *  - team private (default) — `teamId` set, `isPublic = false`
 *  - public library         — `isPublic = true`
 *  - template               — `isTemplate = true`, also public by convention
 *
 * Scripts are referenced from `worldProjects.worldData` entities via
 * `scriptRef: { scriptId, version }`. The full graph JSON lives here; the
 * project only stores the pointer + override variables.
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
 * Scripts table
 * Each row is a standalone named script graph validated by
 * `scriptGraphValidator` on insert/update.
 */
export const scripts = pgTable(
  "scripts",
  {
    id: text("id").primaryKey(), // e.g. "script_1713100000000_a1b2c3"

    // Ownership / scoping
    teamId: uuid("team_id")
      .references(() => teams.id, { onDelete: "cascade" })
      .notNull(),
    // Optional game-module / project scope. `null` = team-wide.
    gameId: text("game_id"),

    // Identity
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    version: text("version").notNull().default("1.0.0"),

    // Full RuntimeScriptGraph JSON
    graphData: jsonb("graph_data").notNull(),

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
    // Scope slugs uniquely within a team+game bucket
    teamGameSlugUnique: unique("scripts_team_game_slug_unique").on(
      table.teamId,
      table.gameId,
      table.slug,
    ),
    teamIdx: index("idx_scripts_team").on(table.teamId),
    gameIdx: index("idx_scripts_game").on(table.gameId),
    publicIdx: index("idx_scripts_public").on(table.isPublic),
    templateIdx: index("idx_scripts_template").on(table.isTemplate),
  }),
);

// Type exports
export type ScriptRow = typeof scripts.$inferSelect;
export type NewScriptRow = typeof scripts.$inferInsert;

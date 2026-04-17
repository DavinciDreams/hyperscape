/**
 * Game Modules Schema
 * Stores custom GameModule definitions (JSON) per team.
 * Built-in modules (e.g. Hyperscape) are NOT stored in this table — they are
 * returned as synthetic entries by the API.
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
 * Game Modules table
 * Each row holds the full JSON definition of a GameModule, validated by
 * loadGameModule() before insert/update.
 */
export const gameModules = pgTable(
  "game_modules",
  {
    id: text("id").primaryKey(), // e.g. "module_1713100000000_a1b2c3"

    // Ownership
    teamId: uuid("team_id")
      .references(() => teams.id, { onDelete: "cascade" })
      .notNull(),

    // Identity
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    version: text("version").notNull().default("1.0.0"),

    // Full GameModule JSON
    moduleData: jsonb("module_data").notNull(),

    // Built-in flag (always false for DB rows; true only for synthetic entries)
    isBuiltin: boolean("is_builtin").notNull().default(false),

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
    teamSlugUnique: unique("game_modules_team_slug_unique").on(
      table.teamId,
      table.slug,
    ),
    teamIdx: index("idx_game_modules_team").on(table.teamId),
  }),
);

// Type exports
export type GameModuleRow = typeof gameModules.$inferSelect;
export type NewGameModuleRow = typeof gameModules.$inferInsert;

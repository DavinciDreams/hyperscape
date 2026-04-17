/**
 * Teams & Games Schema
 * Organizations and their game projects
 */

import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  unique,
  jsonb,
} from "drizzle-orm/pg-core";

import { forgeUsers } from "./forge-users.schema";

/**
 * Teams table
 * Organizations that own games and world projects
 */
export const teams = pgTable("teams", {
  id: uuid("id").defaultRandom().primaryKey(),

  // Identity
  name: text("name").notNull(),
  slug: text("slug").unique().notNull(),
  description: text("description"),
  avatarUrl: text("avatar_url"),

  // Ownership
  createdBy: uuid("created_by").references(() => forgeUsers.id),

  // Plan & AI budget
  plan: text("plan").notNull().default("free"), // 'free' | 'pro' | 'enterprise'
  aiBudgetMonthlyCents: integer("ai_budget_monthly_cents")
    .notNull()
    .default(5000), // $50 default
  aiSpentThisMonthCents: integer("ai_spent_this_month_cents")
    .notNull()
    .default(0),

  // Timestamps
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Games table
 * A team can have multiple games, each with its own staging + production servers
 */
export const games = pgTable(
  "games",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // Ownership
    teamId: uuid("team_id")
      .references(() => teams.id)
      .notNull(),

    // Identity
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),

    // Game module reference (default: Hyperscape built-in module)
    moduleId: text("module_id").notNull().default("hyperscape"),

    /**
     * GameMode manifest (UE5-inspired player controller / camera / input /
     * pawn selection). Resolved at runtime by `gameModeRegistry`. Defaults
     * on insert to the Hyperscape manifest via the `game_mode` server
     * default; schema-level default lives in the migration because Drizzle
     * JSON defaults on insert require a SQL literal.
     *
     * Shape: `{ playerController, camera, inputContext, pawn }` — all
     * strings, each validated against the registry's registered ids at the
     * route layer (see `server/utils/gameModeRegistry.ts`).
     */
    gameMode: jsonb("game_mode")
      .$type<{
        playerController: string;
        camera: string;
        inputContext: string;
        pawn: string;
      }>()
      .notNull(),

    // Server connection info
    stagingServerUrl: text("staging_server_url"),
    stagingAssetsPath: text("staging_assets_path"),
    productionServerUrl: text("production_server_url"),
    productionAssetsPath: text("production_assets_path"),
    stagingAdminCode: text("staging_admin_code"),
    productionAdminCode: text("production_admin_code"),

    // Timestamps
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    teamSlugUnique: unique("games_team_slug_unique").on(
      table.teamId,
      table.slug,
    ),
  }),
);

// Type exports
export type Team = typeof teams.$inferSelect;
export type NewTeam = typeof teams.$inferInsert;
export type Game = typeof games.$inferSelect;
export type NewGame = typeof games.$inferInsert;

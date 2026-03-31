/**
 * World Projects & Deployments Schema
 * Server-persisted world project data with staging → production deployment tracking
 */

import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

import { forgeUsers } from "./forge-users.schema";
import { teams } from "./teams.schema";
import { games } from "./teams.schema";

/**
 * World Projects table
 * Stores the full world project state (world_data JSONB) with optimistic locking
 */
export const worldProjects = pgTable(
  "world_projects",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // Ownership
    teamId: uuid("team_id")
      .references(() => teams.id)
      .notNull(),
    gameId: uuid("game_id")
      .references(() => games.id)
      .notNull(),

    // Identity
    name: text("name").notNull(),
    description: text("description"),

    // Versioning
    version: integer("version").notNull().default(1),
    createdBy: uuid("created_by").references(() => forgeUsers.id),

    // World state (full WorldBuilderContext serialized)
    worldData: jsonb("world_data").notNull(),

    // Snapshot of all 38 manifest files at save time
    manifestSnapshot: jsonb("manifest_snapshot"),

    // Optimistic lock
    lockedBy: uuid("locked_by").references(() => forgeUsers.id),
    lockedAt: timestamp("locked_at", { withTimezone: true }),

    // Timestamps
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    teamGameIdx: index("idx_projects_team_game").on(table.teamId, table.gameId),
    updatedIdx: index("idx_projects_updated").on(table.updatedAt),
  }),
);

/**
 * World Deployments table
 * Records each deployment to staging or production with diffs and rollback data
 */
export const worldDeployments = pgTable(
  "world_deployments",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // References
    projectId: uuid("project_id")
      .references(() => worldProjects.id)
      .notNull(),
    gameId: uuid("game_id")
      .references(() => games.id)
      .notNull(),

    // Deployment info
    target: text("target").notNull(), // 'staging' | 'production'
    version: integer("version").notNull(),

    // Diffs for review
    manifestDiff: jsonb("manifest_diff"),
    assetDiff: jsonb("asset_diff"),

    // Audit
    deployedBy: uuid("deployed_by").references(() => forgeUsers.id),
    approvedBy: uuid("approved_by").references(() => forgeUsers.id), // Required for prod

    // Rollback support
    rollbackData: jsonb("rollback_data"),

    // Timestamps
    deployedAt: timestamp("deployed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    projectIdx: index("idx_deployments_project").on(
      table.projectId,
      table.deployedAt,
    ),
    gameTargetIdx: index("idx_deployments_game_target").on(
      table.gameId,
      table.target,
      table.deployedAt,
    ),
  }),
);

// Type exports
export type WorldProject = typeof worldProjects.$inferSelect;
export type NewWorldProject = typeof worldProjects.$inferInsert;
export type WorldDeployment = typeof worldDeployments.$inferSelect;
export type NewWorldDeployment = typeof worldDeployments.$inferInsert;

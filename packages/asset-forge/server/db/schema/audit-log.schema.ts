/**
 * Audit Log Schema
 * Tracks all significant actions for compliance and debugging
 */

import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

import { forgeUsers } from "./forge-users.schema";
import { teams } from "./teams.schema";
import { games } from "./teams.schema";

/**
 * Audit Log table
 * Records project saves, staging pushes, production promotions, team changes, etc.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // References (nullable — some actions are system-level)
    teamId: uuid("team_id").references(() => teams.id),
    gameId: uuid("game_id").references(() => games.id),
    userId: uuid("user_id").references(() => forgeUsers.id),

    // Action details
    action: text("action").notNull(), // 'project:save', 'staging:push', 'prod:promote', etc.
    targetType: text("target_type"), // 'project', 'manifest', 'asset', 'team_member'
    targetId: text("target_id"),
    details: jsonb("details"), // Action-specific metadata

    // Timestamps
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    teamIdx: index("idx_audit_team").on(table.teamId, table.createdAt),
    userIdx: index("idx_audit_user").on(table.userId, table.createdAt),
  }),
);

// Type exports
export type AuditLogEntry = typeof auditLog.$inferSelect;
export type NewAuditLogEntry = typeof auditLog.$inferInsert;

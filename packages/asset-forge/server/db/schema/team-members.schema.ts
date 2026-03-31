/**
 * Team Members, Invites & Permissions Schema
 * Team membership, invitation flow, and granular permission overrides
 */

import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  unique,
  index,
} from "drizzle-orm/pg-core";

import { forgeUsers } from "./forge-users.schema";
import { teams } from "./teams.schema";

/**
 * Team Members table
 * Links users to teams with roles
 */
export const teamMembers = pgTable(
  "team_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // References
    teamId: uuid("team_id")
      .references(() => teams.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id")
      .references(() => forgeUsers.id, { onDelete: "cascade" })
      .notNull(),

    // Role: 'owner' | 'admin' | 'editor' | 'viewer'
    role: text("role").notNull().default("viewer"),

    // Metadata
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    invitedBy: uuid("invited_by").references(() => forgeUsers.id),
  },
  (table) => ({
    teamUserUnique: unique("team_members_team_user_unique").on(
      table.teamId,
      table.userId,
    ),
    userIdx: index("idx_team_members_user").on(table.userId),
  }),
);

/**
 * Team Invites table
 * Pending invitations to join a team
 */
export const teamInvites = pgTable(
  "team_invites",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // References
    teamId: uuid("team_id")
      .references(() => teams.id, { onDelete: "cascade" })
      .notNull(),

    // Invite details
    email: text("email").notNull(),
    role: text("role").notNull().default("viewer"),
    invitedBy: uuid("invited_by").references(() => forgeUsers.id),
    token: text("token").unique().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  },
  (table) => ({
    teamEmailUnique: unique("team_invites_team_email_unique").on(
      table.teamId,
      table.email,
    ),
    tokenIdx: index("idx_invites_token").on(table.token),
    emailIdx: index("idx_invites_email").on(table.email, table.teamId),
  }),
);

/**
 * Team Permissions table
 * Granular permission overrides on top of role defaults
 */
export const teamPermissions = pgTable(
  "team_permissions",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // References
    teamId: uuid("team_id")
      .references(() => teams.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id")
      .references(() => forgeUsers.id, { onDelete: "cascade" })
      .notNull(),

    // Permission
    permission: text("permission").notNull(),
    granted: boolean("granted").notNull().default(true),
    grantedBy: uuid("granted_by").references(() => forgeUsers.id),
    grantedAt: timestamp("granted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    teamUserPermUnique: unique("team_permissions_unique").on(
      table.teamId,
      table.userId,
      table.permission,
    ),
  }),
);

// Type exports
export type TeamMember = typeof teamMembers.$inferSelect;
export type NewTeamMember = typeof teamMembers.$inferInsert;
export type TeamInvite = typeof teamInvites.$inferSelect;
export type NewTeamInvite = typeof teamInvites.$inferInsert;
export type TeamPermission = typeof teamPermissions.$inferSelect;
export type NewTeamPermission = typeof teamPermissions.$inferInsert;

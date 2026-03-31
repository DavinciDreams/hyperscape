/**
 * Database Schema Index
 * Exports all schema tables and types
 */

// Assets
export * from "./assets.schema";

// World Studio — Accounts & Teams
export * from "./forge-users.schema";
export * from "./teams.schema";
export * from "./team-members.schema";

// World Studio — Projects & Deployments
export * from "./world-projects.schema";

// World Studio — Audit
export * from "./audit-log.schema";

// Re-export everything for drizzle
import * as assetsSchema from "./assets.schema";
import * as forgeUsersSchema from "./forge-users.schema";
import * as teamsSchema from "./teams.schema";
import * as teamMembersSchema from "./team-members.schema";
import * as worldProjectsSchema from "./world-projects.schema";
import * as auditLogSchema from "./audit-log.schema";

export const schema = {
  ...assetsSchema,
  ...forgeUsersSchema,
  ...teamsSchema,
  ...teamMembersSchema,
  ...worldProjectsSchema,
  ...auditLogSchema,
};

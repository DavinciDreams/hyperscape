/**
 * Handler Helper Functions (server package portion)
 *
 * Pure helpers (socket, session, entity-position utilities) have been relocated
 * to `packages/shared/src/systems/server/network/handlers/common/helpers.ts`
 * and are re-exported below for backward compatibility.
 *
 * Only DB-coupled helpers (`getDatabase`) remain in-file because they depend on
 * `pg`, `drizzle-orm`, and the server-local schema.
 *
 * Part of the ServerNetwork → @hyperforge/shared migration
 * (PLAN_SERVERNETWORK_MIGRATION.md Step 5b).
 */

import type { World } from "@hyperforge/shared";
import type { DatabaseConnection } from "./types";
import type pg from "pg";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "../../../../database/schema";

// ============================================================================
// RE-EXPORTED PURE HELPERS (relocated to shared)
// ============================================================================

export type {
  SessionInfo,
  EntityPosition,
} from "../../../../../../shared/src/systems/server/network/handlers/common/helpers";
export {
  getPlayerId,
  sendToSocket,
  sendErrorToast,
  sendSuccessToast,
  getSessionManager,
  hasActiveInterfaceSession,
  getEntityPosition,
} from "../../../../../../shared/src/systems/server/network/handlers/common/helpers";

// ============================================================================
// DB-COUPLED HELPERS (server-local)
// ============================================================================

/**
 * Get database connection from world object.
 * Returns null if database is not available.
 *
 * Stays in server because it depends on pg and drizzle-orm types bound to the
 * server-local schema.
 */
export function getDatabase(world: World): DatabaseConnection | null {
  const serverWorld = world as {
    pgPool?: pg.Pool;
    drizzleDb?: NodePgDatabase<typeof schema>;
  };

  if (serverWorld.drizzleDb && serverWorld.pgPool) {
    return {
      drizzle: serverWorld.drizzleDb,
      pool: serverWorld.pgPool,
    };
  }
  return null;
}

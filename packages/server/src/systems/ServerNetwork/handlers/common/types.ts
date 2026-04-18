/**
 * Handler Common Types (server package portion)
 *
 * Pure types (ValidationResult, TransactionSyncData) have been relocated to
 * `packages/shared/src/systems/server/network/handlers/common/types.ts` and
 * are re-exported below for backward compatibility.
 *
 * DB-coupled types (`DatabaseConnection`, `BaseHandlerContext`) remain in-file
 * because they depend on `pg`, `drizzle-orm`, and the server-local schema.
 *
 * Part of the ServerNetwork → @hyperforge/shared migration
 * (PLAN_SERVERNETWORK_MIGRATION.md Step 5b).
 */

import type { ServerSocket } from "../../../../shared/types";
import type { World, SessionType } from "@hyperforge/shared";
import type pg from "pg";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "../../../../database/schema";

// ============================================================================
// RE-EXPORTED PURE TYPES (relocated to shared)
// ============================================================================

export type {
  ValidationResult,
  TransactionSyncData,
} from "../../../../../../shared/src/systems/server/network/handlers/common/types";
export { isValidationSuccess } from "../../../../../../shared/src/systems/server/network/handlers/common/types";

// ============================================================================
// DATABASE (server-local)
// ============================================================================

/**
 * Database connection tuple used throughout handlers.
 * Both drizzle (ORM) and pool (raw queries) are available.
 */
export interface DatabaseConnection {
  readonly drizzle: NodePgDatabase<typeof schema>;
  readonly pool: pg.Pool;
}

// ============================================================================
// HANDLER CONTEXT (server-local)
// ============================================================================

/**
 * Base context created after common validation passes.
 * All transaction handlers receive this minimum context.
 *
 * Handlers extend this with operation-specific data:
 * - StoreBuyContext adds: store, storeItem, itemData, quantity, totalCost
 * - BankDepositContext adds: itemId, quantity
 */
export interface BaseHandlerContext {
  readonly playerId: string;
  readonly socket: ServerSocket;
  readonly world: World;
  readonly db: DatabaseConnection;
  readonly sessionType: SessionType;
}

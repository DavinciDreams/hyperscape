/**
 * Pure Handler Common Barrel (shared package portion)
 *
 * Re-exports only the pure (non-DB) common helpers and types.
 * DB-coupled utilities (validateTransactionRequest, executeSecureTransaction,
 * DatabaseConnection, BaseHandlerContext, getDatabase) remain in the server
 * package barrel at `packages/server/src/systems/ServerNetwork/handlers/common/`.
 */

export type { ValidationResult, TransactionSyncData } from "./types";
export { isValidationSuccess } from "./types";

export type { SessionInfo, EntityPosition } from "./helpers";
export {
  getPlayerId,
  sendToSocket,
  sendErrorToast,
  sendSuccessToast,
  getSessionManager,
  hasActiveInterfaceSession,
  getEntityPosition,
} from "./helpers";

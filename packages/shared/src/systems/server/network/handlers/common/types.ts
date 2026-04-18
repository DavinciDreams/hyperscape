/**
 * Pure Handler Common Types (shared package portion)
 *
 * Contains only types that do NOT depend on external systems (pg, drizzle,
 * database schema). DB-specific types (DatabaseConnection, BaseHandlerContext)
 * remain in the server package.
 *
 * Part of the ServerNetwork → @hyperforge/shared migration
 * (PLAN_SERVERNETWORK_MIGRATION.md Step 5b).
 */

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Result of a validation step.
 * Discriminated union ensures type-safe handling.
 *
 * Usage:
 * ```typescript
 * const result = validateSomething();
 * if (!result.success) {
 *   sendError(result.error);
 *   return;
 * }
 * // TypeScript knows result.context exists here
 * useContext(result.context);
 * ```
 */
export type ValidationResult<T> =
  | { readonly success: true; readonly context: T }
  | { readonly success: false; readonly error: string };

/**
 * Type guard for successful validation.
 * Useful when you need an explicit check.
 */
export function isValidationSuccess<T>(
  result: ValidationResult<T>,
): result is { success: true; context: T } {
  return result.success === true;
}

// ============================================================================
// TRANSACTION SYNC
// ============================================================================

/**
 * Data needed to sync in-memory InventorySystem after transaction.
 * Populated during transaction execution, consumed by sync emitter.
 *
 * CRITICAL: All inventory-modifying transactions must populate this
 * to prevent cache/database desync bugs.
 */
export interface TransactionSyncData {
  readonly addedSlots?: ReadonlyArray<{
    readonly slot: number;
    readonly quantity: number;
    readonly itemId: string;
  }>;
  readonly removedSlots?: ReadonlyArray<{
    readonly slot: number;
    readonly quantity: number;
    readonly itemId: string;
  }>;
  readonly newCoinBalance?: number;
}

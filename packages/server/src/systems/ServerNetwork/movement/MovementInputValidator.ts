/**
 * @deprecated Re-export shim.
 *
 * Relocated to
 * `packages/shared/src/systems/server/network/movement/MovementInputValidator.ts`
 * as part of the ServerNetwork → @hyperforge/shared migration
 * (PLAN_SERVERNETWORK_MIGRATION.md Step 1 — zero-dep leaves).
 *
 * Delete this shim after Step 8.
 */

export {
  MovementInputValidator,
  MovementViolationSeverity,
} from "../../../../../shared/src/systems/server/network/movement/MovementInputValidator";
export type {
  ValidatedMovePayload,
  MoveRequestValidation,
} from "../../../../../shared/src/systems/server/network/movement/MovementInputValidator";

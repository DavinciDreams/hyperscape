/**
 * @deprecated Re-export shim.
 *
 * Relocated to
 * `packages/shared/src/systems/server/network/position-validator.ts` as part
 * of the ServerNetwork → @hyperforge/shared migration
 * (PLAN_SERVERNETWORK_MIGRATION.md Step 1 — zero-dep leaves).
 *
 * Uses `IBroadcastManager` (narrow interface in shared/interfaces.ts).
 * Delete this shim after Step 8.
 */

export { PositionValidator } from "../../../../shared/src/systems/server/network/position-validator";

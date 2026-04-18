/**
 * @deprecated Re-export shim.
 *
 * Relocated to
 * `packages/shared/src/systems/server/network/FollowManager.ts` as part of
 * the ServerNetwork → @hyperforge/shared migration
 * (PLAN_SERVERNETWORK_MIGRATION.md Step 1 — zero-dep leaves).
 *
 * Uses `ITileMovementManager` (narrow interface in shared/interfaces.ts) so
 * shared has no dependency on the concrete TileMovementManager implementation.
 * Delete this shim after Step 8.
 */

export { FollowManager } from "../../../../shared/src/systems/server/network/FollowManager";

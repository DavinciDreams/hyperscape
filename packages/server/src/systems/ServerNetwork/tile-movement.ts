/**
 * @deprecated Re-export shim.
 *
 * Relocated to
 * `packages/shared/src/systems/server/network/tile-movement.ts` as part of
 * the ServerNetwork → @hyperforge/shared migration
 * (PLAN_SERVERNETWORK_MIGRATION.md Step 1 — tile-movement cascade).
 *
 * The concrete TileMovementManager class now lives in shared and satisfies
 * the `ITileMovementManager` interface via structural typing.
 *
 * Delete this shim after Step 8.
 */

export { TileMovementManager } from "../../../../shared/src/systems/server/network/tile-movement";

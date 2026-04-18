/**
 * @deprecated Re-export shim.
 *
 * `FaceDirectionManager` relocated to
 * `packages/shared/src/systems/server/network/FaceDirectionManager.ts` as
 * part of the ServerNetwork → @hyperforge/shared migration
 * (PLAN_SERVERNETWORK_MIGRATION.md Step 1 — zero-dep leaves).
 *
 * Zero-dep: the only external dependencies are `quaternionPool`, `worldToTile`,
 * `getCardinalFaceDirection`, `getCardinalFaceAngle`, `TileCoord`,
 * `CardinalDirection`, and `World` — all already exported from shared index.
 * Delete this shim after Step 8.
 */

export { FaceDirectionManager } from "../../../../shared/src/systems/server/network/FaceDirectionManager";

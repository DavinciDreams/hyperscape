/**
 * @deprecated Re-export shim.
 *
 * Debug configuration relocated to
 * `packages/shared/src/systems/server/network/debug.ts` as part of the
 * ServerNetwork → @hyperforge/shared migration
 * (PLAN_SERVERNETWORK_MIGRATION.md Step 1 — zero-dep leaves).
 *
 * Delete this shim after Step 8.
 */

export {
  DEBUG_FACE_DIRECTION,
  DEBUG_PENDING_GATHER,
} from "../../../../shared/src/systems/server/network/debug";

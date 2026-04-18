/**
 * @deprecated Re-export shim.
 *
 * `ScriptQueue` relocated to
 * `packages/shared/src/systems/server/network/ScriptQueue.ts` as part of the
 * ServerNetwork → @hyperforge/shared migration
 * (PLAN_SERVERNETWORK_MIGRATION.md Step 1 — zero-dep leaves).
 *
 * Zero-dep: the only external dependencies are `ServerSocket` (already in
 * shared at `systems/server/network/server-types`) and `getCachedTimestamp`
 * (already in shared index). Delete this shim after Step 8.
 */

export {
  PlayerScriptQueue,
  NPCScriptQueue,
  ScriptPriority,
  ScriptType,
  type QueuedScript,
  type ModalState,
} from "../../../../shared/src/systems/server/network/ScriptQueue";

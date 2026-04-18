/**
 * @deprecated Re-export shim.
 *
 * Relocated to
 * `packages/shared/src/systems/server/network/action-queue.ts` as part of
 * the ServerNetwork → @hyperforge/shared migration
 * (PLAN_SERVERNETWORK_MIGRATION.md Step 1 — zero-dep leaves).
 *
 * Zero-dep: only depends on `ServerSocket` (shared/server-types) and
 * `getCachedTimestamp` (shared/index). Delete this shim after Step 8.
 */

export {
  ActionType,
  ActionPriority,
  ActionQueue,
  type QueuedAction,
} from "../../../../shared/src/systems/server/network/action-queue";

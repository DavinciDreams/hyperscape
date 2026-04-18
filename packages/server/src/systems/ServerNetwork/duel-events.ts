/**
 * @deprecated Re-export shim.
 *
 * Relocated to
 * `packages/shared/src/systems/server/network/duel-events.ts` as part of the
 * ServerNetwork → @hyperforge/shared migration
 * (PLAN_SERVERNETWORK_MIGRATION.md Step 1 — zero-dep leaves).
 *
 * Uses `IBroadcastManager` (narrow interface in shared/interfaces.ts) so
 * shared has no dependency on the concrete BroadcastManager transport.
 * Delete this shim after Step 8.
 */

export {
  registerDuelEventListeners,
  type DuelEventDeps,
} from "../../../../shared/src/systems/server/network/duel-events";

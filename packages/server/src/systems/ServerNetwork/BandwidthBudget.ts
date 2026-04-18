/**
 * @deprecated Re-export shim.
 *
 * `BandwidthBudget` relocated to
 * `packages/shared/src/systems/server/network/BandwidthBudget.ts` as part
 * of the engine/game separation (PLAN_SERVERNETWORK_MIGRATION.md Step 1).
 * Delete after Step 8.
 */

export {
  BandwidthBudget,
  PacketPriority,
} from "../../../../shared/src/systems/server/network/BandwidthBudget";

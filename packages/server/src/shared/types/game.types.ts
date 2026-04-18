/**
 * @deprecated Re-export shim.
 *
 * Game types relocated to
 * `packages/shared/src/systems/server/network/server-types.ts`
 * as part of the ServerNetwork → @hyperforge/shared migration
 * (PLAN_SERVERNETWORK_MIGRATION.md Step 5 prerequisite).
 *
 * Delete after Step 8.
 */

export type { WorldOptions } from "@hyperforge/shared";
export type {
  SpawnData,
  TerrainSystem,
  ResourceEntity,
  ResourceSystem,
  InventorySystemData,
  PlayerEntity,
  ServerStats,
  ChatMessage,
  ChatMessageType,
} from "../../../../shared/src/systems/server/network/server-types";

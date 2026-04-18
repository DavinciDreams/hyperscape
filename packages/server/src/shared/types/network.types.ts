/**
 * @deprecated Re-export shim.
 *
 * Network types relocated to
 * `packages/shared/src/systems/server/network/server-types.ts`
 * as part of the ServerNetwork → @hyperforge/shared migration
 * (PLAN_SERVERNETWORK_MIGRATION.md Step 5 prerequisite).
 *
 * Delete after Step 8.
 */

export type { Socket } from "@hyperforge/shared";
export type {
  NodeWebSocket,
  ServerSocket,
  ConnectionParams,
  NetworkWithSocket,
  ServerNetworkWithSockets,
} from "../../../../shared/src/systems/server/network/server-types";

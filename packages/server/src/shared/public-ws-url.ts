/**
 * @deprecated Re-export shim.
 *
 * Relocated to
 * `packages/shared/src/systems/server/network/services/PublicUrls.ts`
 * as part of the ServerNetwork → @hyperforge/shared migration
 * (PLAN_SERVERNETWORK_MIGRATION.md Step 2).
 *
 * Delete this shim after Step 8.
 */

export {
  isProductionRuntime,
  getDefaultPublicWsUrl,
  getDefaultElizaOsApiUrl,
  getDefaultPublicAppUrl,
} from "../../../shared/src/systems/server/network/services/PublicUrls";

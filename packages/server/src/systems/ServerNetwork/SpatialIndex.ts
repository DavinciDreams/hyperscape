/**
 * @deprecated Re-export shim.
 *
 * `SpatialIndex` relocated to `packages/shared/src/systems/server/network/SpatialIndex.ts`
 * as part of the engine/game separation (PLAN_SERVERNETWORK_MIGRATION.md
 * Step 1). This shim keeps server-package import sites green while the
 * migration is in flight. Delete after Step 8.
 *
 * Uses a relative workspace path — shared's `exports` field in package.json
 * only declares bundled entry points (./, ./client, ./world, ./runtime),
 * so a deep `@hyperforge/shared/systems/...` import cannot be resolved by
 * `tsc`. Relative path works across the workspace (tsconfig include covers
 * both trees).
 */

export {
  SpatialIndex,
  type RegionChange,
} from "../../../../shared/src/systems/server/network/SpatialIndex";

/**
 * Re-export shim — character-selection migrated to @hyperforge/shared.
 *
 * Part of PLAN_SERVERNETWORK_MIGRATION.md Step 5e. The real implementation
 * lives at `packages/shared/src/systems/server/network/character-selection.ts`
 * and accesses Eliza/DB/JWT via `world.getSystem()` (AgentBridgeSystems,
 * IDatabaseSystem) instead of direct server-side imports.
 *
 * This shim keeps existing server imports (ServerNetwork/index.ts) working
 * until Step 8 deletes the server ServerNetwork entirely.
 */

export {
  loadCharacterList,
  handleCharacterListRequest,
  handleCharacterCreate,
  handleCharacterSelected,
  collectInitialSyncEntities,
  handleEnterWorld,
} from "@hyperforge/shared";

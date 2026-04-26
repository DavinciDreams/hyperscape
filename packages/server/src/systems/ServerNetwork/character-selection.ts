/**
 * @deprecated Re-export shim.
 *
 * Character-selection relocated to `@hyperforge/hyperscape`
 * (Phase G-1 of PLAN_ENGINE_API_EXTRACTION.md, 2026-04-26).
 * Plugin onEnable installs `world.playerSpawnService` so
 * ServerNetwork's enter-world dispatcher can resolve the spawn
 * flow via the `IPlayerSpawnService` substrate interface.
 */

export {
  loadCharacterList,
  handleCharacterListRequest,
  handleCharacterCreate,
  handleCharacterSelected,
  collectInitialSyncEntities,
  handleEnterWorld,
} from "@hyperforge/hyperscape";

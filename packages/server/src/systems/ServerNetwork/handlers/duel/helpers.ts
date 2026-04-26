/**
 * @deprecated Re-export shim.
 *
 * Helpers relocated to `@hyperforge/hyperscape`
 * (Phase F3 batch-4 of PLAN_ENGINE_API_EXTRACTION.md, 2026-04-26).
 */

export {
  rateLimiter,
  getDuelSystem,
  getPendingDuelChallengeManager,
  getPlayerName,
  getPlayerCombatLevel,
  isPlayerOnline,
  getSocketByPlayerId,
  sendDuelError,
  sendSuccessToast,
  withDuelAuth,
  DUEL_PACKETS,
  assertDuelState,
  sendToSocket,
  getPlayerId,
  isInDuelArenaZone,
  isInsideCombatArena,
  isInDuelArenaLobby,
  arePlayersInChallengeRange,
  arePlayersAdjacent,
} from "@hyperforge/hyperscape";

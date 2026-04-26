/**
 * Combat handlers — full set.
 *
 * Phase F3 batch-9 of PLAN_ENGINE_API_EXTRACTION.md, 2026-04-26.
 * Combines:
 *  - `handleAttackPlayer` / `handleAttackMob` (migrated batch-9 via
 *    `ICombatAttackService` substrate; engine `ServerNetwork.onAttackPlayer`
 *    / `onAttackMob` inline blocks call into `world.combatAttackService`
 *    AFTER their own engine-side preprocessing — target lookup, range
 *    check, pending-attack queueing).
 *  - `handleChangeAttackStyle` / `handleSetAutoRetaliate` (migrated
 *    batch-6; pure validation+emit, registered via packet registry).
 */

import type { ServerSocket, World } from "@hyperforge/shared";
import {
  AttackType,
  EventType,
  isPositionInsideCombatArena,
  isValidNpcId,
  validateRequestTimestamp,
  getCombatRateLimiter,
} from "@hyperforge/shared";

/**
 * Send error feedback to client
 */
function sendCombatError(socket: ServerSocket, reason: string): void {
  if (socket.send) {
    socket.send("showToast", {
      message: reason,
      type: "error",
    });
  }
}

/**
 * Handle attack player request from client (PvP).
 * Validates timestamp, target identity, duel state, PvP zones, and combat
 * arena gating before emitting `COMBAT_ATTACK_REQUEST`.
 *
 * Engine-side `ServerNetwork.onAttackPlayer` preprocesses (range check,
 * pending-attack queue, follow cancel) before delegating here.
 */
export function handleAttackPlayer(
  socket: ServerSocket,
  data: unknown,
  world: World,
): void {
  const playerEntity = socket.player;
  if (!playerEntity) {
    console.warn("[Combat] handleAttackPlayer: no player entity on socket");
    return;
  }

  const attackerId = playerEntity.id;

  const rateLimiter = getCombatRateLimiter();
  if (!rateLimiter.check(attackerId)) {
    return;
  }

  if (!data || typeof data !== "object") {
    console.warn(
      `[Combat] Invalid attack player request format from ${attackerId}`,
    );
    return;
  }

  const payload = data as Record<string, unknown>;

  if (
    payload.timestamp === undefined ||
    typeof payload.timestamp !== "number"
  ) {
    console.warn(
      `[Combat] Missing or invalid timestamp from ${attackerId} - potential replay attack`,
    );
    return;
  }
  const timestampValidation = validateRequestTimestamp(payload.timestamp);
  if (!timestampValidation.valid) {
    console.warn(
      `[Combat] Replay attack blocked from ${attackerId}: ${timestampValidation.reason}`,
    );
    return;
  }

  const targetPlayerId = payload.targetPlayerId;
  if (typeof targetPlayerId !== "string" || targetPlayerId.length === 0) {
    console.warn(`[Combat] Invalid target player ID from ${attackerId}`);
    return;
  }

  if (targetPlayerId === attackerId) {
    sendCombatError(socket, "You can't attack yourself.");
    return;
  }

  const targetPlayer = world.entities?.players?.get(targetPlayerId);
  if (!targetPlayer) {
    console.warn(
      `[Combat] Attack request for non-existent player ${targetPlayerId} from ${attackerId}`,
    );
    sendCombatError(socket, "Target not found");
    return;
  }

  // Check if this is a duel combat (bypasses PvP zone checks)
  const duelSystem = world.getSystem("duel") as {
    isPlayerInActiveDuel?: (playerId: string) => boolean;
    getPlayerDuel?: (playerId: string) =>
      | {
          challengerId: string;
          targetId: string;
          state: string;
        }
      | undefined;
  } | null;

  let isDuelCombat = false;
  if (duelSystem?.isPlayerInActiveDuel && duelSystem?.getPlayerDuel) {
    const attackerInDuel = duelSystem.isPlayerInActiveDuel(attackerId);
    const targetInDuel = duelSystem.isPlayerInActiveDuel(targetPlayerId);

    if (attackerInDuel && targetInDuel) {
      const attackerDuel = duelSystem.getPlayerDuel(attackerId);
      if (attackerDuel) {
        if (attackerDuel.state === "COUNTDOWN") {
          sendCombatError(socket, "The duel hasn't started yet!");
          return;
        }

        const isOpponent =
          (attackerDuel.challengerId === attackerId &&
            attackerDuel.targetId === targetPlayerId) ||
          (attackerDuel.targetId === attackerId &&
            attackerDuel.challengerId === targetPlayerId);

        if (isOpponent) {
          isDuelCombat = true;
        } else {
          sendCombatError(socket, "You can only attack your duel opponent.");
          return;
        }
      }
    } else if (attackerInDuel) {
      sendCombatError(socket, "You can only attack your duel opponent.");
      return;
    } else if (targetInDuel) {
      sendCombatError(socket, "That player is in a duel.");
      return;
    }
  }

  // Block combat inside duel arena combat zones without an active duel
  if (!isDuelCombat) {
    const attackerPos = playerEntity.position;
    const targetPos = targetPlayer.position;

    const attackerInArena =
      attackerPos && isPositionInsideCombatArena(attackerPos.x, attackerPos.z);
    const targetInArena =
      targetPos && isPositionInsideCombatArena(targetPos.x, targetPos.z);

    if (attackerInArena || targetInArena) {
      sendCombatError(socket, "Combat in the arena requires an active duel.");
      return;
    }
  }

  // Skip PvP zone checks for duel combat
  if (!isDuelCombat) {
    const zoneSystem = world.getSystem("zone-detection") as {
      isPvPEnabled?: (pos: { x: number; z: number }) => boolean;
    } | null;

    if (zoneSystem?.isPvPEnabled) {
      const attackerPos = playerEntity.position;
      if (
        !attackerPos ||
        !zoneSystem.isPvPEnabled({ x: attackerPos.x, z: attackerPos.z })
      ) {
        sendCombatError(socket, "You can only attack players in PvP zones.");
        return;
      }

      const targetPos = targetPlayer.position;
      if (
        !targetPos ||
        !zoneSystem.isPvPEnabled({ x: targetPos.x, z: targetPos.z })
      ) {
        sendCombatError(socket, "That player is not in a PvP zone.");
        return;
      }
    }
  }

  world.emit(EventType.COMBAT_ATTACK_REQUEST, {
    attackerId,
    targetId: targetPlayerId,
    attackerType: "player",
    targetType: "player",
    attackType: AttackType.MELEE,
  });

  console.log(
    `[Combat] Player ${attackerId} attacking player ${targetPlayerId} (${isDuelCombat ? "Duel" : "PvP"})`,
  );
}

/**
 * Handle attack mob request from client.
 * Validates input before forwarding to CombatSystem.
 */
export function handleAttackMob(
  socket: ServerSocket,
  data: unknown,
  world: World,
): void {
  const playerEntity = socket.player;
  if (!playerEntity) {
    console.warn("[Combat] handleAttackMob: no player entity on socket");
    return;
  }

  const playerId = playerEntity.id;

  const rateLimiter = getCombatRateLimiter();
  if (!rateLimiter.check(playerId)) {
    return;
  }

  if (!data || typeof data !== "object") {
    console.warn(`[Combat] Invalid attack request format from ${playerId}`);
    return;
  }

  const payload = data as Record<string, unknown>;

  if (
    payload.timestamp === undefined ||
    typeof payload.timestamp !== "number"
  ) {
    console.warn(
      `[Combat] Missing or invalid timestamp from ${playerId} - potential replay attack`,
    );
    return;
  }
  const timestampValidation = validateRequestTimestamp(payload.timestamp);
  if (!timestampValidation.valid) {
    console.warn(
      `[Combat] Replay attack blocked from ${playerId}: ${timestampValidation.reason}`,
    );
    return;
  }

  const targetId = payload.mobId ?? payload.targetId;
  if (!isValidNpcId(targetId)) {
    console.warn(`[Combat] Invalid target ID format from ${playerId}`);
    return;
  }

  const mobSystem = world.getSystem("mobNPC") as {
    getMob?: (id: string) => unknown;
  } | null;

  if (mobSystem?.getMob) {
    const mob = mobSystem.getMob(targetId);
    if (!mob) {
      console.warn(
        `[Combat] Attack request for non-existent mob ${targetId} from ${playerId}`,
      );
      sendCombatError(socket, "Target not found");
      return;
    }
  }

  world.emit(EventType.COMBAT_ATTACK_REQUEST, {
    attackerId: playerId,
    targetId: typeof targetId === "string" ? targetId : "",
    attackerType: "player",
    targetType: "mob",
    attackType: AttackType.MELEE,
  });
}

/**
 * Valid attack styles (whitelist).
 * Includes melee, ranged, and magic styles (tile-based MMORPG accurate).
 */
const VALID_ATTACK_STYLES = new Set([
  // Melee styles
  "accurate",
  "aggressive",
  "defensive",
  "controlled",
  // Ranged styles
  "rapid",
  "longrange",
  // Magic styles
  "autocast",
]);

/**
 * Handle attack style change request from client.
 * Validates input before forwarding to PlayerSystem.
 */
export function handleChangeAttackStyle(
  socket: ServerSocket,
  data: unknown,
  world: World,
): void {
  const playerEntity = socket.player;
  if (!playerEntity) {
    return;
  }

  const playerId = playerEntity.id;

  if (!data || typeof data !== "object") {
    console.warn(
      `[Combat] Invalid attack style request format from ${playerId}`,
    );
    return;
  }

  const payload = data as Record<string, unknown>;

  if (typeof payload.newStyle !== "string") {
    console.warn(`[Combat] Missing attack style from ${playerId}`);
    return;
  }

  if (!VALID_ATTACK_STYLES.has(payload.newStyle)) {
    console.warn(
      `[Combat] Invalid attack style "${payload.newStyle}" from ${playerId}`,
    );
    return;
  }

  world.emit(EventType.ATTACK_STYLE_CHANGED, {
    playerId,
    newStyle: payload.newStyle,
  });
}

/**
 * Handle auto-retaliate toggle request from client.
 * Validates input before forwarding to PlayerSystem.
 * PlayerSystem handles rate limiting (500ms cooldown).
 */
export function handleSetAutoRetaliate(
  socket: ServerSocket,
  data: unknown,
  world: World,
): void {
  const playerEntity = socket.player;
  if (!playerEntity) {
    return;
  }

  // Server authority: use socket.player.id, ignore client-provided playerId
  const playerId = playerEntity.id;

  if (!data || typeof data !== "object") {
    console.warn(
      `[Combat] Invalid auto-retaliate request format from ${playerId}`,
    );
    return;
  }

  const payload = data as Record<string, unknown>;

  if (typeof payload.enabled !== "boolean") {
    console.warn(
      `[Combat] Invalid auto-retaliate enabled value from ${playerId}: ${typeof payload.enabled}`,
    );
    return;
  }

  world.emit(EventType.UI_AUTO_RETALIATE_UPDATE, {
    playerId,
    enabled: payload.enabled,
  });
}

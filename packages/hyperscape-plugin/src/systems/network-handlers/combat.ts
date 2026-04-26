/**
 * Combat Style + Auto-Retaliate Handlers
 *
 * Phase F3 batch-6 of PLAN_ENGINE_API_EXTRACTION.md, 2026-04-26.
 *
 * Two simple validation+emit handlers split out of
 * `@hyperforge/shared`'s combat.ts. The other two combat handlers
 * (`handleAttackPlayer`, `handleAttackMob`) stay in shared because
 * they are called inline from `ServerNetwork.registerHandlers()`
 * after engine-side preprocessing (zone validation, range checks,
 * pending-attack queueing).
 */

import type { ServerSocket, World } from "@hyperforge/shared";
import { EventType } from "@hyperforge/shared";

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

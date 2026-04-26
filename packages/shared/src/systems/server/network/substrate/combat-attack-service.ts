/**
 * Combat Attack Service — substrate.
 *
 * `handleAttackPlayer` and `handleAttackMob` perform game-specific
 * validation (duel state, PvP zones, combat arena, rate limiting,
 * timestamp replay-attack guard) before emitting
 * COMBAT_ATTACK_REQUEST. Both functions live plugin-side; the
 * engine's `ServerNetwork.onAttackPlayer` and `onAttackMob` inline
 * handlers call into this substrate after their own preprocessing
 * (target lookup, range check, pending-attack queueing).
 *
 * Plugin onEnable installs `world.combatAttackService = { ... }`;
 * the engine inline blocks call
 * `world.combatAttackService?.attackPlayer(socket, data, world)`
 * (and the equivalent for mobs).
 *
 * Phase F3 batch-9 of PLAN_ENGINE_API_EXTRACTION.md, 2026-04-26.
 */

import type { World } from "../../../../index";
import type { ServerSocket } from "../server-types";

export interface ICombatAttackService {
  /**
   * Validate + emit COMBAT_ATTACK_REQUEST for a PvP / duel attack.
   * Called by the engine's `onAttackPlayer` block ONLY when the
   * attacker and target are already verified to be in attack range.
   * Out-of-range cases are queued by the engine's
   * pendingAttackManager directly.
   */
  attackPlayer(socket: ServerSocket, data: unknown, world: World): void;

  /**
   * Validate + emit COMBAT_ATTACK_REQUEST for a player→mob attack.
   * Currently unused by the engine inline block (which re-implements
   * the validation in line); preserved for symmetry and for future
   * consolidation.
   */
  attackMob(socket: ServerSocket, data: unknown, world: World): void;
}

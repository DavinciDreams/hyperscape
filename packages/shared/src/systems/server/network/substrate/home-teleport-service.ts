/**
 * Home Teleport Manager — substrate.
 *
 * `HomeTeleportManager` is a game-specific manager (cooldown,
 * cast time, combat-interrupt rules) so the concrete class lives
 * in `@hyperforge/hyperscape`. Engine-side ServerNetwork drives
 * it at three lifecycle points (tick, onPlayerMove,
 * onPlayerDisconnect), so the substrate just declares the shape
 * the engine consumes plus a factory the plugin installs.
 *
 * Phase F3 batch-7 of PLAN_ENGINE_API_EXTRACTION.md, 2026-04-26.
 */

import type { ServerSocket, SpawnData } from "../server-types";

/**
 * Engine-side view of the home-teleport manager. ServerNetwork
 * uses these methods only. The concrete class adds more methods
 * (startCasting, etc.) that handler code consumes.
 */
export interface IHomeTeleportManager {
  isCasting(playerId: string): boolean;
  cancelCasting(playerId: string, reason: string): void;
  processTick(
    currentTick: number,
    getSocket: (playerId: string) => ServerSocket | undefined,
  ): void;
  onPlayerDisconnect(playerId: string): void;
}

/**
 * Factory that constructs the concrete `HomeTeleportManager`. The
 * plugin installs this on `world.homeTeleportFactory` at onEnable;
 * `ServerNetwork.start()` calls it after the spawn point loads.
 *
 * `sendFn` is provided by the engine (BroadcastManager.sendToAll
 * binding) and used by the manager to broadcast `entityModified`
 * events when teleports complete.
 */
export type HomeTeleportFactory = (
  spawnPoint: SpawnData,
  sendFn: (name: string, data: unknown, ignoreSocketId?: string) => void,
) => IHomeTeleportManager;

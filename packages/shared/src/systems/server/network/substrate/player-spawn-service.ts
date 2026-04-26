/**
 * Player Spawn Service — substrate.
 *
 * Character creation, character selection, and player-spawn flow
 * are game-specific (Hyperia starter inventory, default skills,
 * friend-list sync, agent-manager wiring) so they live in
 * `@hyperforge/hyperscape`. The engine's `ServerNetwork` calls
 * into two of those functions during enter-world dispatch:
 *
 *  - `enterWorld(...)` — main spawn flow, called from
 *    `ServerNetwork.handleEnterWorldWithReconnect()` for new
 *    sessions (reconnect path is handled engine-side).
 *  - `collectInitialSyncEntities(world, x, z, playerId)` — used
 *    by the engine's reconnect path to compute the initial
 *    entity-add packet set.
 *
 * Plugin onEnable installs `world.playerSpawnService = { ... }`;
 * shared internals call `world.playerSpawnService?.method(...)`
 * and silent-fail when absent (PIE editor / tests).
 *
 * Phase G-1 of PLAN_ENGINE_API_EXTRACTION.md, 2026-04-26.
 */

import type { World } from "../../../../index";
import type { Entity } from "../../../../entities/Entity";
import type { ServerSocket, SpawnData } from "../server-types";

export interface IPlayerSpawnService {
  enterWorld(
    socket: ServerSocket,
    data: unknown,
    world: World,
    spawn: SpawnData,
    sendFn: (name: string, data: unknown, ignoreSocketId?: string) => void,
    sendToFn: (socketId: string, name: string, data: unknown) => void,
  ): Promise<void>;

  collectInitialSyncEntities(
    world: World,
    centerX: number,
    centerZ: number,
    playerId: string,
  ): Entity[];
}

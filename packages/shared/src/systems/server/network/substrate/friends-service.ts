/**
 * Friends Service — substrate.
 *
 * The friends handler family (sendFriendsListSync,
 * notifyFriendsOfStatusChange, etc.) is game-specific so it lives
 * in `@hyperforge/hyperscape`. Engine-side code in shared
 * (character-selection.ts on login, socket-management.ts on
 * disconnect) needs to invoke two of those helpers — this
 * substrate exposes their shape so the engine can call them
 * without a back-reference to the plugin.
 *
 * Plugin onEnable installs `world.friendsService = { ... }`;
 * shared internals call `world.friendsService?.method(...)` and
 * no-op if absent.
 *
 * Phase F3 batch-8 of PLAN_ENGINE_API_EXTRACTION.md, 2026-04-26.
 */

import type { World } from "../../../../index";
import type { ServerSocket } from "../server-types";

export interface IFriendsService {
  /**
   * Push a full friends-list sync packet to the player's socket.
   * Called on login (after character selection completes).
   */
  sendFriendsListSync(
    socket: ServerSocket,
    world: World,
    playerId: string,
  ): Promise<void>;

  /**
   * Notify the player's friends that they came online or went
   * offline. Called on character-selected and on disconnect.
   */
  notifyFriendsOfStatusChange(
    playerId: string,
    status: "online" | "offline",
    world: World,
  ): Promise<void>;
}

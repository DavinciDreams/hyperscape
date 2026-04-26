/**
 * Engine substrate — `IBroadcastService`.
 *
 * Per `PLAN_ENGINE_API_EXTRACTION.md` Phase A2. Captures the public
 * surface of ServerNetwork's broadcast layer so plugin-side
 * gameplay systems (TileMovementManager, Pending- and Follow-managers,
 * combat / loot / dialogue handlers) can fan packets out to sockets
 * without depending on ServerNetwork's concrete implementation.
 *
 * This interface previously lived in `network/interfaces.ts` as
 * `IBroadcastManager`. Phase A2 relocates it here and renames it
 * `IBroadcastService` for consistency with the rest of the substrate
 * (it's not a "manager" — it's a substrate service the world owns).
 * The old name remains available as an alias from
 * `network/interfaces.ts` for back-compat.
 *
 * Boot order: ServerNetwork's CONSTRUCTOR (Phase B, future commit)
 * will instantiate the concrete implementation and pin it to
 * `world.broadcast`. Both production server and PIE call the
 * constructor at register-time, before either host's `plugin.onEnable`
 * — so `world.broadcast` is always populated when downstream
 * consumers look it up.
 */

import type { PacketPriority } from "../BandwidthBudget";
import type { ServerSocket } from "../server-types";
import type { ISpatialIndex } from "./spatial-index";
import type { ISocketPubSubAdapter } from "../interfaces";

/**
 * Broadcast service — fans packets out to one socket, a region of
 * sockets, all sockets, or the spectator subset. Backed by a uWS
 * pub/sub adapter when the transport supports it; falls back to
 * direct per-socket sends otherwise.
 */
export interface IBroadcastService {
  /**
   * Broadcast a packet to every connected socket. Returns the number of
   * clients that received the message.
   */
  sendToAll<T = unknown>(
    name: string,
    data: T,
    ignoreSocketId?: string,
    priority?: PacketPriority,
  ): number;

  /**
   * Register the spatial region index used by region-topic pub/sub.
   * Called once by ServerNetwork after constructing the service.
   */
  setSpatialIndex(index: ISpatialIndex): void;

  /**
   * Register the uWebSockets.js app used for zero-copy pub/sub
   * broadcast. Parameter is typed `unknown` to keep shared engine-agnostic.
   * Server-only wiring passes the concrete uWS.TemplatedApp.
   */
  setUwsApp(app: unknown): void;

  /**
   * Send a packet directly to the socket backing a given player id.
   * Returns true if delivered, false if the player has no active socket.
   */
  sendToPlayer<T = unknown>(playerId: string, name: string, data: T): boolean;

  /** Return the active socket for a player id, or undefined if offline. */
  getPlayerSocket(playerId: string): ServerSocket | undefined;

  /**
   * Notify the broadcast layer that a socket has disconnected so it can
   * drop subscriptions, clear buffered packets, etc.
   */
  onSocketDisconnected(socketId: string): void;

  /**
   * Send a packet to a specific socket by its transport id.
   * Returns `true` if the socket is connected and received the packet.
   */
  sendToSocket<T = unknown>(socketId: string, name: string, data: T): boolean;

  /**
   * Broadcast to every socket flagged as a spectator. Returns the number of
   * spectators that received the message (or -1 when using pub/sub fast
   * path where exact count is unavailable).
   */
  sendToSpectators<T = unknown>(name: string, data: T): number;

  /**
   * Broadcast to every socket in the 3×3 region around (worldX, worldZ),
   * plus spectators. Returns the number of clients reached.
   */
  sendToNearby<T = unknown>(
    name: string,
    data: T,
    worldX: number,
    worldZ: number,
    ignoreSocketId?: string,
  ): number;

  /**
   * Drain and return the cumulative time (ms) spent in sendBufferedPacket
   * since the last call. Used for tick-health reporting.
   */
  drainSendTimeMs(): number;

  /**
   * Drain and return the cumulative pub/sub publish count since last call.
   * Used for tick-health reporting.
   */
  drainPubsubStats(): number;

  /**
   * Retrieve the pub/sub adapter for a socket, or `undefined` if the
   * socket is not on a pub/sub-capable transport. ServerNetwork uses
   * this to subscribe/unsubscribe sockets to region topics without
   * depending on the concrete UwsWebSocketAdapter type.
   */
  getAdapter(socketId: string): ISocketPubSubAdapter | undefined;
}

/**
 * Engine substrate — `IConnectionRegistry`.
 *
 * Per `PLAN_ENGINE_API_EXTRACTION.md` Phase F1. Captures the runtime
 * registry that maps incoming packet names to handler functions.
 * ServerNetwork's `onMessage` dispatcher consults this registry first
 * (before its legacy `this.handlers[...]` static dict), so plugin-side
 * code can register packet handlers without ServerNetwork knowing
 * which packets exist.
 *
 * This interface previously lived in `network/interfaces.ts` as
 * `IPacketHandlerRegistry` (added during the original
 * PLAN_SERVERNETWORK_MIGRATION step 5d alternative). Phase F1
 * relocates it here and renames it `IConnectionRegistry` for
 * consistency with the rest of the substrate. The old name remains
 * available as an alias from `network/interfaces.ts` for back-compat.
 *
 * Boot order: ServerNetwork's CONSTRUCTOR (Phase F2, future commit)
 * will look up `world.getSystem("packet-handlers")` and pin the
 * concrete registry to `world.connectionRegistry`. Plugin onEnable
 * (which can fire either before or after ServerNetwork.init()
 * depending on the host) registers packet handlers via
 * `world.connectionRegistry.register(name, handler)`. By the time
 * the first incoming packet fires the dispatcher, registrations are
 * complete.
 */

import type { ServerSocket } from "../server-types";

/**
 * Function signature for a packet handler: called with the originating
 * socket and the arbitrary packet payload. Return value is ignored;
 * errors should be caught by the handler itself or the dispatcher.
 */
export type PacketHandler = (
  socket: ServerSocket,
  data: unknown,
) => void | Promise<void>;

/**
 * Connection-protocol packet-handler registry. Plugins register named
 * packet handlers; ServerNetwork's dispatcher looks them up by name
 * on each incoming message.
 *
 * Concrete implementations:
 *  - `PacketHandlerBridgeSystem` in `@hyperforge/server` (production
 *    + integration tests).
 *  - `PIEPacketHandlerStub` in `@hyperforge/shared/runtime/pie`
 *    (registers only the packets the editor needs; no-ops the rest).
 */
export interface IConnectionRegistry {
  /** Look up a handler by packet name. Returns `undefined` if none registered. */
  getHandler(packetName: string): PacketHandler | undefined;

  /** Register (or replace) a packet handler at runtime. */
  register(packetName: string, handler: PacketHandler): void;

  /** Remove a packet handler. */
  unregister(packetName: string): void;

  /** All currently registered packet names (for debugging / introspection). */
  listPackets(): string[];
}

/**
 * PacketHandlerBridgeSystem
 *
 * World-system wrapper around the packet-handler dispatch map that
 * ServerNetwork currently maintains internally in
 * `ServerNetwork/index.ts::registerHandlers()`.
 *
 * Purpose (PLAN_SERVERNETWORK_MIGRATION.md Step 5d alternative):
 * ServerNetwork/index.ts imports ~25 handler modules statically and
 * populates `this.handlers[name] = (...) => handleX(...)`. Those
 * handler modules import drizzle-orm, pg, and the server schema, which
 * shared must remain free of. To relocate ServerNetwork/index.ts into
 * shared without dragging the SQL-heavy handlers along, the dispatch
 * map moves behind this bridge. Server keeps its handler imports in
 * `startup/` (the wiring point), registers each `(packetName, fn)` on
 * this system, and shared-side ServerNetwork looks them up via
 * `world.getSystem("packet-handlers") as IPacketHandlerRegistry`.
 *
 * PIE can register a minimal subset (movement, chat, interaction) and
 * no-op or omit the gameplay-heavy packets, enabling the loopback
 * PlayTestWorld replacement without full production dependencies.
 */

import { SystemBase } from "@hyperforge/shared";
import type { World } from "@hyperforge/shared";
import type {
  IPacketHandlerRegistry,
  PacketHandler,
} from "../../../../shared/src/systems/server/network/interfaces";

export class PacketHandlerBridgeSystem
  extends SystemBase
  implements IPacketHandlerRegistry
{
  private readonly handlers = new Map<string, PacketHandler>();

  constructor(world: World) {
    super(world, {
      name: "packet-handlers",
      dependencies: { required: [], optional: [] },
      autoCleanup: true,
    });
  }

  async init(): Promise<void> {}
  start(): void {}

  getHandler(packetName: string): PacketHandler | undefined {
    return this.handlers.get(packetName);
  }

  register(packetName: string, handler: PacketHandler): void {
    this.handlers.set(packetName, handler);
  }

  unregister(packetName: string): void {
    this.handlers.delete(packetName);
  }

  listPackets(): string[] {
    return Array.from(this.handlers.keys());
  }
}

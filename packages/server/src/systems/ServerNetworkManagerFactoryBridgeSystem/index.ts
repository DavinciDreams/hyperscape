/**
 * ServerNetworkManagerFactoryBridgeSystem
 *
 * Thin SystemBase wrapper that implements
 * `IServerNetworkManagerFactory`. It exposes a single injection point for
 * the three remaining server-only sub-managers (BroadcastManager,
 * EventBridge, ConnectionHandler) whose concrete implementations depend on
 * uWebSockets.js, Drizzle, or other server-exclusive runtime state and
 * therefore cannot live in `@hyperforge/shared`.
 *
 * Registered from `startup/world.ts` before ServerNetwork. Part of
 * PLAN_SERVERNETWORK_MIGRATION.md Step 6 prep — once ServerNetwork itself
 * moves to `packages/shared/src/systems/server/network/`, it will look up
 * this factory via `world.getSystem("server-network-factory")` instead of
 * importing BroadcastManager / EventBridge / ConnectionHandler directly.
 */

import { SystemBase } from "@hyperforge/shared";
import type { World } from "@hyperforge/shared";
import type {
  IServerNetworkManagerFactory,
  IBroadcastManager,
  IEventBridge,
  IConnectionHandler,
  ConnectionHandlerFactoryArgs,
} from "../../../../shared/src/systems/server/network/interfaces";
import type { ServerSocket } from "../../shared/types/index.js";
import { BroadcastManager } from "../ServerNetwork/broadcast.js";
import { EventBridge } from "../ServerNetwork/event-bridge.js";
import { ConnectionHandler } from "../ServerNetwork/connection-handler.js";

export class ServerNetworkManagerFactoryBridgeSystem
  extends SystemBase
  implements IServerNetworkManagerFactory
{
  constructor(world: World) {
    super(world, {
      name: "server-network-factory",
      dependencies: { required: [], optional: [] },
      autoCleanup: true,
    });
  }

  async init(): Promise<void> {}
  start(): void {}

  createBroadcastManager(
    sockets: Map<string, ServerSocket>,
  ): IBroadcastManager {
    return new BroadcastManager(sockets) as unknown as IBroadcastManager;
  }

  createEventBridge(
    world: World,
    broadcastManager: IBroadcastManager,
  ): IEventBridge {
    return new EventBridge(
      world,
      broadcastManager as unknown as BroadcastManager,
    ) as unknown as IEventBridge;
  }

  createConnectionHandler(
    args: ConnectionHandlerFactoryArgs,
  ): IConnectionHandler {
    return new ConnectionHandler(
      args.world,
      args.sockets,
      args.broadcastManager as unknown as BroadcastManager,
      args.db as unknown as ConstructorParameters<typeof ConnectionHandler>[3],
      args.spectatorsByPlayer,
    ) as unknown as IConnectionHandler;
  }
}

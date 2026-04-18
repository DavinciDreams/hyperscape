/**
 * DuelStakeTransferBridgeSystem
 *
 * Thin SystemBase wrapper that exposes
 * `executeDuelStakeTransferWithRetry()` from
 * `ServerNetwork/duel-settlement.ts` as a world system, so shared-side code
 * (post-Step 6 ServerNetwork, future migrated handlers) can reach the
 * atomic stake-settlement routine via
 * `world.getSystem("duel-stake-transfer") as IDuelStakeTransfer` instead of
 * importing server modules directly.
 *
 * The underlying implementation runs a Drizzle transaction on
 * `InventoryRepository` and is therefore permanently server-only.
 *
 * Registered from `startup/world.ts`. Part of PLAN_SERVERNETWORK_MIGRATION.md
 * Step 6 prep (narrow-interface decoupling).
 */

import { SystemBase } from "@hyperforge/shared";
import type { World } from "@hyperforge/shared";
import { executeDuelStakeTransferWithRetry as rawExecute } from "../ServerNetwork/duel-settlement.js";
import type { ServerSocket } from "../../shared/types/index.js";
import type {
  IDuelStakeTransfer,
  DuelStakeItem,
} from "../../../../shared/src/systems/server/network/interfaces";

/**
 * Structural shape for the ServerNetwork accessor the bridge looks up
 * lazily at call time. Avoids a direct import of the ServerNetwork
 * class (which would reintroduce a circular dependency once
 * ServerNetwork moves to shared).
 */
interface SocketLookupProvider {
  getSocketByPlayerId(id: string): ServerSocket | undefined;
}

export class DuelStakeTransferBridgeSystem
  extends SystemBase
  implements IDuelStakeTransfer
{
  constructor(world: World) {
    super(world, {
      name: "duel-stake-transfer",
      dependencies: { required: [], optional: [] },
      autoCleanup: true,
    });
  }

  async init(): Promise<void> {}
  start(): void {}

  async executeDuelStakeTransferWithRetry(
    winnerId: string,
    loserId: string,
    stakes: DuelStakeItem[],
    duelId?: string,
  ): Promise<void> {
    const network = this.world.getSystem(
      "network",
    ) as unknown as SocketLookupProvider | null;
    if (!network) {
      throw new Error(
        "[DuelStakeTransferBridgeSystem] ServerNetwork ('network') not registered on world — stake transfer cannot resolve sockets",
      );
    }
    return rawExecute(
      {
        world: this.world,
        getSocketByPlayerId: (id) => network.getSocketByPlayerId(id),
      },
      winnerId,
      loserId,
      stakes,
      duelId,
    );
  }
}

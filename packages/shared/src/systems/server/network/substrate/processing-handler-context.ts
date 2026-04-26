/**
 * Processing Handler Context — substrate.
 *
 * Plugin-side processing handlers (smelting, smithing, fletching,
 * runecrafting, cooking, firemaking, tanning, …) share a common
 * context object provided by the engine. Defining the shape here
 * (substrate) lets `ServerNetwork.getProcessingHandlerContext()`
 * stay engine-side and lets the plugin's handler implementations
 * import the same shape without a back-reference to shared internals.
 *
 * Phase F3 (batch-3) of PLAN_ENGINE_API_EXTRACTION.md, 2026-04-26.
 */

import type { World } from "../../../../index";
import type { TickSystem } from "../../TickSystem";

// PendingGatherManager + PendingCookManager + TileMovementManager
// migrated to @hyperforge/hyperscape. Duck-typed locally — only the
// methods actually called from the processing handlers are required.
export interface ProcessingPendingGatherManager {
  queuePendingGather(
    playerId: string,
    resourceId: string,
    currentTick: number,
    runMode?: boolean,
  ): void;
}

export interface ProcessingPendingCookManager {
  queuePendingCook(
    playerId: string,
    sourceId: string,
    sourcePosition: { x: number; y: number; z: number },
    currentTick: number,
    runMode?: boolean,
    fishSlot?: number,
  ): void;
}

export interface ProcessingTileMovementManager {
  getIsRunning(playerId: string): boolean;
  stopPlayer(playerId: string): void;
}

/**
 * Engine-provided context for plugin processing handlers.
 *
 * `ServerNetwork.getProcessingHandlerContext()` constructs and
 * returns this. The plugin's processing handlers consume it and
 * therefore avoid concrete imports of ServerNetwork-internal fields.
 */
export interface ProcessingHandlerContext {
  world: World;
  pendingGatherManager: ProcessingPendingGatherManager;
  pendingCookManager: ProcessingPendingCookManager;
  tileMovementManager: ProcessingTileMovementManager;
  tickSystem: TickSystem;
  canProcessRequest: (playerId: string) => boolean;
}

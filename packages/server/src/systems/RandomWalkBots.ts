/**
 * RandomWalkBots — Spawns scripted bots that walk randomly around the world.
 *
 * No LLM, no ElizaOS, no API keys. Pure server-side movement for training
 * data collection. Each bot:
 *   - Picks a random tile within range
 *   - Walks there (run or walk, randomly)
 *   - Waits 1-5 ticks
 *   - Picks a new random tile
 *   - Occasionally rotates camera direction
 *
 * Enable via env: RANDOM_WALK_BOTS=10 (number of bots to spawn)
 *
 * The WorldStateLogger captures all movement, producing training data
 * without any external dependencies.
 */

import type { World } from "@hyperscape/shared";

interface BotState {
  playerId: string;
  name: string;
  currentTarget: [number, number, number] | null;
  waitTicks: number;
  movesSinceSpawn: number;
  isRunning: boolean;
  spawnTile: [number, number];
}

export class RandomWalkBots {
  private world: World;
  private bots: Map<string, BotState> = new Map();
  private botEntities: Map<string, Record<string, unknown>> = new Map();
  private unsubscribe: (() => void) | null = null;
  private tickCount = 0;
  private networkSystem: Record<string, unknown> | null = null;

  // Config
  private numBots: number;
  private worldMinX: number;
  private worldMaxX: number;
  private worldMinZ: number;
  private worldMaxZ: number;
  private maxWalkRange: number;

  constructor(
    world: World,
    opts?: {
      numBots?: number;
      worldMinX?: number;
      worldMaxX?: number;
      worldMinZ?: number;
      worldMaxZ?: number;
      maxWalkRange?: number;
    },
  ) {
    this.world = world;
    this.numBots =
      opts?.numBots ?? parseInt(process.env.RANDOM_WALK_BOTS || "10");
    this.worldMinX = opts?.worldMinX ?? -100;
    this.worldMaxX = opts?.worldMaxX ?? 100;
    this.worldMinZ = opts?.worldMinZ ?? -100;
    this.worldMaxZ = opts?.worldMaxZ ?? 100;
    this.maxWalkRange = opts?.maxWalkRange ?? 15;
  }

  async start(): Promise<void> {
    this.networkSystem = this.world.getSystem("network") as unknown as Record<
      string,
      unknown
    >;
    if (!this.networkSystem) {
      console.error("[RandomWalkBots] No network system found");
      return;
    }

    // Get TickSystem
    const tickSystem = this.networkSystem.tickSystem as {
      onTick: (cb: (tick: number) => void, priority: number) => () => void;
    };
    if (!tickSystem) {
      console.error("[RandomWalkBots] No tick system found");
      return;
    }

    // Instead of spawning our own entities, hijack the EXISTING players.
    // Wait for LLM agents or other players to spawn, then use their
    // entity IDs with requestServerMove to make them walk randomly.
    // This avoids all the entity registration complexity.
    console.log(
      `[RandomWalkBots] Waiting for players to spawn, then will drive ${this.numBots} as random walkers...`,
    );

    // Use setInterval to periodically check for players and drive them
    const checkInterval = setInterval(() => {
      if (this.bots.size >= this.numBots) {
        clearInterval(checkInterval);
        return;
      }
      // Find existing players we haven't claimed yet
      try {
        const players =
          (
            this.world as unknown as {
              getPlayers?: () => Array<{ id: string; name: string }>;
            }
          ).getPlayers?.() || [];

        for (const player of players) {
          if (this.bots.has(player.id)) continue;
          if (this.bots.size >= this.numBots) break;

          const botState: BotState = {
            playerId: player.id,
            name: player.name || `Walker-${this.bots.size}`,
            currentTarget: null,
            waitTicks: this.randomInt(2, 10),
            movesSinceSpawn: 0,
            isRunning: Math.random() > 0.5,
            spawnTile: [0, 0],
          };
          this.bots.set(player.id, botState);
          console.log(
            `[RandomWalkBots] Driving player "${player.name}" (${player.id}) as random walker`,
          );
        }
      } catch {
        // Players not available yet
      }
    }, 3000);

    // Register tick handler at AI priority (3)
    const AI_PRIORITY = 3;
    this.unsubscribe = tickSystem.onTick((tickNumber: number) => {
      this.onTick(tickNumber);
    }, AI_PRIORITY);

    console.log(
      `[RandomWalkBots] Tick handler registered. Will drive players as they spawn.`,
    );
  }

  stop(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    console.log(
      `[RandomWalkBots] Stopped. ${this.bots.size} bots made ${[...this.bots.values()].reduce((s, b) => s + b.movesSinceSpawn, 0)} total moves.`,
    );
  }

  private async spawnBot(index: number): Promise<void> {
    const spawnX = this.randomInt(this.worldMinX + 10, this.worldMaxX - 10);
    const spawnZ = this.randomInt(this.worldMinZ + 10, this.worldMaxZ - 10);
    const botId = `random-walk-bot-${index}`;
    const botName = `Walker-${index}`;

    try {
      // Register the bot directly with the TileMovementManager so it can
      // The TileMovementManager's movePlayerToward() requires the entity
      // to exist in world.entities with a .position property. The EntityManager
      // also calls .fixedUpdate() and .update() on all entities, so we add stubs.
      const entityManager = this.world.getSystem("entity-manager") as {
        entities?: Map<string, unknown>;
      };

      // Minimal entity that satisfies both TileMovementManager and EntityManager
      const botEntity: Record<string, unknown> = {
        id: botId,
        type: "player",
        name: botName,
        isPlayer: true,
        active: true,
        health: 100,
        maxHealth: 100,
        level: 1,
        position: { x: spawnX + 0.5, y: 25.0, z: spawnZ + 0.5 },
        node: {
          position: { x: spawnX + 0.5, y: 25.0, z: spawnZ + 0.5 },
          rotation: { y: 0 },
        },
        data: {
          id: botId,
          type: "player",
          name: botName,
          position: [spawnX, 25, spawnZ],
        },
        // Stub lifecycle methods so EntityManager doesn't crash
        fixedUpdate: () => {},
        update: () => {},
        destroy: () => {},
        networkDirty: false,
        networkVersion: 0,
        components: new Map(),
      };

      if (entityManager?.entities) {
        entityManager.entities.set(botId, botEntity);
      }

      // CRITICAL: Also add to world.entities.players — this is where
      // TileMovementManager looks via world.entities.get(id), which
      // checks items.get() || players.get(). Without this, movePlayerToward
      // silently returns because it can't find the entity.
      const worldEntities = this.world.entities as unknown as {
        players?: Map<string, unknown>;
      };
      if (worldEntities?.players) {
        worldEntities.players.set(botId, botEntity);
      }

      // Store reference for WorldStateLogger
      this.botEntities.set(botId, botEntity);

      this.bots.set(botId, {
        playerId: botId,
        name: botName,
        currentTarget: null,
        waitTicks: 5 + index * 3, // Stagger initial movements
        movesSinceSpawn: 0,
        isRunning: Math.random() > 0.5,
        spawnTile: [spawnX, spawnZ],
      });

      console.log(
        `[RandomWalkBots] Spawned ${botName} at (${spawnX}, ${spawnZ})`,
      );
    } catch (err) {
      console.error(`[RandomWalkBots] Failed to spawn bot ${index}:`, err);
    }
  }

  /** Get all bot entity data (for WorldStateLogger). */
  getBotEntities(): Array<Record<string, unknown>> {
    return [...this.botEntities.values()];
  }

  private onTick(tickNumber: number): void {
    this.tickCount++;

    for (const [botId, bot] of this.bots) {
      // Update bot entity position from TileMovementManager
      this.updateBotPosition(bot);

      // Decrement wait counter
      if (bot.waitTicks > 0) {
        bot.waitTicks--;
        continue;
      }

      // Pick a new random target and move
      this.moveBot(bot);
    }
  }

  private updateBotPosition(bot: BotState): void {
    const network = this.networkSystem as {
      tileMovementManager?: {
        getCurrentTile?: (id: string) => { x: number; z: number } | null;
        playerStates?: Map<
          string,
          {
            currentTile: { x: number; z: number };
            requestedDestination: { x: number; z: number } | null;
            path: { x: number; z: number }[];
            pathIndex: number;
            isRunning: boolean;
          }
        >;
      };
    };

    const tmm = network?.tileMovementManager;
    const state = tmm?.playerStates?.get(bot.playerId);
    const entity = this.botEntities.get(bot.playerId);
    if (!entity || !state) return;

    // Sync the entity's position object (which TileMovementManager reads)
    const tile = state.currentTile;
    const pos = entity.position as { x: number; y: number; z: number };
    if (pos && typeof pos === "object" && "x" in pos) {
      pos.x = tile.x + 0.5;
      pos.z = tile.z + 0.5;
    }
    const nodePos = (entity.node as { position?: { x: number; z: number } })
      ?.position;
    if (nodePos) {
      nodePos.x = tile.x + 0.5;
      nodePos.z = tile.z + 0.5;
    }

    // Update data for WorldStateLogger
    entity.currentTile = [tile.x, tile.z];
    entity.targetTile = state.requestedDestination
      ? [state.requestedDestination.x, state.requestedDestination.z]
      : null;
    entity.pathLength = Math.max(0, state.path.length - state.pathIndex);
    entity.isRunning = state.isRunning;
    entity.isMoving = (entity.pathLength as number) > 0;
    entity.actionType = entity.isMoving ? "move" : "idle";
    entity.movementDelta = entity.isMoving
      ? [
          (state.path[state.pathIndex]?.x ?? tile.x) - tile.x,
          0,
          (state.path[state.pathIndex]?.z ?? tile.z) - tile.z,
        ]
      : [0, 0, 0];
  }

  private moveBot(bot: BotState): void {
    const network = this.networkSystem as {
      requestServerMove?: (
        id: string,
        target: [number, number, number],
        opts?: { runMode?: boolean },
      ) => boolean;
      tileMovementManager?: {
        getCurrentTile?: (id: string) => { x: number; z: number } | null;
      };
    };

    if (!network?.requestServerMove) return;

    // Get actual current position from TileMovementManager
    const currentTile = network.tileMovementManager?.getCurrentTile?.(
      bot.playerId,
    );
    const currentX = currentTile ? currentTile.x : bot.spawnTile[0];
    const currentZ = currentTile ? currentTile.z : bot.spawnTile[1];

    // Random offset within walk range
    const dx = this.randomInt(-this.maxWalkRange, this.maxWalkRange);
    const dz = this.randomInt(-this.maxWalkRange, this.maxWalkRange);

    // Clamp to world bounds
    const targetX = Math.max(
      this.worldMinX,
      Math.min(this.worldMaxX, currentX + dx),
    );
    const targetZ = Math.max(
      this.worldMinZ,
      Math.min(this.worldMaxZ, currentZ + dz),
    );

    const target: [number, number, number] = [targetX, 25.0, targetZ];

    // Occasionally toggle run mode
    if (Math.random() < 0.2) {
      bot.isRunning = !bot.isRunning;
    }

    let moved = false;
    try {
      moved = !!network.requestServerMove(bot.playerId, target, {
        runMode: bot.isRunning,
      });
    } catch (err) {
      if (bot.movesSinceSpawn === 0) {
        console.error(
          `[RandomWalkBots] Move failed for ${bot.name}:`,
          (err as Error).message,
        );
      }
    }

    if (bot.movesSinceSpawn < 2) {
      console.log(
        `[RandomWalkBots] ${bot.name} move to (${targetX},${targetZ}): ${moved}`,
      );
    }

    if (moved) {
      bot.currentTarget = target;
      bot.movesSinceSpawn++;
      // Wait 2-8 ticks before next move (1.2-4.8 seconds)
      bot.waitTicks = this.randomInt(2, 8);
      // Update reference position
      bot.spawnTile = [currentX, currentZ];
    } else {
      // Movement failed, retry soon
      bot.waitTicks = 3;
    }
  }

  private randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
}

/**
 * Initialize random walk bots if RANDOM_WALK_BOTS env is set.
 */
export function initRandomWalkBots(world: World): RandomWalkBots | null {
  const numBots = parseInt(process.env.RANDOM_WALK_BOTS || "0");
  if (numBots <= 0) {
    return null;
  }

  const bots = new RandomWalkBots(world, { numBots });

  // Expose globally so WorldStateLogger can read bot entities
  const g = globalThis as typeof globalThis & {
    __randomWalkBots?: RandomWalkBots;
  };
  g.__randomWalkBots = bots;

  // Delay start to ensure all systems are initialized
  setTimeout(() => {
    bots.start().catch((err) => {
      console.error("[RandomWalkBots] Failed to start:", err);
    });
  }, 5000);

  return bots;
}

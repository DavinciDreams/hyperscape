/**
 * WorldStateLogger — Tick-level world state capture for world model training data.
 *
 * Registers as a TickSystem listener at BROADCAST priority (runs after all game
 * logic). On every 600ms tick, serializes all entity positions, health, actions,
 * and movement deltas to a JSONL file.
 *
 * Enable via env: WORLD_STATE_LOGGER_ENABLED=true
 * Output dir:     WORLD_STATE_LOG_DIR (default: <hyperscapeRoot>/data/world_state_logs)
 */

import * as fs from "fs";
import * as path from "path";
import type { World } from "@hyperscape/shared";

// ── Types ────────────────────────────────────────────────────────────────────

export interface EntitySnapshot {
  id: string;
  type: string;
  name: string;
  position: [number, number, number];
  rotation: number;
  health: number;
  maxHealth: number;
  inCombat: boolean;
  combatTargetId: string | null;
  movementDelta: [number, number, number];
  isMoving: boolean;
  animationState: string;
  level: number;
  // Tile movement data (players and mobs only)
  currentTile: [number, number] | null; // [x, z] integer tile coords
  targetTile: [number, number] | null; // where they clicked / are pathing to
  pathLength: number; // tiles remaining in path
  isRunning: boolean;
  // Action classification
  actionType: "idle" | "move" | "combat" | "gather" | "interact";
}

export interface TickSnapshot {
  tick: number;
  timestampMs: number;
  entityCount: number;
  entities: EntitySnapshot[];
}

// ── Logger ───────────────────────────────────────────────────────────────────

// Typed accessors for internal game systems (accessed via type assertions)
interface TileMovementState {
  currentTile: { x: number; z: number };
  path: { x: number; z: number }[];
  pathIndex: number;
  isRunning: boolean;
  requestedDestination: { x: number; z: number } | null;
}

interface TileMovementManagerLike {
  playerStates?: Map<string, TileMovementState>;
  getCurrentTile?: (id: string) => { x: number; z: number } | null;
  isMoving?: (id: string) => boolean;
}

export class WorldStateLogger {
  private world: World;
  private outputDir: string;
  private outputStream: fs.WriteStream | null = null;
  private sessionId: string;
  private previousPositions: Map<string, [number, number, number]> = new Map();
  private unsubscribe: (() => void) | null = null;
  private tickCount = 0;
  private startTime = 0;
  private tileMovementManager: TileMovementManagerLike | null = null;

  constructor(world: World, outputDir?: string) {
    this.world = world;
    this.outputDir =
      outputDir ||
      process.env.WORLD_STATE_LOG_DIR ||
      path.resolve(process.cwd(), "data", "world_state_logs");
    this.sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  start(): void {
    // Create output directory
    fs.mkdirSync(this.outputDir, { recursive: true });

    // Open write stream with error handling
    const filePath = path.join(this.outputDir, `${this.sessionId}.jsonl`);
    this.outputStream = fs.createWriteStream(filePath, { flags: "a" });
    this.outputStream.on("error", (err) => {
      console.error(
        `[WorldStateLogger] Write error: ${err.message}. Stopping logger.`,
      );
      this.stop();
    });
    this.startTime = Date.now();

    // Get TickSystem from ServerNetwork
    const network = this.world.getSystem("network") as unknown as Record<
      string,
      unknown
    >;
    const tickSystem = network?.tickSystem as {
      onTick: (
        callback: (tickNumber: number, deltaMs: number) => void,
        priority: number,
      ) => () => void;
    };

    if (!tickSystem || typeof tickSystem.onTick !== "function") {
      console.error(
        "[WorldStateLogger] Could not find TickSystem on network system. Logger not started.",
      );
      return;
    }

    // Get TileMovementManager for tile-level movement data
    this.tileMovementManager =
      (network.tileMovementManager as TileMovementManagerLike) || null;
    if (this.tileMovementManager) {
      console.log(
        "[WorldStateLogger] TileMovementManager found — tile data will be logged.",
      );
    }

    // Register at BROADCAST priority (10) — after all game logic
    const BROADCAST_PRIORITY = 10;
    this.unsubscribe = tickSystem.onTick((tickNumber: number) => {
      this.logTick(tickNumber);
    }, BROADCAST_PRIORITY);

    console.log(`[WorldStateLogger] Started. Output: ${filePath}`);
    console.log(`[WorldStateLogger] Session: ${this.sessionId}`);
  }

  stop(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    if (this.outputStream) {
      this.outputStream.end();
      this.outputStream = null;
    }
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
    console.log(
      `[WorldStateLogger] Stopped. ${this.tickCount} ticks logged over ${elapsed}s`,
    );
  }

  private backpressured = false;

  private logTick(tickNumber: number): void {
    if (!this.outputStream || this.backpressured) return;

    const entities = this.collectEntitySnapshots();
    const snapshot: TickSnapshot = {
      tick: tickNumber,
      timestampMs: Date.now(),
      entityCount: entities.length,
      entities,
    };

    // Write with backpressure handling
    const canContinue = this.outputStream.write(
      JSON.stringify(snapshot) + "\n",
    );
    if (!canContinue) {
      this.backpressured = true;
      this.outputStream.once("drain", () => {
        this.backpressured = false;
      });
    }
    this.tickCount++;

    // Periodic maintenance
    if (this.tickCount % 100 === 0) {
      // Prune position tracking for entities that no longer exist
      const currentIds = new Set(entities.map((e) => e.id));
      for (const id of this.previousPositions.keys()) {
        if (!currentIds.has(id)) {
          this.previousPositions.delete(id);
        }
      }
    }

    // Periodic status
    if (this.tickCount % 1000 === 0) {
      console.log(
        `[WorldStateLogger] ${this.tickCount} ticks logged, ${entities.length} entities`,
      );
    }
  }

  private collectEntitySnapshots(): EntitySnapshot[] {
    const snapshots: EntitySnapshot[] = [];
    const seenIds = new Set<string>();

    // 1. Get players from world.getPlayers() — players are stored separately
    //    from EntityManager.entities (they use registerPlayer/unregisterPlayer)
    try {
      const worldWithPlayers = this.world as unknown as {
        getPlayers?: () => Array<Record<string, unknown>>;
        entities?: { getPlayers?: () => Array<Record<string, unknown>> };
      };
      const players =
        worldWithPlayers.getPlayers?.() ||
        worldWithPlayers.entities?.getPlayers?.() ||
        [];
      for (const player of players) {
        const id = (player.id as string) || "";
        if (!id) continue;
        seenIds.add(id);
        const snapshot = this.extractEntityData(id, player);
        if (snapshot) {
          // Force type to player
          snapshot.type = "player";
          snapshots.push(snapshot);
        }
      }
    } catch {
      // getPlayers may not be available
    }

    // 1b. Get random walk bot entities (they're not in the normal player list)
    try {
      const globalWithBots = globalThis as typeof globalThis & {
        __randomWalkBots?: {
          getBotEntities?: () => Array<Record<string, unknown>>;
        };
      };
      const botEntities =
        globalWithBots.__randomWalkBots?.getBotEntities?.() || [];
      for (const bot of botEntities) {
        const id = (bot.id as string) || "";
        if (!id || seenIds.has(id)) continue;
        seenIds.add(id);
        const snapshot = this.extractEntityData(id, bot);
        if (snapshot) {
          snapshot.type = "player";
          // Copy tile data directly from bot entity (already computed)
          if (bot.currentTile)
            snapshot.currentTile = bot.currentTile as [number, number];
          if (bot.targetTile)
            snapshot.targetTile = bot.targetTile as [number, number];
          if (typeof bot.pathLength === "number")
            snapshot.pathLength = bot.pathLength;
          if (typeof bot.isRunning === "boolean")
            snapshot.isRunning = bot.isRunning;
          if (typeof bot.actionType === "string")
            snapshot.actionType =
              bot.actionType as EntitySnapshot["actionType"];
          if (typeof bot.isMoving === "boolean")
            snapshot.isMoving = bot.isMoving;
          if (Array.isArray(bot.movementDelta))
            snapshot.movementDelta = bot.movementDelta as [
              number,
              number,
              number,
            ];
          snapshots.push(snapshot);
        }
      }
    } catch {
      // RandomWalkBots not available
    }

    // 2. Get all other entities from EntityManager
    const entityManager = this.world.getSystem("entity-manager") as {
      entities?: Map<string, unknown>;
    };

    if (entityManager?.entities) {
      for (const [id, rawEntity] of entityManager.entities) {
        if (seenIds.has(id)) continue; // Skip players already captured
        const entity = rawEntity as Record<string, unknown>;
        const snapshot = this.extractEntityData(id, entity);
        if (snapshot) {
          snapshots.push(snapshot);
        }
      }
    }

    return snapshots;
  }

  private extractEntityData(
    id: string,
    entity: Record<string, unknown>,
  ): EntitySnapshot | null {
    // Extract position from node.position (THREE.Vector3) or data.position
    let x = 0,
      y = 0,
      z = 0;
    const node = entity.node as {
      position?: { x: number; y: number; z: number };
      rotation?: { y: number };
    } | null;

    if (node?.position) {
      x = node.position.x;
      y = node.position.y;
      z = node.position.z;
    } else {
      const data = entity.data as {
        position?: [number, number, number];
      } | null;
      if (data?.position) {
        [x, y, z] = data.position;
      }
    }

    // Skip entities at origin with no meaningful data (uninitialized)
    if (x === 0 && y === 0 && z === 0 && !entity.type) return null;

    // Compute movement delta from previous tick
    const prevPos = this.previousPositions.get(id);
    const dx = prevPos ? x - prevPos[0] : 0;
    const dy = prevPos ? y - prevPos[1] : 0;
    const dz = prevPos ? z - prevPos[2] : 0;
    this.previousPositions.set(id, [x, y, z]);

    // Extract rotation (Y-axis)
    let rotation = 0;
    if (node?.rotation) {
      rotation = node.rotation.y;
    } else {
      const data = entity.data as {
        quaternion?: [number, number, number, number];
      } | null;
      if (data?.quaternion) {
        // Convert quaternion to Y rotation: atan2(2*(w*y + x*z), 1 - 2*(y*y + z*z))
        // For Y-axis-only rotation with quaternion [x, y, z, w]:
        const [qx, qy, qz, qw] = data.quaternion;
        rotation = Math.atan2(
          2 * (qw * qy + qx * qz),
          1 - 2 * (qy * qy + qz * qz),
        );
      }
    }

    // Extract type
    const entityType = (entity.type as string) || "unknown";

    // Extract health
    const health = typeof entity.health === "number" ? entity.health : 0;
    const maxHealth =
      typeof entity.maxHealth === "number" ? entity.maxHealth : 0;

    // Extract combat state (for players and mobs)
    let inCombat = false;
    let combatTargetId: string | null = null;
    const data = entity.data as Record<string, unknown> | null;
    if (data) {
      if (typeof data.inCombat === "boolean") inCombat = data.inCombat;
      if (typeof data.combatTarget === "string")
        combatTargetId = data.combatTarget;
      if (data.combat && typeof data.combat === "object") {
        const combat = data.combat as Record<string, unknown>;
        if (typeof combat.inCombat === "boolean") inCombat = combat.inCombat;
        if (typeof combat.combatTarget === "string")
          combatTargetId = combat.combatTarget;
      }
    }

    // Check if moving
    const isMoving = Math.abs(dx) > 0.001 || Math.abs(dz) > 0.001;

    // Animation state (best-effort extraction)
    let animationState = "idle";
    if (isMoving) animationState = "walk";
    if (inCombat) animationState = "combat";
    const activeAnim = entity.activeAnimation as string | undefined;
    if (activeAnim) animationState = activeAnim;

    // ── Tile movement data ───────────────────────────────────────────────
    let currentTile: [number, number] | null = null;
    let targetTile: [number, number] | null = null;
    let pathLength = 0;
    let isRunning = false;

    if (
      this.tileMovementManager &&
      (entityType === "player" || entity.isPlayer)
    ) {
      // Try public API first
      const ct = this.tileMovementManager.getCurrentTile?.(id);
      if (ct) currentTile = [ct.x, ct.z];

      // Access internal state for target tile and path info
      const state = this.tileMovementManager.playerStates?.get(id);
      if (state) {
        if (!currentTile)
          currentTile = [state.currentTile.x, state.currentTile.z];
        isRunning = state.isRunning;

        // Target tile: requestedDestination (original click target) or last tile in path
        if (state.requestedDestination) {
          targetTile = [
            state.requestedDestination.x,
            state.requestedDestination.z,
          ];
        } else if (
          state.path.length > 0 &&
          state.pathIndex < state.path.length
        ) {
          const lastTile = state.path[state.path.length - 1];
          targetTile = [lastTile.x, lastTile.z];
        }

        // Remaining path length
        pathLength = Math.max(0, state.path.length - state.pathIndex);
      }
    }

    // ── Action type classification ───────────────────────────────────────
    let actionType: "idle" | "move" | "combat" | "gather" | "interact" = "idle";
    if (inCombat) {
      actionType = "combat";
    } else if (isMoving || pathLength > 0) {
      actionType = "move";
    }
    // TODO: detect gather/interact from pending action queue if available

    return {
      id,
      type: entityType,
      name: (entity.name as string) || "",
      position: [
        Math.round(x * 1000) / 1000,
        Math.round(y * 1000) / 1000,
        Math.round(z * 1000) / 1000,
      ],
      rotation: Math.round(rotation * 1000) / 1000,
      health,
      maxHealth,
      inCombat,
      combatTargetId,
      movementDelta: [
        Math.round(dx * 1000) / 1000,
        Math.round(dy * 1000) / 1000,
        Math.round(dz * 1000) / 1000,
      ],
      isMoving,
      animationState,
      level: typeof entity.level === "number" ? entity.level : 0,
      currentTile,
      targetTile,
      pathLength,
      isRunning,
      actionType,
    };
  }

  /** Prune position tracking for entities that no longer exist. */
  pruneStaleEntities(currentEntityIds: Set<string>): void {
    for (const id of this.previousPositions.keys()) {
      if (!currentEntityIds.has(id)) {
        this.previousPositions.delete(id);
      }
    }
  }
}

/**
 * Initialize the WorldStateLogger if enabled via environment variable.
 * Call this after world.init() and after agents have been spawned.
 */
export function initWorldStateLogger(world: World): WorldStateLogger | null {
  const enabled =
    process.env.WORLD_STATE_LOGGER_ENABLED === "true" ||
    process.env.WORLD_STATE_LOGGER_ENABLED === "1";

  if (!enabled) {
    console.log(
      "[WorldStateLogger] Disabled. Set WORLD_STATE_LOGGER_ENABLED=true to enable.",
    );
    return null;
  }

  const logger = new WorldStateLogger(world);
  logger.start();
  return logger;
}

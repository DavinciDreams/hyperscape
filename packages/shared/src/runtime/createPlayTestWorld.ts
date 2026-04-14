/**
 * Play-In-Editor (PIE) World Factory
 *
 * Creates a lightweight ECS world with gameplay systems for local simulation
 * inside World Studio. Runs game logic only — no networking, no graphics.
 * The editor viewport handles rendering via entity transform sync.
 *
 * Architecture:
 * - World constructor provides: settings, anchors, events, chat, entities, stage
 * - We remove the default physics system (no PhysX in editor for now)
 * - RPG systems are registered for future expansion (combat, inventory, etc.)
 * - A PIENetworkStub replaces ClientNetwork so systems don't crash on send()
 * - Tick loop is driven externally by the PIE session (requestAnimationFrame)
 *
 * Used by: usePIESession hook in World Studio
 */

// Note: This module is self-contained — no dependency on the full World/ECS stack.
// Future expansion will integrate with the World class for full RPG system support.

// ---------------------------------------------------------------------------
// PIE Network Stub
// ---------------------------------------------------------------------------

/**
 * Minimal network stub that satisfies systems expecting world.network.
 * All send() calls are no-ops; the PIE world runs entirely locally.
 */
class PIENetworkStub {
  readonly isClient = true;
  readonly isServer = false;
  readonly connected = true;
  readonly id = "pie-local-player";
  readonly serverTimeOffset = 0;
  readonly worldTimeOffset = 0;

  send(_name: string, _data?: unknown): void {
    // No-op — PIE is local-only
  }

  async init(): Promise<void> {
    // No connection to establish
  }

  async disconnect(): Promise<void> {
    // Nothing to disconnect
  }
}

// ---------------------------------------------------------------------------
// PIE Entity — lightweight entity representation for scene sync
// ---------------------------------------------------------------------------

export interface PIEEntity {
  id: string;
  type: "player" | "mob" | "npc" | "resource" | "station";
  position: { x: number; y: number; z: number };
  rotation: number;
  name: string;
  /** Mob-specific: patrol center */
  patrolCenter?: { x: number; z: number };
  /** Mob-specific: patrol radius */
  patrolRadius?: number;
  /** Current movement target for patrol animation */
  moveTarget?: { x: number; z: number } | null;
  /** Mob-specific: mob ID from manifest */
  mobId?: string;
  /** Resource-specific: resource type */
  resourceType?: string;
  /** Station-specific: station type */
  stationType?: string;
  /** NPC-specific: NPC type */
  npcType?: string;
}

// ---------------------------------------------------------------------------
// PIE World Options
// ---------------------------------------------------------------------------

export interface PlayTestWorldOptions {
  /** Mob spawn data from World Studio manifest */
  mobSpawns?: Array<{
    id: string;
    mobId: string;
    name: string;
    position: { x: number; y: number; z: number };
    spawnRadius: number;
    maxCount: number;
  }>;
  /** NPC data from manifest */
  npcs?: Array<{
    id: string;
    type: string;
    name: string;
    position: { x: number; y: number; z: number };
  }>;
  /** Resource data from manifest */
  resources?: Array<{
    id: string;
    resourceId: string;
    resourceType: string;
    name: string;
    position: { x: number; y: number; z: number };
  }>;
  /** Station data from manifest */
  stations?: Array<{
    id: string;
    type: string;
    position: { x: number; y: number; z: number };
  }>;
  /** Player spawn position */
  playerSpawn?: { x: number; y: number; z: number };
}

// ---------------------------------------------------------------------------
// PIE World
// ---------------------------------------------------------------------------

/**
 * Lightweight game world for Play-In-Editor.
 * Manages entity state and simple AI behavior without full ECS overhead.
 */
export class PlayTestWorld {
  readonly entities = new Map<string, PIEEntity>();
  private _tickCount = 0;
  private _isRunning = false;
  private _networkStub = new PIENetworkStub();

  /** Player entity (always exists while PIE is active) */
  player: PIEEntity | null = null;

  /** Network stub for systems that check world.network */
  get network(): PIENetworkStub {
    return this._networkStub;
  }

  get isRunning(): boolean {
    return this._isRunning;
  }

  /**
   * Initialize the PIE world with manifest data.
   * Spawns all entities from the provided options.
   */
  start(options: PlayTestWorldOptions): void {
    this._isRunning = true;
    this._tickCount = 0;
    this.entities.clear();

    // Spawn player
    const spawn = options.playerSpawn ?? { x: 0, y: 2, z: 0 };
    this.player = {
      id: "pie-player",
      type: "player",
      position: { ...spawn },
      rotation: 0,
      name: "Player",
    };
    this.entities.set(this.player.id, this.player);

    // Spawn mobs from manifest
    if (options.mobSpawns) {
      for (const ms of options.mobSpawns) {
        for (let i = 0; i < ms.maxCount; i++) {
          // Distribute mobs within spawn radius
          const angle = (i / ms.maxCount) * Math.PI * 2;
          const dist = ms.spawnRadius * 0.5;
          const entity: PIEEntity = {
            id: `mob_${ms.id}_${i}`,
            type: "mob",
            position: {
              x: ms.position.x + Math.cos(angle) * dist,
              y: ms.position.y,
              z: ms.position.z + Math.sin(angle) * dist,
            },
            rotation: angle,
            name: ms.name,
            mobId: ms.mobId,
            patrolCenter: { x: ms.position.x, z: ms.position.z },
            patrolRadius: ms.spawnRadius,
            moveTarget: null,
          };
          this.entities.set(entity.id, entity);
        }
      }
    }

    // Spawn NPCs from manifest
    if (options.npcs) {
      for (const npc of options.npcs) {
        const entity: PIEEntity = {
          id: `npc_${npc.id}`,
          type: "npc",
          position: { ...npc.position },
          rotation: 0,
          name: npc.name,
          npcType: npc.type,
        };
        this.entities.set(entity.id, entity);
      }
    }

    // Spawn resources from manifest
    if (options.resources) {
      for (const res of options.resources) {
        const entity: PIEEntity = {
          id: `resource_${res.id}`,
          type: "resource",
          position: { ...res.position },
          rotation: 0,
          name: res.name,
          resourceType: res.resourceType,
        };
        this.entities.set(entity.id, entity);
      }
    }

    // Spawn stations from manifest
    if (options.stations) {
      for (const station of options.stations) {
        const entity: PIEEntity = {
          id: `station_${station.id}`,
          type: "station",
          position: { ...station.position },
          rotation: 0,
          name: station.type,
          stationType: station.type,
        };
        this.entities.set(entity.id, entity);
      }
    }

    console.log(
      `[PIE] Started with ${this.entities.size} entities ` +
        `(${options.mobSpawns?.length ?? 0} mob spawns, ` +
        `${options.npcs?.length ?? 0} NPCs, ` +
        `${options.resources?.length ?? 0} resources)`,
    );
  }

  /**
   * Advance the simulation by one tick.
   * Called from requestAnimationFrame (~60fps).
   */
  tick(deltaTime: number): void {
    if (!this._isRunning) return;
    this._tickCount++;

    for (const entity of this.entities.values()) {
      // Mob patrol AI — simple wander behavior
      if (entity.type === "mob" && entity.patrolCenter) {
        // Pick a new patrol target every ~3 seconds (180 ticks at 60fps)
        if (!entity.moveTarget || this._tickCount % 180 === 0) {
          const angle = Math.random() * Math.PI * 2;
          const dist = Math.random() * entity.patrolRadius!;
          entity.moveTarget = {
            x: entity.patrolCenter.x + Math.cos(angle) * dist,
            z: entity.patrolCenter.z + Math.sin(angle) * dist,
          };
        }

        // Move toward target
        if (entity.moveTarget) {
          const dx = entity.moveTarget.x - entity.position.x;
          const dz = entity.moveTarget.z - entity.position.z;
          const distSq = dx * dx + dz * dz;

          if (distSq > 0.25) {
            const speed = 2 * deltaTime;
            const dist = Math.sqrt(distSq);
            entity.position.x += (dx / dist) * speed;
            entity.position.z += (dz / dist) * speed;
            entity.rotation = Math.atan2(dx, dz);
          } else {
            entity.moveTarget = null;
          }
        }
      }

      // NPC face-toward-player behavior
      if (entity.type === "npc" && this.player) {
        const dx = this.player.position.x - entity.position.x;
        const dz = this.player.position.z - entity.position.z;
        if (dx * dx + dz * dz < 100) {
          entity.rotation = Math.atan2(dx, dz);
        }
      }
    }
  }

  /**
   * Stop the simulation and clear all entities.
   */
  stop(): void {
    this._isRunning = false;
    this.player = null;
    this.entities.clear();
    console.log("[PIE] Stopped");
  }
}

// ---------------------------------------------------------------------------
// Factory function
// ---------------------------------------------------------------------------

/**
 * Create a new Play-In-Editor world instance.
 *
 * Usage:
 * ```typescript
 * const pieWorld = createPlayTestWorld();
 * pieWorld.start({ mobSpawns, npcs, resources, playerSpawn });
 * // In animation loop:
 * pieWorld.tick(deltaTime);
 * // On stop:
 * pieWorld.stop();
 * ```
 */
export function createPlayTestWorld(): PlayTestWorld {
  return new PlayTestWorld();
}

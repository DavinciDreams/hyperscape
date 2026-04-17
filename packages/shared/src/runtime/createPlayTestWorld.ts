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

import {
  PIEScriptRunner,
  type PIEDebugEntry,
  type PIEDebugSink,
} from "./PIEScriptRunner";
import type { RuntimeScriptGraph } from "../systems/shared/scripting/ScriptGraphInterpreter";
import type { GameMode, GameModeManifest } from "../gameMode/GameMode";
import {
  HYPERIA_DEFAULT_MANIFEST,
  gameModeRegistry,
  registerAlternateGameModes,
  registerHyperiaGameMode,
} from "../gameMode";

export type { PIEDebugEntry, PIEDebugSink } from "./PIEScriptRunner";

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
  /** Optional behavior graph attached to this entity (PIE-only). */
  behaviorGraph?: RuntimeScriptGraph;
  /**
   * Per-entity proximity-trigger state.
   * `true` = player is currently within `proximityRadius`; used to debounce
   * `player:nearby` so the trigger fires once per enter, not every tick.
   */
  _playerNearby?: boolean;
  /** Distance at which `player:nearby` fires. Defaults to 5 metres. */
  proximityRadius?: number;
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
    /** Optional behavior graph; applied to every spawned mob in this group. */
    behaviorGraph?: RuntimeScriptGraph;
  }>;
  /** NPC data from manifest */
  npcs?: Array<{
    id: string;
    type: string;
    name: string;
    position: { x: number; y: number; z: number };
    behaviorGraph?: RuntimeScriptGraph;
  }>;
  /** Resource data from manifest */
  resources?: Array<{
    id: string;
    resourceId: string;
    resourceType: string;
    name: string;
    position: { x: number; y: number; z: number };
    behaviorGraph?: RuntimeScriptGraph;
  }>;
  /** Station data from manifest */
  stations?: Array<{
    id: string;
    type: string;
    position: { x: number; y: number; z: number };
    behaviorGraph?: RuntimeScriptGraph;
  }>;
  /** Player spawn position */
  playerSpawn?: { x: number; y: number; z: number };
  /** Optional sink that receives every script debug entry. */
  debugSink?: PIEDebugSink;
  /**
   * GameMode manifest for this session. Omit to use the Hyperia
   * default (click-to-walk + orbit + hyperia-default input). The
   * manifest id determines which controller the consumer (usePIESession)
   * activates for the viewport.
   */
  gameMode?: GameModeManifest;
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
  /** Script runtime — created lazily on first start(). */
  private _scripts: PIEScriptRunner | null = null;
  /** Default proximity radius (metres) for `player:nearby`. */
  private static readonly DEFAULT_PROXIMITY_RADIUS = 5;

  /** Player entity (always exists while PIE is active) */
  player: PIEEntity | null = null;

  /**
   * Resolved GameMode for the active session. Null before `start()` or
   * after `stop()`. Consumers (usePIESession) branch on `gameMode.id`
   * to decide which viewport controller to activate — click-to-walk
   * (matches the live Hyperia client) or an alternate WASD/topdown
   * controller registered by a downstream game.
   */
  gameMode: GameMode | null = null;

  /** Network stub for systems that check world.network */
  get network(): PIENetworkStub {
    return this._networkStub;
  }

  get isRunning(): boolean {
    return this._isRunning;
  }

  /** Access the script runner (null before start() / after stop()). */
  get scripts(): PIEScriptRunner | null {
    return this._scripts;
  }

  /**
   * Initialize the PIE world with manifest data.
   * Spawns all entities from the provided options.
   */
  start(options: PlayTestWorldOptions): void {
    this._isRunning = true;
    this._tickCount = 0;
    this.entities.clear();

    // Resolve GameMode. Defaults to Hyperia's click-to-walk composition
    // so PIE behaves the same as the live client out of the box. A
    // downstream game supplies its own manifest (e.g. wasd-default) once
    // registered in the shared gameModeRegistry.
    // `register` overwrites on duplicate, safe for repeat start() calls.
    registerHyperiaGameMode(gameModeRegistry);
    registerAlternateGameModes(gameModeRegistry);
    const manifest = options.gameMode ?? HYPERIA_DEFAULT_MANIFEST;
    this.gameMode = gameModeRegistry.resolve(manifest, {
      // PlayTestWorld is not a full `World`; the context.world field is
      // kept optional at the controller level (InteractionRouter and
      // ClientCameraSystem cannot run inside PIE today). The mode acts
      // as metadata here — usePIESession reads `mode.id` to branch.
      world: this as unknown as import("../core/World").World,
      runtime: "pie",
    });

    // Spin up the scripting runtime. Entity lookup resolves to the entity's
    // mutable record so action handlers can read live position / rotation.
    this._scripts = new PIEScriptRunner({
      entityLookup: (id) => {
        const e = this.entities.get(id);
        return e ? (e as unknown as Record<string, unknown>) : null;
      },
      debugSink: options.debugSink,
    });

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
            behaviorGraph: ms.behaviorGraph,
          };
          this.entities.set(entity.id, entity);
          if (ms.behaviorGraph) {
            this._scripts!.loadGraph(entity.id, ms.behaviorGraph);
          }
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
          behaviorGraph: npc.behaviorGraph,
        };
        this.entities.set(entity.id, entity);
        if (npc.behaviorGraph) {
          this._scripts!.loadGraph(entity.id, npc.behaviorGraph);
        }
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
          behaviorGraph: res.behaviorGraph,
        };
        this.entities.set(entity.id, entity);
        if (res.behaviorGraph) {
          this._scripts!.loadGraph(entity.id, res.behaviorGraph);
        }
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
          behaviorGraph: station.behaviorGraph,
        };
        this.entities.set(entity.id, entity);
        if (station.behaviorGraph) {
          this._scripts!.loadGraph(entity.id, station.behaviorGraph);
        }
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

    // Drive the script runtime — resumes any delayed continuations.
    this._scripts?.tick(deltaTime);

    // Emit player-proximity triggers (debounced via _playerNearby flag).
    if (this.player && this._scripts) {
      const px = this.player.position.x;
      const pz = this.player.position.z;
      for (const entity of this.entities.values()) {
        if (entity.type === "player") continue;
        // Only emit for entities that have a graph; saves work otherwise.
        if (!entity.behaviorGraph) continue;
        const radius =
          entity.proximityRadius ?? PlayTestWorld.DEFAULT_PROXIMITY_RADIUS;
        const dx = entity.position.x - px;
        const dz = entity.position.z - pz;
        const within = dx * dx + dz * dz <= radius * radius;
        if (within && !entity._playerNearby) {
          entity._playerNearby = true;
          this._scripts.emit("player:nearby", {
            entityId: entity.id,
            playerId: this.player.id,
            distance: Math.sqrt(dx * dx + dz * dz),
          });
        } else if (!within && entity._playerNearby) {
          entity._playerNearby = false;
        }
      }
    }

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
    this._scripts?.stop();
    this._scripts = null;
    this.player = null;
    this.gameMode = null;
    this.entities.clear();
    console.log("[PIE] Stopped");
  }

  /**
   * Fire `entity:interacted` for the given entity. Called from the editor
   * viewport when the user clicks a marker while PIE is active. The event
   * name matches `trigger/onInteract`'s subscription in TriggerEvaluator.
   */
  interactWith(entityId: string): void {
    if (!this._scripts || !this.player) return;
    const entity = this.entities.get(entityId);
    if (!entity) return;
    this._scripts.emit("entity:interacted", {
      entityId,
      playerId: this.player.id,
      npcId: entity.type === "npc" ? entity.id : undefined,
    });
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

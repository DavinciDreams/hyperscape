import { ALL_NPCS, getNPCById } from "../../../data/npcs";
import { ALL_WORLD_AREAS } from "../../../data/world-areas";
import { DataManager } from "../../../data/DataManager";
import type { WorldJsonMobSpawn } from "../../../data/world-structure";
import type {
  LevelRange,
  NPCData,
  MobSpawnStats,
} from "../../../types/core/core";
import { EntityType, InteractionType } from "../../../types/entities/entities";
import { EventType } from "../../../types/events";
import type { World } from "../../../types/index";
import type { EntitySpawnedEvent } from "../../../types/systems/system-interfaces";
import { SystemBase } from "../infrastructure/SystemBase";
// NOTE: Import directly to avoid circular dependency through barrel file
import { EntityManager } from "./EntityManager";
import { TerrainSystem } from "../world/TerrainSystem";
import type { TownSystem } from "../world/TownSystem";

// Types are now imported from shared type files

/**
 * Mob NPC Spawner System
 *
 * Uses EntityManager to spawn mob entities instead of MobApp objects.
 * Creates and manages all combat NPC instances (mobs, bosses, quest enemies)
 * across the world based on GDD specifications.
 */
type SpawnedMobDetail = {
  spawnKey: string;
  mobId: string;
  mobType: string;
  level: number;
  position: { x: number; y: number; z: number };
  levelRange: LevelRange;
  isBoss: boolean;
};

type SpawnMobOptions = {
  level?: number;
  levelRange?: LevelRange;
  isBoss?: boolean;
  spawnKey?: string;
};

export class MobNPCSpawnerSystem extends SystemBase {
  private spawnedMobs = new Map<string, string>(); // mobId -> entityId
  private spawnedMobDetails = new Map<string, SpawnedMobDetail>();
  private entityIdToSpawnKey = new Map<string, string>();
  private spawnedBossHotspots = new Set<string>();
  private mobIdCounter = 0;
  private terrainSystem!: TerrainSystem;
  private townSystem: TownSystem | null = null;
  private lastSpawnTime = 0;
  private readonly SPAWN_COOLDOWN = 5000; // 5 seconds between spawns
  private readonly BIOME_SPAWNS_PER_TILE = 3;

  constructor(world: World) {
    super(world, {
      name: "mob-npc-spawner",
      dependencies: {
        required: ["entity-manager", "terrain"], // Depends on EntityManager and terrain for placement
        optional: ["mob-npc", "towns"], // Better with mob NPC system, towns for safe zone checking
      },
      autoCleanup: true,
    });
  }

  async init(): Promise<void> {
    // Get terrain system reference
    this.terrainSystem = this.world.getSystem<TerrainSystem>("terrain")!;

    // Get town system reference for safe zone checking (procedural towns)
    this.townSystem = this.world.getSystem<TownSystem>("towns") ?? null;

    // Set up event subscriptions for mob lifecycle (do not consume MOB_NPC_SPAWN_REQUEST to avoid re-emission loops)
    this.subscribe<{ mobId: string }>(EventType.MOB_NPC_DESPAWN, (data) => {
      this.despawnMob(data.mobId);
    });
    this.subscribe(EventType.MOB_NPC_RESPAWN_ALL, (_event) =>
      this.respawnAllMobs(),
    );

    // Subscribe to terrain generation to spawn mobs for new tiles
    this.subscribe(EventType.TERRAIN_TILE_GENERATED, (data) =>
      this.onTileGenerated(
        data as { tileX: number; tileZ: number; biome: string },
      ),
    );

    // Listen for entity spawned events to track our mobs
    this.subscribe<EntitySpawnedEvent>(EventType.ENTITY_SPAWNED, (data) => {
      // Only handle mob entities
      if (data.entityType === "mob") {
        this.handleEntitySpawned(data);
      }
    });
  }

  async start(): Promise<void> {
    // Spawn NPCs immediately at world start (they're static, not reactive to terrain)
    // NPCs like bank clerks, shopkeepers should be available from the start
    if (this.world.isServer) {
      await this.spawnAllNPCsFromManifest();
      // Spawn procedural building NPCs inside town buildings
      await this.spawnBuildingNPCs();
    }
    // Additional mobs are spawned reactively as terrain tiles generate via biomes.json
  }

  /**
   * Spawn all NPCs defined in world-areas.json immediately
   * Unlike mobs, NPCs are static and should be available at world start
   */
  private async spawnAllNPCsFromManifest(): Promise<void> {
    // Wait for EntityManager to be ready
    let entityManager = this.world.getSystem<EntityManager>("entity-manager");
    let attempts = 0;

    while (!entityManager && attempts < 50) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      entityManager = this.world.getSystem<EntityManager>("entity-manager");
      attempts++;
    }

    if (!entityManager) {
      console.error(
        "[MobNPCSpawnerSystem] ❌ EntityManager not available for NPC spawning",
      );
      return;
    }

    const terrainSystem = this.terrainSystem;

    for (const area of Object.values(ALL_WORLD_AREAS)) {
      if (!area.npcs || area.npcs.length === 0) continue;

      for (const npc of area.npcs) {
        // Get ground height at NPC position
        const groundY = terrainSystem.getHeightAt(
          npc.position.x,
          npc.position.z,
        );
        // NPCs should be at ground level (not +1m), the model's pivot handles foot placement
        const spawnY = groundY;

        // ALL NPC data comes from npcs.json manifest - world-areas only provides position/type
        const npcManifestData = getNPCById(npc.id);
        if (!npcManifestData) {
          console.warn(
            `[MobNPCSpawnerSystem] ⚠️ NPC ${npc.id} not found in npcs.json manifest!`,
          );
          continue; // Skip NPCs not in manifest
        }

        const modelPath =
          npcManifestData.appearance?.modelPath ||
          "asset://models/human/human_rigged.glb";
        const npcServices = npcManifestData.services?.types || [];
        const npcQuestIds = npcManifestData.services?.questIds as
          | string[]
          | undefined;
        const npcDescription = npcManifestData.description || npc.id;
        const npcName = npcManifestData.name || npc.id;

        const npcConfig = {
          id: `npc_${npc.id}_${Date.now()}`,
          type: EntityType.NPC,
          name: npcName, // From npcs.json
          position: { x: npc.position.x, y: spawnY, z: npc.position.z },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          scale: { x: 100, y: 100, z: 100 }, // Scale up rigged models
          visible: true,
          interactable: true,
          interactionType: InteractionType.TALK,
          interactionDistance: 3,
          description: npcDescription, // From npcs.json
          model: modelPath, // From npcs.json
          properties: {
            movementComponent: null,
            combatComponent: null,
            healthComponent: null,
            visualComponent: null,
            health: { current: 1, max: 1 },
            level: 1,
          },
          npcType: npc.type, // From world-areas (bank, store, etc.)
          npcId: npc.id, // Manifest ID for dialogue lookup
          dialogueLines: [],
          services: npcServices, // From npcs.json
          questIds: npcQuestIds, // Quest IDs from npcs.json
          inventory: [],
          skillsOffered: [],
          questsAvailable: [],
        };

        try {
          await entityManager.spawnEntity(npcConfig);
          console.log(
            `[MobNPCSpawnerSystem] ✅ Spawned NPC ${npc.id} (${npcName}) at (${npc.position.x}, ${spawnY.toFixed(2)}, ${npc.position.z})`,
          );
        } catch (err) {
          console.error(
            `[MobNPCSpawnerSystem] ❌ Failed to spawn NPC ${npc.id}:`,
            err,
          );
        }
      }
    }
  }

  /**
   * Look up building NPC config from manifests by buildingRole.
   * Falls back to a generic config if no manifest entry matches.
   */
  private static getBuildingNPCConfig(npcType: string): {
    name: string;
    description: string;
    services: string[];
    model: string;
  } | null {
    // Search manifest NPCs by buildingRole match
    for (const npc of ALL_NPCS.values()) {
      if (npc.buildingRole === npcType) {
        return {
          name: npc.name,
          description:
            npc.description ?? `A ${npc.name} working in this building.`,
          services: npc.services?.types ?? [],
          model:
            npc.appearance?.modelPath ??
            "asset://models/npcs/default/default.vrm",
        };
      }
    }
    // Try direct ID lookup as fallback
    const byId = getNPCById(npcType);
    if (byId) {
      return {
        name: byId.name,
        description: byId.description ?? `A ${byId.name}.`,
        services: byId.services?.types ?? [],
        model:
          byId.appearance?.modelPath ??
          "asset://models/npcs/default/default.vrm",
      };
    }
    return null;
  }

  /**
   * Spawn procedural NPCs inside town buildings.
   * Uses TownSystem.getAllBuildingNPCSpawnPoints() to get spawn positions
   * computed from building layouts (behind counters, near forges, etc.).
   */
  private async spawnBuildingNPCs(): Promise<void> {
    if (!this.townSystem) {
      console.log(
        "[MobNPCSpawnerSystem] No TownSystem available - skipping building NPCs",
      );
      return;
    }

    const entityManager = this.world.getSystem<EntityManager>("entity-manager");
    if (!entityManager) {
      console.error(
        "[MobNPCSpawnerSystem] ❌ EntityManager not available for building NPC spawning",
      );
      return;
    }

    const spawnPoints = this.townSystem.getAllBuildingNPCSpawnPoints();
    if (spawnPoints.length === 0) {
      console.log("[MobNPCSpawnerSystem] No building NPC spawn points found");
      return;
    }

    let spawnedCount = 0;
    for (const point of spawnPoints) {
      const config = MobNPCSpawnerSystem.getBuildingNPCConfig(point.npcType);
      if (!config) {
        console.warn(
          `[MobNPCSpawnerSystem] ⚠️ Unknown building NPC type: ${point.npcType}`,
        );
        continue;
      }

      // Unique NPC name per building: e.g. "Innkeeper of Oakvale"
      const npcName = `${config.name} of ${point.townName}`;
      const npcId = `building_npc_${point.buildingId}_${Date.now()}`;

      // Convert rotation (radians) to quaternion for Y-axis rotation
      const halfAngle = point.rotation / 2;
      const qw = Math.cos(halfAngle);
      const qy = Math.sin(halfAngle);

      const npcConfig = {
        id: npcId,
        type: EntityType.NPC,
        name: npcName,
        position: point.position,
        rotation: { x: 0, y: qy, z: 0, w: qw },
        scale: { x: 100, y: 100, z: 100 },
        visible: true,
        interactable: true,
        interactionType: InteractionType.TALK,
        interactionDistance: 3,
        description: config.description,
        model: config.model,
        properties: {
          movementComponent: null,
          combatComponent: null,
          healthComponent: null,
          visualComponent: null,
          health: { current: 1, max: 1 },
          level: 1,
        },
        npcType: point.npcType,
        npcId: point.buildingId,
        dialogueLines: [],
        services: config.services,
        inventory: [],
        skillsOffered: [],
        questsAvailable: [],
      };

      try {
        await entityManager.spawnEntity(npcConfig);
        spawnedCount++;
      } catch (err) {
        console.error(
          `[MobNPCSpawnerSystem] ❌ Failed to spawn building NPC ${npcId}:`,
          err,
        );
      }
    }

    console.log(
      `[MobNPCSpawnerSystem] ✅ Spawned ${spawnedCount}/${spawnPoints.length} building NPCs across ${this.townSystem.getTowns().length} towns`,
    );
  }

  private getMobLevelRange(mobData: NPCData): LevelRange {
    const fallback = {
      min: mobData.stats.level,
      max: mobData.stats.level,
    };

    const range = mobData.levelRange;
    if (!range) {
      return fallback;
    }

    const min = Math.max(1, Math.floor(range.min));
    const max = Math.max(min, Math.floor(range.max));
    return { min, max };
  }

  private clampLevelToRange(level: number, range: LevelRange): number {
    if (level < range.min) return range.min;
    if (level > range.max) return range.max;
    return level;
  }

  private selectMobForLevel(
    mobTypes: string[],
    targetLevel: number,
    rng?: () => number,
  ): { mobData: NPCData; levelRange: LevelRange } | null {
    const candidates: Array<{
      mobData: NPCData;
      levelRange: LevelRange;
      distance: number;
    }> = [];

    for (const mobType of mobTypes) {
      const mobData = getNPCById(mobType);
      if (!mobData) continue;
      if (mobData.category !== "mob") continue;

      const levelRange = this.getMobLevelRange(mobData);
      const distance =
        targetLevel < levelRange.min
          ? levelRange.min - targetLevel
          : targetLevel > levelRange.max
            ? targetLevel - levelRange.max
            : 0;

      candidates.push({ mobData, levelRange, distance });
    }

    if (candidates.length === 0) {
      return null;
    }

    const inRange = candidates.filter((candidate) => candidate.distance === 0);
    const pool = inRange.length > 0 ? inRange : candidates;
    const minDistance = Math.min(
      ...pool.map((candidate) => candidate.distance),
    );
    const closest = pool.filter(
      (candidate) => candidate.distance === minDistance,
    );
    const roll = rng ? rng() : Math.random();
    const pickIndex = Math.floor(roll * closest.length);
    const selected = closest[pickIndex] ?? closest[0];
    return {
      mobData: selected.mobData,
      levelRange: selected.levelRange,
    };
  }

  private selectBossForHotspot(seed: number): NPCData | null {
    const bosses = Array.from(ALL_NPCS.values()).filter(
      (npc) => npc.category === "boss" && npc.spawnCategory === "world",
    );
    if (bosses.length === 0) {
      return null;
    }
    const index = Math.min(bosses.length - 1, Math.floor(seed * bosses.length));
    return bosses[index] ?? bosses[0];
  }

  private async spawnMobFromData(
    mobData: NPCData,
    position: { x: number; y: number; z: number },
    options?: SpawnMobOptions,
  ): Promise<void> {
    // Check if position is in a procedural town safe zone - don't spawn mobs there
    if (
      this.townSystem &&
      this.townSystem.isInSafeZone(position.x, position.z)
    ) {
      return;
    }

    const resolvedRange =
      options && options.levelRange
        ? options.levelRange
        : this.getMobLevelRange(mobData);
    const requestedLevel =
      options && typeof options.level === "number"
        ? options.level
        : mobData.stats.level;
    const level = this.clampLevelToRange(requestedLevel, resolvedRange);

    // Use spawn point position as key to prevent duplicates (same spot = same mob)
    const spawnKey =
      options && options.spawnKey
        ? options.spawnKey
        : `${mobData.id}_${Math.round(position.x)}_${Math.round(position.z)}`;

    // Check if we already spawned at this location
    if (this.spawnedMobs.has(spawnKey)) {
      return;
    }

    // Generate unique mob ID for the entity
    const mobId = `gdd_${mobData.id}_${this.mobIdCounter++}`;

    // Track this spawn point BEFORE spawning to prevent race conditions
    this.spawnedMobs.set(spawnKey, mobId);
    this.entityIdToSpawnKey.set(mobId, spawnKey);
    const isBoss = options?.isBoss === true;
    this.spawnedMobDetails.set(spawnKey, {
      spawnKey,
      mobId,
      mobType: mobData.id,
      level,
      position,
      levelRange: resolvedRange,
      isBoss,
    });

    // Get EntityManager to spawn directly (like original spawnDefaultMob)
    const entityManager = this.world.getSystem<EntityManager>("entity-manager");
    if (!entityManager) {
      console.error("[MobNPCSpawnerSystem] EntityManager not available");
      return;
    }

    const scaled = entityManager.getScaledMobStats(mobData.id, level);

    // Build COMPLETE config from manifest data (matching original hardcoded format)
    const mobConfig = {
      id: mobId,
      type: EntityType.MOB,
      name: `${mobData.name} (Lv${level})`,
      position: position,
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: {
        x: mobData.appearance.scale ?? 1,
        y: mobData.appearance.scale ?? 1,
        z: mobData.appearance.scale ?? 1,
      },
      visible: true,
      interactable: true,
      interactionType: InteractionType.ATTACK,
      interactionDistance: 10,
      description: `${mobData.description} (Level ${level})`,
      model: mobData.appearance.modelPath,
      properties: {
        movementComponent: null,
        combatComponent: null,
        healthComponent: null,
        visualComponent: null,
        health: { current: scaled.maxHealth, max: scaled.maxHealth },
        level: level,
      },
      // MobEntity specific - from manifest
      mobType: mobData.id,
      level,
      currentHealth: scaled.maxHealth,
      maxHealth: scaled.maxHealth,
      attack: scaled.attack,
      attackPower: scaled.attackPower,
      defense: scaled.defense,
      defenseBonus: scaled.defenseBonus,
      attackSpeedTicks: scaled.attackSpeedTicks,
      moveSpeed: scaled.moveSpeed,
      xpReward: scaled.xpReward,
      lootTable: mobData.drops.common.map((drop) => ({
        itemId: drop.itemId,
        minQuantity: drop.minQuantity,
        maxQuantity: drop.maxQuantity,
        chance: drop.chance,
      })),
      spawnPoint: position,
      aggressive: mobData.combat.aggressive,
      retaliates: mobData.combat.retaliates,
      attackable: mobData.combat.attackable ?? true,
      movementType: mobData.movement.type,
      aggroRange: scaled.aggroRange,
      combatRange: scaled.combatRange,
      leashRange: mobData.combat.leashRange,
      attackType: mobData.combat.attackType ?? "melee",
      spellId: mobData.combat.spellId,
      arrowId: mobData.combat.arrowId,
      wanderRadius: scaled.wanderRadius,
      aiState: "idle",
      targetPlayerId: null,
      lastAttackTime: 0,
      deathTime: null,
      respawnTime: mobData.combat.respawnTime,
    };

    try {
      await entityManager.spawnEntity(mobConfig);
    } catch (err) {
      console.error(`[MobNPCSpawnerSystem] Error spawning ${mobData.id}:`, err);
    }
  }

  private handleEntitySpawned(data: EntitySpawnedEvent): void {
    // Track mobs spawned by the EntityManager
    if (data.entityType === "mob" && data.entityData?.mobType) {
      // Find matching request based on mob type and position
      for (const [mobId] of this.spawnedMobs) {
        if (
          !this.spawnedMobs.get(mobId) &&
          mobId.includes(data.entityData.mobType as string)
        ) {
          this.spawnedMobs.set(mobId, data.entityId!);
          break;
        }
      }
    }
  }

  // Note: This system intentionally does not handle MOB_NPC_SPAWN_REQUEST events to prevent
  // recursive re-emission loops. It only produces spawn requests via spawnMobFromData.

  private despawnMob(mobId: string): void {
    const entityId = this.spawnedMobs.get(mobId) ?? mobId;
    this.emitTypedEvent(EventType.ENTITY_DEATH, { entityId });
    let spawnKey = this.entityIdToSpawnKey.get(mobId);
    if (!spawnKey) {
      for (const [key, value] of this.spawnedMobs.entries()) {
        if (value === mobId) {
          spawnKey = key;
          break;
        }
      }
    }

    if (spawnKey) {
      this.spawnedMobs.delete(spawnKey);
      this.spawnedMobDetails.delete(spawnKey);
    }

    this.entityIdToSpawnKey.delete(mobId);
  }

  private respawnAllMobs(): void {
    // Kill all existing mobs
    for (const [_mobId, entityId] of this.spawnedMobs) {
      this.emitTypedEvent(EventType.ENTITY_DEATH, { entityId });
    }
    this.spawnedMobs.clear();
    this.spawnedMobDetails.clear();
    this.entityIdToSpawnKey.clear();
    this.spawnedBossHotspots.clear();

    // Mobs will respawn naturally as terrain tiles remain loaded
    // TerrainSystem will re-emit TERRAIN_TILE_GENERATED which will trigger mob spawning
  }

  // Public API
  getSpawnedMobs(): Map<string, string> {
    return this.spawnedMobs;
  }

  getMobCount(): number {
    return this.spawnedMobs.size;
  }

  getMobsByType(mobType: string): string[] {
    const mobEntityIds: string[] = [];
    for (const [id, entityId] of this.spawnedMobs) {
      if (id.includes(mobType)) {
        mobEntityIds.push(entityId);
      }
    }
    return mobEntityIds;
  }

  getSpawnedMobDetails(): SpawnedMobDetail[] {
    return Array.from(this.spawnedMobDetails.values());
  }

  getMobStats(): MobSpawnStats {
    const stats = {
      totalMobs: this.spawnedMobs.size,
      level1Mobs: 0,
      level2Mobs: 0,
      level3Mobs: 0,
      byType: {} as Record<string, number>,
      spawnedMobs: this.spawnedMobs.size,
    };

    for (const [mobId] of this.spawnedMobs) {
      for (const mobType of ALL_NPCS.keys()) {
        if (mobId.includes(mobType)) {
          stats.byType[mobType] = (stats.byType[mobType] || 0) + 1;
        }
      }
    }

    return stats;
  }

  /**
   * Handle terrain tile generation - spawn mobs for new tiles
   * Only runs on server - clients receive entities via network sync
   *
   * Priority: world.json mob spawns → world-areas.json → biome procgen
   */
  private onTileGenerated(tileData: {
    tileX: number;
    tileZ: number;
    biome: string;
  }): void {
    // CRITICAL: Only server should spawn mobs - clients receive them via network sync
    if (!this.world.isServer) {
      return;
    }

    // Priority 1: World Studio manifest mob spawns (hand-placed + auto-gen)
    if (DataManager.hasWorldJson()) {
      const manifestSpawns = DataManager.getWorldJsonMobSpawnsInTile(
        tileData.tileX,
        tileData.tileZ,
      );
      if (manifestSpawns.length > 0) {
        for (const spawn of manifestSpawns) {
          this.spawnMobFromManifest(spawn);
        }
        // Manifest covers this tile — skip procgen mob generation
        // (bosses still check since they're separate from normal mob spawns)
        this.spawnBossForTile(tileData);
        return;
      }
    }

    // Priority 2: world-areas.json mob spawns (existing behavior)
    const TILE_SIZE = this.terrainSystem.getTileSize();
    const tileBounds = {
      minX: tileData.tileX * TILE_SIZE,
      maxX: (tileData.tileX + 1) * TILE_SIZE,
      minZ: tileData.tileZ * TILE_SIZE,
      maxZ: (tileData.tileZ + 1) * TILE_SIZE,
    };

    // Find which world areas overlap with this new tile
    const overlappingAreas: Array<
      (typeof ALL_WORLD_AREAS)[keyof typeof ALL_WORLD_AREAS]
    > = [];
    for (const area of Object.values(ALL_WORLD_AREAS)) {
      const areaBounds = area.bounds;
      // Simple bounding box overlap check
      if (
        tileBounds.minX < areaBounds.maxX &&
        tileBounds.maxX > areaBounds.minX &&
        tileBounds.minZ < areaBounds.maxZ &&
        tileBounds.maxZ > areaBounds.minZ
      ) {
        overlappingAreas.push(area);
      }
    }

    if (overlappingAreas.length > 0) {
      this.generateContentForTile(tileData, overlappingAreas);
    }

    // Priority 3: biome procgen mobs
    this.spawnBiomeMobsForTile(tileData);
    this.spawnBossForTile(tileData);
  }

  /**
   * Generate mobs for overlapping world areas
   */
  private generateContentForTile(
    tileData: { tileX: number; tileZ: number },
    areas: Array<(typeof ALL_WORLD_AREAS)[keyof typeof ALL_WORLD_AREAS]>,
  ): void {
    for (const area of areas) {
      // Spawn mobs from world-areas.ts data if they fall within this tile
      this.generateMobSpawnsForArea(area, tileData);
    }
  }

  /**
   * Spawn a mob from World Studio manifest (world.json) mob spawn definition.
   * Uses the same spawnMobFromData pipeline as world-areas.json spawns.
   */
  private spawnMobFromManifest(spawn: WorldJsonMobSpawn): void {
    const mobData = getNPCById(spawn.mobId);
    if (!mobData) {
      console.warn(
        `[MobNPCSpawnerSystem] World manifest mob "${spawn.mobId}" not found in NPC data`,
      );
      return;
    }

    // Get terrain height at the spawn position
    const y = this.terrainSystem.getHeightAtPosition(
      spawn.position.x,
      spawn.position.z,
    );
    const position = { x: spawn.position.x, y, z: spawn.position.z };

    // Spawn count: either maxCount or 1
    const count = spawn.maxCount || 1;
    for (let i = 0; i < count; i++) {
      // Spread mobs within spawn radius
      let spawnPos = position;
      if (i > 0 && spawn.spawnRadius > 0) {
        const angle = (i / count) * Math.PI * 2;
        const dist =
          spawn.spawnRadius * 0.5 + Math.random() * spawn.spawnRadius * 0.5;
        spawnPos = {
          x: position.x + Math.cos(angle) * dist,
          y: this.terrainSystem.getHeightAtPosition(
            position.x + Math.cos(angle) * dist,
            position.z + Math.sin(angle) * dist,
          ),
          z: position.z + Math.sin(angle) * dist,
        };
      }

      const spawnKey = `manifest_${spawn.id}_${i}`;
      this.spawnMobFromData(mobData, spawnPos, { spawnKey });
    }
  }

  private spawnBiomeMobsForTile(tileData: {
    tileX: number;
    tileZ: number;
  }): void {
    const spawnPositions = this.terrainSystem.getMobSpawnPositionsForTile(
      tileData.tileX,
      tileData.tileZ,
      this.BIOME_SPAWNS_PER_TILE,
    );
    const rng = this.terrainSystem.createDeterministicRng(
      tileData.tileX,
      tileData.tileZ,
      "biome-mobs",
    );

    for (const spawn of spawnPositions) {
      if (!spawn.mobTypes || spawn.mobTypes.length === 0) continue;

      const difficultySample = this.terrainSystem.getDifficultyAtWorldPosition(
        spawn.position.x,
        spawn.position.z,
        spawn.difficulty,
      );

      if (difficultySample.isSafe || difficultySample.level <= 0) continue;

      const selection = this.selectMobForLevel(
        spawn.mobTypes,
        difficultySample.level,
        rng,
      );
      if (!selection) continue;

      this.spawnMobFromData(selection.mobData, spawn.position, {
        level: difficultySample.level,
        levelRange: selection.levelRange,
      });
    }
  }

  private spawnBossForTile(tileData: { tileX: number; tileZ: number }): void {
    const tileSize = this.terrainSystem.getTileSize();
    const tileMinX = tileData.tileX * tileSize;
    const tileMaxX = (tileData.tileX + 1) * tileSize;
    const tileMinZ = tileData.tileZ * tileSize;
    const tileMaxZ = (tileData.tileZ + 1) * tileSize;

    const hotspots = this.terrainSystem.getBossHotspots();
    for (const hotspot of hotspots) {
      if (this.spawnedBossHotspots.has(hotspot.id)) {
        continue;
      }

      const closestX = Math.max(tileMinX, Math.min(hotspot.x, tileMaxX));
      const closestZ = Math.max(tileMinZ, Math.min(hotspot.z, tileMaxZ));
      const dx = hotspot.x - closestX;
      const dz = hotspot.z - closestZ;
      if (dx * dx + dz * dz > hotspot.radius * hotspot.radius) {
        continue;
      }

      const bossData = this.selectBossForHotspot(hotspot.seed);
      if (!bossData) {
        continue;
      }

      const bossLevel = this.terrainSystem.getBossLevelAtWorldPosition(
        hotspot.x,
        hotspot.z,
      );
      const levelRange = this.getMobLevelRange(bossData);
      const bossY = this.terrainSystem.getHeightAt(hotspot.x, hotspot.z);

      this.spawnedBossHotspots.add(hotspot.id);
      this.spawnMobFromData(
        bossData,
        { x: hotspot.x, y: bossY, z: hotspot.z },
        {
          level: bossLevel,
          levelRange,
          isBoss: true,
          spawnKey: `boss_${hotspot.id}`,
        },
      );
    }
  }

  /**
   * Spawn mobs from a world area when its tile generates
   */
  private generateMobSpawnsForArea(
    area: (typeof ALL_WORLD_AREAS)[keyof typeof ALL_WORLD_AREAS],
    tileData: { tileX: number; tileZ: number },
  ): void {
    if (area.safeZone || area.difficultyLevel <= 0) {
      return;
    }

    const TILE_SIZE = this.terrainSystem.getTileSize();

    for (const spawnPoint of area.mobSpawns) {
      const spawnTileX = Math.floor(spawnPoint.position.x / TILE_SIZE);
      const spawnTileZ = Math.floor(spawnPoint.position.z / TILE_SIZE);

      if (spawnTileX === tileData.tileX && spawnTileZ === tileData.tileZ) {
        const mobData = ALL_NPCS.get(spawnPoint.mobId);
        if (!mobData) continue;

        // Spawn maxCount mobs (default to 1 if not specified)
        const maxCount = spawnPoint.maxCount ?? 1;
        // Use spawnRadius for spreading, or 2 units if multiple mobs but no radius
        const effectiveRadius =
          spawnPoint.spawnRadius > 0
            ? spawnPoint.spawnRadius
            : maxCount > 1
              ? 2
              : 0;

        for (let i = 0; i < maxCount; i++) {
          // Calculate position: spread mobs evenly in circle when multiple
          let mobX = spawnPoint.position.x;
          let mobZ = spawnPoint.position.z;

          if (maxCount > 1) {
            // Deterministic positions: evenly spaced in a circle
            const angle = (i / maxCount) * Math.PI * 2;
            mobX += Math.cos(angle) * effectiveRadius;
            mobZ += Math.sin(angle) * effectiveRadius;
          }

          // Ground mob spawn to terrain height
          let mobY = spawnPoint.position.y;
          const th = this.terrainSystem.getHeightAt(mobX, mobZ);
          if (Number.isFinite(th)) mobY = th;

          const difficultySample =
            this.terrainSystem.getDifficultyAtWorldPosition(
              mobX,
              mobZ,
              area.difficultyLevel,
            );
          if (difficultySample.isSafe || difficultySample.level <= 0) {
            continue;
          }

          const levelRange = this.getMobLevelRange(mobData);
          this.spawnMobFromData(
            mobData,
            { x: mobX, y: mobY, z: mobZ },
            {
              level: difficultySample.level,
              levelRange,
            },
          );
        }
      }
    }
  }

  // Required System lifecycle methods
  update(_dt: number): void {
    // Update mob behaviors, check for respawns, etc.
  }

  /**
   * Cleanup when system is destroyed
   */
  destroy(): void {
    // Clear all spawn tracking
    this.spawnedMobs.clear();
    this.spawnedMobDetails.clear();
    this.entityIdToSpawnKey.clear();
    this.spawnedBossHotspots.clear();

    // Reset counter
    this.mobIdCounter = 0;

    // Call parent cleanup
    super.destroy();
  }
}

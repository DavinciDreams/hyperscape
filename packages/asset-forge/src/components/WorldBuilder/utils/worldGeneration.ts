/**
 * World generation: difficulty zones, wilderness, mob spawns, and boss generation.
 */

import type {
  WorldData,
  GeneratedTown,
  PlacedBoss,
  DifficultyZone,
  WildernessZone,
  WorldPosition,
  BossArchetype,
  BossAbility,
} from "../types";

/** Generate difficulty zones based on town positions (Voronoi-like) */
export function generateDifficultyZones(
  towns: GeneratedTown[],
  worldSize: number,
  tileSize: number,
  starterTownIds: string[] = [],
): DifficultyZone[] {
  const zones: DifficultyZone[] = [];
  const worldSizeMeters = worldSize * tileSize;
  const worldCenter = worldSizeMeters / 2;

  // Sort towns by distance from center (starter towns are usually near center)
  const sortedTowns = [...towns].sort((a, b) => {
    const distA = Math.sqrt(
      Math.pow(a.position.x - worldCenter, 2) +
        Math.pow(a.position.z - worldCenter, 2),
    );
    const distB = Math.sqrt(
      Math.pow(b.position.x - worldCenter, 2) +
        Math.pow(b.position.z - worldCenter, 2),
    );
    return distA - distB;
  });

  // If no starter towns specified, use the closest towns to center
  const starters =
    starterTownIds.length > 0
      ? starterTownIds
      : sortedTowns
          .slice(0, Math.max(1, Math.floor(towns.length * 0.1)))
          .map((t) => t.id);

  // Create safe zones around each town
  for (const town of towns) {
    const isStarter = starters.includes(town.id);
    const distFromCenter = Math.sqrt(
      Math.pow(town.position.x - worldCenter, 2) +
        Math.pow(town.position.z - worldCenter, 2),
    );
    const normalizedDist = distFromCenter / (worldSizeMeters / 2);

    // Base difficulty based on distance from center (0-4)
    const baseDifficulty = isStarter
      ? 0
      : Math.min(4, Math.floor(normalizedDist * 5));

    // Safe zone radius scales with town size
    const safeRadius =
      town.size === "town" ? 200 : town.size === "village" ? 150 : 100;

    // Create safe zone for the town
    zones.push({
      id: `safe-zone-${town.id}`,
      name: `${town.name} Safe Zone`,
      difficultyLevel: 0,
      zoneType: "voronoi",
      bounds: {
        minX: town.position.x - safeRadius,
        maxX: town.position.x + safeRadius,
        minZ: town.position.z - safeRadius,
        maxZ: town.position.z + safeRadius,
      },
      center: { x: town.position.x, y: 0, z: town.position.z },
      linkedTownId: town.id,
      isSafeZone: true,
      mobLevelRange: [0, 0],
      properties: { townSize: town.size, isStarter },
    });

    // Create surrounding danger zone (Voronoi cell)
    if (!isStarter) {
      const dangerRadius = safeRadius * 3;
      const mobMinLevel = Math.max(1, baseDifficulty * 10);
      const mobMaxLevel = Math.min(99, (baseDifficulty + 1) * 15);

      zones.push({
        id: `zone-${town.id}`,
        name: `${town.name} Region`,
        difficultyLevel: baseDifficulty,
        zoneType: "voronoi",
        bounds: {
          minX: town.position.x - dangerRadius,
          maxX: town.position.x + dangerRadius,
          minZ: town.position.z - dangerRadius,
          maxZ: town.position.z + dangerRadius,
        },
        center: { x: town.position.x, y: 0, z: town.position.z },
        linkedTownId: town.id,
        isSafeZone: false,
        mobLevelRange: [mobMinLevel, mobMaxLevel],
        properties: { baseDifficulty, normalizedDist },
      });
    }
  }

  // Create high-danger zones in areas far from towns
  const gridSize = 4;
  const cellSize = worldSizeMeters / gridSize;

  for (let gx = 0; gx < gridSize; gx++) {
    for (let gz = 0; gz < gridSize; gz++) {
      const cellCenterX = (gx + 0.5) * cellSize;
      const cellCenterZ = (gz + 0.5) * cellSize;

      // Find distance to nearest town
      let minDist = Infinity;
      for (const town of towns) {
        const dist = Math.sqrt(
          Math.pow(town.position.x - cellCenterX, 2) +
            Math.pow(town.position.z - cellCenterZ, 2),
        );
        minDist = Math.min(minDist, dist);
      }

      // If far from all towns (> 500m), create a high danger zone
      if (minDist > 500) {
        const distFromCenter = Math.sqrt(
          Math.pow(cellCenterX - worldCenter, 2) +
            Math.pow(cellCenterZ - worldCenter, 2),
        );
        const normalizedDist = distFromCenter / (worldSizeMeters / 2);
        const difficulty = Math.min(4, Math.floor(normalizedDist * 5) + 1);

        zones.push({
          id: `wild-zone-${gx}-${gz}`,
          name: `Wild Zone (${gx}, ${gz})`,
          difficultyLevel: difficulty,
          zoneType: "bounds",
          bounds: {
            minX: gx * cellSize,
            maxX: (gx + 1) * cellSize,
            minZ: gz * cellSize,
            maxZ: (gz + 1) * cellSize,
          },
          isSafeZone: false,
          mobLevelRange: [difficulty * 15, Math.min(99, (difficulty + 1) * 20)],
          properties: { isWilderness: true, distanceFromTowns: minDist },
        });
      }
    }
  }

  return zones;
}

export function generateWilderness(
  worldSize: number,
  tileSize: number,
  direction: "north" | "south" | "east" | "west" = "north",
  startBoundaryPercent: number = 0.3,
): WildernessZone {
  return {
    id: "wilderness-main",
    name: "The Wilderness",
    direction,
    startBoundary: startBoundaryPercent,
    multiCombat: true,
    baseLevelAtBoundary: 1,
    levelPerHundredMeters: 1,
  };
}

export function isInWilderness(
  position: WorldPosition,
  wilderness: WildernessZone,
  worldSize: number,
  tileSize: number,
): boolean {
  const worldSizeMeters = worldSize * tileSize;
  // startBoundary is the percentage from the "origin" side where wilderness starts
  // e.g., startBoundary=0.7 means wilderness starts at 70% and extends to 100%
  const threshold = worldSizeMeters * wilderness.startBoundary;

  // In our coordinate system:
  // - Z increases going north (positive Z = north)
  // - X increases going east (positive X = east)
  switch (wilderness.direction) {
    case "north":
      // Wilderness is the northern portion (high Z values)
      return position.z > threshold;
    case "south":
      // Wilderness is the southern portion (low Z values)
      return position.z < worldSizeMeters - threshold;
    case "east":
      // Wilderness is the eastern portion (high X values)
      return position.x > threshold;
    case "west":
      // Wilderness is the western portion (low X values)
      return position.x < worldSizeMeters - threshold;
  }
}

export function getWildernessLevel(
  position: WorldPosition,
  wilderness: WildernessZone,
  worldSize: number,
  tileSize: number,
): number {
  if (!isInWilderness(position, wilderness, worldSize, tileSize)) {
    return 0;
  }

  const worldSizeMeters = worldSize * tileSize;
  const threshold = worldSizeMeters * wilderness.startBoundary;

  // Calculate distance into the wilderness from the boundary
  // Deeper into wilderness = higher level
  let distanceIntoBoundary: number;
  switch (wilderness.direction) {
    case "north":
      // North wilderness: z > threshold, deeper = higher z
      distanceIntoBoundary = position.z - threshold;
      break;
    case "south":
      // South wilderness: z < (worldSizeMeters - threshold), deeper = lower z
      distanceIntoBoundary = worldSizeMeters - threshold - position.z;
      break;
    case "east":
      // East wilderness: x > threshold, deeper = higher x
      distanceIntoBoundary = position.x - threshold;
      break;
    case "west":
      // West wilderness: x < (worldSizeMeters - threshold), deeper = lower x
      distanceIntoBoundary = worldSizeMeters - threshold - position.x;
      break;
  }

  return Math.max(
    1,
    Math.floor(
      wilderness.baseLevelAtBoundary +
        (distanceIntoBoundary / 100) * wilderness.levelPerHundredMeters,
    ),
  );
}

const DEFAULT_BIOME_MOB_TABLES: Record<string, MobSpawnEntry[]> = {
  plains: [
    { mobTypeId: "rabbit", weight: 30, levelRange: [1, 3], groupSize: [1, 3] },
    { mobTypeId: "wolf", weight: 20, levelRange: [3, 8], groupSize: [2, 4] },
    { mobTypeId: "goblin", weight: 40, levelRange: [1, 10], groupSize: [1, 4] },
    { mobTypeId: "bandit", weight: 10, levelRange: [5, 15], groupSize: [2, 5] },
  ],
  forest: [
    { mobTypeId: "wolf", weight: 25, levelRange: [5, 12], groupSize: [2, 5] },
    { mobTypeId: "spider", weight: 30, levelRange: [8, 18], groupSize: [1, 3] },
    { mobTypeId: "bear", weight: 15, levelRange: [10, 20], groupSize: [1, 2] },
    {
      mobTypeId: "treant",
      weight: 10,
      levelRange: [15, 25],
      groupSize: [1, 1],
    },
    { mobTypeId: "goblin", weight: 20, levelRange: [5, 15], groupSize: [2, 6] },
  ],
  mountains: [
    { mobTypeId: "goat", weight: 20, levelRange: [1, 5], groupSize: [2, 4] },
    { mobTypeId: "troll", weight: 25, levelRange: [20, 35], groupSize: [1, 2] },
    {
      mobTypeId: "rock_elemental",
      weight: 15,
      levelRange: [25, 40],
      groupSize: [1, 1],
    },
    { mobTypeId: "giant", weight: 10, levelRange: [30, 50], groupSize: [1, 1] },
    { mobTypeId: "orc", weight: 30, levelRange: [15, 30], groupSize: [2, 4] },
  ],
  desert: [
    {
      mobTypeId: "scorpion",
      weight: 30,
      levelRange: [5, 15],
      groupSize: [1, 3],
    },
    {
      mobTypeId: "sand_worm",
      weight: 15,
      levelRange: [20, 35],
      groupSize: [1, 1],
    },
    { mobTypeId: "mummy", weight: 20, levelRange: [15, 30], groupSize: [1, 3] },
    { mobTypeId: "snake", weight: 25, levelRange: [3, 12], groupSize: [1, 2] },
    {
      mobTypeId: "desert_bandit",
      weight: 10,
      levelRange: [10, 25],
      groupSize: [3, 6],
    },
  ],
  swamp: [
    {
      mobTypeId: "crocodile",
      weight: 25,
      levelRange: [8, 18],
      groupSize: [1, 2],
    },
    {
      mobTypeId: "bog_creature",
      weight: 20,
      levelRange: [12, 25],
      groupSize: [1, 2],
    },
    {
      mobTypeId: "poisonous_frog",
      weight: 20,
      levelRange: [5, 12],
      groupSize: [2, 4],
    },
    { mobTypeId: "witch", weight: 15, levelRange: [20, 35], groupSize: [1, 1] },
    {
      mobTypeId: "zombie",
      weight: 20,
      levelRange: [10, 20],
      groupSize: [2, 5],
    },
  ],
  tundra: [
    {
      mobTypeId: "ice_wolf",
      weight: 30,
      levelRange: [10, 20],
      groupSize: [3, 5],
    },
    {
      mobTypeId: "frost_giant",
      weight: 15,
      levelRange: [30, 50],
      groupSize: [1, 1],
    },
    {
      mobTypeId: "ice_elemental",
      weight: 15,
      levelRange: [25, 40],
      groupSize: [1, 1],
    },
    { mobTypeId: "yeti", weight: 20, levelRange: [20, 35], groupSize: [1, 2] },
    {
      mobTypeId: "snow_hare",
      weight: 20,
      levelRange: [1, 5],
      groupSize: [2, 4],
    },
  ],
  lakes: [
    { mobTypeId: "fish", weight: 40, levelRange: [1, 5], groupSize: [3, 6] },
    {
      mobTypeId: "water_elemental",
      weight: 15,
      levelRange: [20, 35],
      groupSize: [1, 1],
    },
    { mobTypeId: "naga", weight: 25, levelRange: [15, 30], groupSize: [1, 3] },
    {
      mobTypeId: "giant_crab",
      weight: 20,
      levelRange: [10, 20],
      groupSize: [1, 2],
    },
  ],
  valley: [
    { mobTypeId: "deer", weight: 25, levelRange: [1, 5], groupSize: [2, 4] },
    { mobTypeId: "wolf", weight: 20, levelRange: [5, 12], groupSize: [2, 4] },
    { mobTypeId: "goblin", weight: 30, levelRange: [3, 12], groupSize: [2, 5] },
    { mobTypeId: "orc", weight: 15, levelRange: [10, 20], groupSize: [2, 4] },
    { mobTypeId: "bandit", weight: 10, levelRange: [8, 18], groupSize: [3, 5] },
  ],
};

interface MobSpawnEntry {
  mobTypeId: string;
  weight: number;
  levelRange: [number, number];
  groupSize: [number, number];
}

export function generateMobSpawns(world: WorldData): MobSpawnManifest {
  const { foundation, layers } = world;
  const spawns: MobSpawnConfig[] = [];

  // Generate spawns for each biome
  for (const biome of foundation.biomes) {
    // Check for biome override with custom mob config
    const override = layers.biomeOverrides.get(biome.id);
    const biomeType = override?.typeOverride || biome.type;

    // Get default spawn table for this biome type
    const defaultTable =
      DEFAULT_BIOME_MOB_TABLES[biomeType] || DEFAULT_BIOME_MOB_TABLES.plains;

    // If there's a custom mob config, use that; otherwise scale defaults by difficulty
    const customMobConfig = override?.mobSpawnConfig;
    const difficulty = override?.difficultyOverride ?? 0;

    // Calculate level modifier based on difficulty (0-4 maps to 0-40 level boost)
    const levelModifier = difficulty * 10;

    // Generate spawn configuration
    const spawnConfig: MobSpawnConfig = {
      biomeId: biome.id,
      biomeType,
      enabled: customMobConfig?.enabled ?? true,
      spawnRate: customMobConfig?.spawnRate ?? 0.3 + difficulty * 0.1,
      maxPerChunk: customMobConfig?.maxPerChunk ?? 2 + difficulty,
      spawnTable:
        customMobConfig?.spawnTable?.map((entry) => ({
          ...entry,
          levelRange: [
            Math.min(99, entry.levelRange[0] + levelModifier),
            Math.min(99, entry.levelRange[1] + levelModifier),
          ] as [number, number],
        })) ??
        defaultTable.map((entry) => ({
          ...entry,
          levelRange: [
            Math.min(99, entry.levelRange[0] + levelModifier),
            Math.min(99, entry.levelRange[1] + levelModifier),
          ] as [number, number],
        })),
      bounds: {
        minX: biome.center.x - biome.influenceRadius,
        maxX: biome.center.x + biome.influenceRadius,
        minZ: biome.center.z - biome.influenceRadius,
        maxZ: biome.center.z + biome.influenceRadius,
      },
    };

    spawns.push(spawnConfig);
  }

  // Also add spawns for difficulty zones (boost levels in high-difficulty areas)
  for (const zone of layers.difficultyZones) {
    if (!zone.isSafeZone) {
      const zoneSpawn: MobSpawnConfig = {
        biomeId: `zone_${zone.id}`,
        biomeType: "difficulty_zone",
        enabled: true,
        spawnRate: 0.3 + zone.difficultyLevel * 0.15,
        maxPerChunk: 2 + zone.difficultyLevel,
        spawnTable: [
          {
            mobTypeId: "generic_hostile",
            weight: 100,
            levelRange: zone.mobLevelRange,
            groupSize: [1, 3],
          },
        ],
        bounds: zone.bounds,
        zoneOverride: true,
      };
      spawns.push(zoneSpawn);
    }
  }

  return {
    version: 1,
    worldId: world.id,
    generatedAt: Date.now(),
    spawns,
  };
}

interface MobSpawnConfig {
  biomeId: string;
  biomeType: string;
  enabled: boolean;
  spawnRate: number;
  maxPerChunk: number;
  spawnTable: MobSpawnEntry[];
  bounds: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
  };
  zoneOverride?: boolean;
}

interface MobSpawnManifest {
  version: number;
  worldId: string;
  generatedAt: number;
  spawns: MobSpawnConfig[];
}

const BOSS_TEMPLATES: Record<string, BossTemplate[]> = {
  plains: [
    {
      name: "Chieftain",
      archetype: "brute",
      baseModel: "orc_large",
      baseLevel: 15,
    },
    {
      name: "Alpha Wolf",
      archetype: "berserker",
      baseModel: "wolf_large",
      baseLevel: 12,
    },
    {
      name: "Bandit King",
      archetype: "assassin",
      baseModel: "human_bandit",
      baseLevel: 18,
    },
  ],
  forest: [
    {
      name: "Ancient Treant",
      archetype: "tank",
      baseModel: "treant",
      baseLevel: 25,
    },
    {
      name: "Spider Queen",
      archetype: "summoner",
      baseModel: "spider_queen",
      baseLevel: 22,
    },
    {
      name: "Forest Witch",
      archetype: "caster",
      baseModel: "witch",
      baseLevel: 28,
    },
  ],
  mountains: [
    {
      name: "Mountain Giant",
      archetype: "brute",
      baseModel: "giant",
      baseLevel: 40,
    },
    {
      name: "Stone Colossus",
      archetype: "tank",
      baseModel: "golem",
      baseLevel: 45,
    },
    { name: "Dragon", archetype: "dragon", baseModel: "dragon", baseLevel: 60 },
  ],
  desert: [
    {
      name: "Scorpion Emperor",
      archetype: "berserker",
      baseModel: "scorpion_giant",
      baseLevel: 30,
    },
    {
      name: "Mummy Lord",
      archetype: "summoner",
      baseModel: "mummy_lord",
      baseLevel: 35,
    },
    {
      name: "Sand Wyrm",
      archetype: "brute",
      baseModel: "sand_worm",
      baseLevel: 38,
    },
  ],
  swamp: [
    {
      name: "Swamp Hydra",
      archetype: "tank",
      baseModel: "hydra",
      baseLevel: 32,
    },
    { name: "Hag Coven", archetype: "caster", baseModel: "hag", baseLevel: 28 },
    {
      name: "Zombie Colossus",
      archetype: "brute",
      baseModel: "zombie_giant",
      baseLevel: 25,
    },
  ],
  tundra: [
    {
      name: "Frost Giant King",
      archetype: "brute",
      baseModel: "frost_giant",
      baseLevel: 50,
    },
    {
      name: "Ice Dragon",
      archetype: "dragon",
      baseModel: "ice_dragon",
      baseLevel: 65,
    },
    {
      name: "Yeti Alpha",
      archetype: "berserker",
      baseModel: "yeti_alpha",
      baseLevel: 40,
    },
  ],
  lakes: [
    { name: "Kraken", archetype: "tank", baseModel: "kraken", baseLevel: 55 },
    {
      name: "Naga Queen",
      archetype: "caster",
      baseModel: "naga_queen",
      baseLevel: 35,
    },
    {
      name: "Sea Serpent",
      archetype: "dragon",
      baseModel: "sea_serpent",
      baseLevel: 45,
    },
  ],
};

interface BossTemplate {
  name: string;
  archetype: BossArchetype;
  baseModel: string;
  baseLevel: number;
}

const TITLE_PREFIXES = [
  ["Young", "Minor", "Lesser"], // Difficulty 0-1
  ["", "Fierce", "Savage"], // Difficulty 2
  ["Elder", "Ancient", "Dire"], // Difficulty 3
  ["Legendary", "Mythic", "Nightmare"], // Difficulty 4
];

function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

export function generateBosses(
  world: WorldData,
  bossCount: number = 10,
  seed?: number,
): PlacedBoss[] {
  const { foundation, layers } = world;
  const random = seededRandom(seed ?? Date.now());
  const bosses: PlacedBoss[] = [];

  // Get difficulty zones sorted by difficulty level (for potential future use)
  const _zones = [...layers.difficultyZones].filter((z) => !z.isSafeZone);

  // Calculate how many bosses per difficulty tier
  const bossesPerTier = Math.ceil(bossCount / 4);
  const tierCounts = [
    Math.max(1, Math.floor(bossesPerTier * 0.5)), // Easy: fewer bosses
    bossesPerTier,
    bossesPerTier,
    Math.max(1, Math.floor(bossesPerTier * 1.5)), // Hard: more bosses
  ];

  // Find biomes at different difficulty levels
  const biomesByDifficulty = new Map<number, typeof foundation.biomes>();
  for (const biome of foundation.biomes) {
    const override = layers.biomeOverrides.get(biome.id);
    const difficulty = override?.difficultyOverride ?? Math.floor(random() * 3);
    if (!biomesByDifficulty.has(difficulty)) {
      biomesByDifficulty.set(difficulty, []);
    }
    biomesByDifficulty.get(difficulty)!.push(biome);
  }

  // Generate bosses
  for (let tier = 0; tier <= 3; tier++) {
    const count = tierCounts[tier] || 1;
    const biomesAtTier = biomesByDifficulty.get(tier) || foundation.biomes;

    for (let i = 0; i < count && bosses.length < bossCount; i++) {
      // Pick a random biome at this tier
      const biome = biomesAtTier[Math.floor(random() * biomesAtTier.length)];
      const biomeType = biome?.type || "plains";

      // Get available templates for this biome
      const templates = BOSS_TEMPLATES[biomeType] || BOSS_TEMPLATES.plains;
      const template = templates[Math.floor(random() * templates.length)];

      // Generate position within biome
      const radius = biome?.influenceRadius || 500;
      const centerX = biome?.center.x || 0;
      const centerZ = biome?.center.z || 0;
      const angle = random() * Math.PI * 2;
      const dist = random() * radius * 0.8;
      const posX = centerX + Math.cos(angle) * dist;
      const posZ = centerZ + Math.sin(angle) * dist;

      // Calculate boss level based on tier and template
      const levelBoost = tier * 15;
      const combatLevel =
        template.baseLevel + levelBoost + Math.floor(random() * 10 - 5);

      // Generate title prefix
      const prefixTier = Math.min(3, tier);
      const prefixes = TITLE_PREFIXES[prefixTier];
      const prefix = prefixes[Math.floor(random() * prefixes.length)];
      const fullName = prefix ? `${prefix} ${template.name}` : template.name;

      // Generate abilities based on archetype
      const abilities = generateBossAbilities(
        template.archetype,
        combatLevel,
        random,
      );

      // Generate deterministic ID using seeded random
      const idSuffix = Math.floor(random() * 0xffffffff).toString(36);
      const idIndex = bosses.length;

      // Create boss
      const boss: PlacedBoss = {
        id: `boss_${idIndex}_${idSuffix}`,
        bossTemplateId: `${biomeType}_${template.archetype}_boss`,
        name: fullName,
        position: { x: posX, y: 0, z: posZ },
        arenaBounds: {
          minX: posX - 50,
          maxX: posX + 50,
          minZ: posZ - 50,
          maxZ: posZ + 50,
        },
        respawnTime: 3600 + tier * 1800, // 1-3 hours based on tier
        requiredLevel: Math.max(1, combatLevel - 10),
        lootTableId: `loot_boss_tier${tier}_${biomeType}`,
        isGenerated: true,
        generatedConfig: {
          archetype: template.archetype,
          baseModelId: template.baseModel,
          scale: 1.5 + tier * 0.3 + random() * 0.5,
          colorTint: generateBossColor(template.archetype, random),
          titlePrefix: prefix,
          combatLevel,
          healthMultiplier: 1 + tier * 0.5,
          damageMultiplier: 1 + tier * 0.3,
          abilities,
          phases: tier >= 2 ? [75, 50, 25] : tier >= 1 ? [50] : [],
          loreText: generateBossLore(
            fullName,
            biomeType,
            template.archetype,
            random,
          ),
        },
        properties: {
          biomeId: biome?.id,
          tier,
        },
      };

      bosses.push(boss);
    }
  }

  return bosses;
}

function generateBossAbilities(
  archetype: BossArchetype,
  level: number,
  _random: () => number, // Reserved for future ability variation
): BossAbility[] {
  const baseDamage = level * 2;

  const archetypeAbilities: Record<BossArchetype, BossAbility[]> = {
    brute: [
      {
        id: "ground_slam",
        name: "Ground Slam",
        cooldown: 8,
        damage: baseDamage * 1.5,
        radius: 10,
        effects: ["stun"],
      },
      {
        id: "heavy_strike",
        name: "Heavy Strike",
        cooldown: 4,
        damage: baseDamage * 2,
        radius: 0,
        effects: ["knockback"],
      },
    ],
    assassin: [
      {
        id: "shadow_step",
        name: "Shadow Step",
        cooldown: 6,
        damage: baseDamage * 1.2,
        radius: 0,
        effects: ["teleport", "bleed"],
      },
      {
        id: "backstab",
        name: "Backstab",
        cooldown: 10,
        damage: baseDamage * 3,
        radius: 0,
        effects: ["crit"],
      },
    ],
    caster: [
      {
        id: "fireball",
        name: "Fireball",
        cooldown: 4,
        damage: baseDamage * 1.3,
        radius: 8,
        effects: ["burn"],
      },
      {
        id: "chain_lightning",
        name: "Chain Lightning",
        cooldown: 8,
        damage: baseDamage,
        radius: 15,
        effects: ["chain"],
      },
      {
        id: "frost_nova",
        name: "Frost Nova",
        cooldown: 12,
        damage: baseDamage * 0.8,
        radius: 12,
        effects: ["slow", "freeze"],
      },
    ],
    summoner: [
      {
        id: "summon_minions",
        name: "Summon Minions",
        cooldown: 20,
        damage: 0,
        radius: 0,
        effects: ["summon_3"],
      },
      {
        id: "empower_minions",
        name: "Empower Minions",
        cooldown: 15,
        damage: 0,
        radius: 30,
        effects: ["buff_minions"],
      },
    ],
    tank: [
      {
        id: "reflect_shield",
        name: "Reflect Shield",
        cooldown: 15,
        damage: 0,
        radius: 0,
        effects: ["reflect_50"],
      },
      {
        id: "taunt",
        name: "Taunt",
        cooldown: 8,
        damage: 0,
        radius: 20,
        effects: ["taunt", "defense_up"],
      },
    ],
    berserker: [
      {
        id: "frenzy",
        name: "Frenzy",
        cooldown: 20,
        damage: 0,
        radius: 0,
        effects: ["attack_speed_up", "damage_up"],
      },
      {
        id: "rage_slam",
        name: "Rage Slam",
        cooldown: 6,
        damage: baseDamage * 1.8,
        radius: 8,
        effects: ["knockback"],
      },
    ],
    dragon: [
      {
        id: "fire_breath",
        name: "Fire Breath",
        cooldown: 10,
        damage: baseDamage * 1.5,
        radius: 15,
        effects: ["burn", "cone"],
      },
      {
        id: "tail_sweep",
        name: "Tail Sweep",
        cooldown: 6,
        damage: baseDamage * 1.2,
        radius: 12,
        effects: ["knockback", "arc"],
      },
      {
        id: "fly_attack",
        name: "Dive Attack",
        cooldown: 15,
        damage: baseDamage * 2,
        radius: 8,
        effects: ["fly", "stun"],
      },
    ],
  };

  return archetypeAbilities[archetype] || archetypeAbilities.brute;
}

function generateBossColor(
  archetype: BossArchetype,
  random: () => number,
): string {
  const colors: Record<BossArchetype, string[]> = {
    brute: ["#8B4513", "#654321", "#A0522D"],
    assassin: ["#4A0080", "#2E0854", "#6B238E"],
    caster: ["#0066CC", "#4169E1", "#1E90FF"],
    summoner: ["#228B22", "#006400", "#32CD32"],
    tank: ["#708090", "#778899", "#696969"],
    berserker: ["#8B0000", "#B22222", "#DC143C"],
    dragon: ["#FF4500", "#FF6347", "#FFD700"],
  };

  const palette = colors[archetype];
  return palette[Math.floor(random() * palette.length)];
}

function generateBossLore(
  name: string,
  biome: string,
  archetype: BossArchetype,
  random: () => number,
): string {
  const loreParts: Record<BossArchetype, string[]> = {
    brute: [
      `${name} has terrorized the ${biome} for generations, crushing all who oppose.`,
      `Legends speak of ${name}'s unstoppable rage that shakes the very earth.`,
    ],
    assassin: [
      `${name} strikes from the shadows, leaving no survivors.`,
      `Few have seen ${name} and lived to tell the tale.`,
    ],
    caster: [
      `${name} commands ancient magics that twist reality itself.`,
      `The arcane power of ${name} corrupts the land around their domain.`,
    ],
    summoner: [
      `${name} raises armies of the dead to serve their dark purpose.`,
      `Wherever ${name} goes, a horde of minions follows.`,
    ],
    tank: [
      `${name}'s scales are said to be impenetrable by mortal weapons.`,
      `Many have broken their blades against ${name}'s iron hide.`,
    ],
    berserker: [
      `${name} grows stronger with every wound, feeding on pain and fury.`,
      `The blood-rage of ${name} knows no bounds once unleashed.`,
    ],
    dragon: [
      `${name} descended from the peaks to claim this land as their dominion.`,
      `The fires of ${name} have reduced entire kingdoms to ash.`,
    ],
  };

  const parts = loreParts[archetype];
  return parts[Math.floor(random() * parts.length)];
}

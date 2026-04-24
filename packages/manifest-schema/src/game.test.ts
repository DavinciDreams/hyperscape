/**
 * Faithfulness test: a game manifest built from the values currently
 * hardcoded in `packages/shared/src/constants/GameConstants.ts` MUST
 * parse cleanly.
 */

import { describe, expect, it } from "vitest";

import { GameManifestSchema, type GameManifest } from "./game.js";

const hyperscapeGameManifest: GameManifest = {
  $schema: "hyperforge.game.v1",
  inventory: {
    maxInventorySlots: 28,
    maxStackSize: 1000,
    defaultItemValue: 1,
  },
  player: {
    defaultHealth: 100,
    defaultMaxHealth: 100,
    defaultStamina: 100,
    defaultMaxStamina: 100,
    baseMovementSpeed: 1.0,
    runningSpeedMultiplier: 1.5,
    healthRegenRate: 1,
    staminaRegenRate: 2.0,
    staminaDrainRate: 5.0,
  },
  homeTeleport: {
    cooldownMs: 30 * 1000,
    castTimeMs: 10 * 1000,
    castTimeTicks: 17,
  },
  xp: {
    baseXpMultiplier: 83,
    maxLevel: 99,
    xpTableLength: 99,
    defaultXpGain: {
      combat: 10,
      woodcutting: 25,
      fishing: 20,
      firemaking: 40,
      cooking: 30,
    },
  },
  world: {
    chunkSize: 64,
  },
  terrain: {
    waterThreshold: 16,
    waterEdgeBuffer: 1.5,
    minVisibleWaterDepth: 1.5,
    maxWalkableSlope: 2.5,
    slopeCheckDistance: 4.0,
    tileSize: 1.0,
    terrainTileSize: 100,
  },
  distance: {
    render: {
      mob: 150,
      mobFadeStart: 130,
      npc: 120,
      npcFadeStart: 100,
      player: 200,
      playerFadeStart: 180,
      item: 100,
      itemFadeStart: 80,
      vegetation: 300,
      terrain: 400,
    },
    simulation: {
      entityUpdate: 200,
      networkBroadcast: 200,
      aiActive: 100,
      aiDormant: 200,
      chunkActive: 256,
      chunkHysteresis: 5,
    },
    animationLod: {
      full: 60,
      half: 120,
      quarter: 160,
      frozen: 200,
      culled: 250,
    },
  },
  mob: {
    spawnRadius: 20,
    maxMobsPerArea: 10,
    maxBanditMobsWorld: 100,
    banditMobIdsForGlobalCap: ["bandit", "desert_bandit"],
  },
  ui: {
    nameTagWidth: 200,
    nameTagHeight: 25,
    uiScale: 0.1,
    spriteScale: 0.1,
    hudUpdateRate: 100,
    chatMessageTimeout: 5000,
  },
  contextMenuColors: {
    item: "#ff9040",
    npc: "#ffff00",
    object: "#00ffff",
    player: "#ffffff",
  },
  physics: {
    gravity: -9.81,
    characterCapsuleRadius: 0.4,
    characterCapsuleHeight: 1.2,
    itemBoxSize: 0.3,
    collisionMargin: 0.04,
    groundCheckDistance: 0.1,
    stepHeight: 0.25,
  },
  camera: {
    defaultCamHeight: 1.6,
    thirdPersonDistance: 5.0,
    topDownDistance: 10.0,
    cameraLerpSpeed: 0.1,
    mouseSensitivity: 0.002,
    zoomSpeed: 0.1,
    minZoom: 2.0,
    maxZoom: 20.0,
  },
  network: {
    updateRate: 20,
    interpolationDelay: 100,
    maxPacketSize: 1024,
    positionSyncThreshold: 0.1,
    rotationSyncThreshold: 0.1,
  },
  test: {
    testCubeSize: 1.0,
    testTimeout: 30000,
    visualTestColors: {
      player: 0x0000ff,
      goblin: 0x00ff00,
      item: 0xffff00,
      corpse: 0xff0000,
      bank: 0xff00ff,
      store: 0x00ffff,
      resource: 0x008000,
      testCube: 0xff4500,
    },
    screenshotDelay: 1000,
    maxTestDuration: 300000,
  },
  itemIds: [
    { id: 1, key: "bronze_sword" },
    { id: 2, key: "steel_sword" },
    { id: 3, key: "mithril_sword" },
    { id: 4, key: "wood_bow" },
    { id: 5, key: "oak_bow" },
    { id: 6, key: "willow_bow" },
    { id: 10, key: "bronze_shield" },
    { id: 11, key: "steel_shield" },
    { id: 12, key: "mithril_shield" },
    { id: 20, key: "leather_helmet" },
    { id: 21, key: "leather_body" },
    { id: 22, key: "leather_legs" },
    { id: 23, key: "bronze_helmet" },
    { id: 24, key: "bronze_body" },
    { id: 25, key: "bronze_legs" },
    { id: 30, key: "bronze_hatchet" },
    { id: 31, key: "fishing_rod" },
    { id: 32, key: "tinderbox" },
    { id: 40, key: "logs" },
    { id: 41, key: "raw_fish" },
    { id: 42, key: "cooked_fish" },
    { id: 43, key: "burnt_fish" },
    { id: 44, key: "arrows" },
    { id: 100, key: "coins" },
  ],
  biomeTypes: {
    tundra: "tundra",
    forest: "forest",
    canyon: "canyon",
  },
  skills: {
    attack: "attack",
    strength: "strength",
    defense: "defense",
    constitution: "constitution",
    ranged: "ranged",
    magic: "magic",
    prayer: "prayer",
    woodcutting: "woodcutting",
    mining: "mining",
    fishing: "fishing",
    firemaking: "firemaking",
    cooking: "cooking",
    smithing: "smithing",
    agility: "agility",
  },
  equipmentSlots: {
    weapon: "weapon",
    shield: "shield",
    helmet: "helmet",
    body: "body",
    legs: "legs",
    arrows: "arrows",
  },
  attackStyles: {
    aggressive: "aggressive",
    controlled: "controlled",
    defensive: "defensive",
    accurate: "accurate",
  },
  worldAreas: {
    centralHaven: "central_haven",
    varrock: "varrock",
    falador: "falador",
    wilderness: "wilderness",
    barbarianVillage: "barbarian_village",
  },
  errorCodes: {
    invalidPlayer: "INVALID_PLAYER",
    insufficientItems: "INSUFFICIENT_ITEMS",
    inventoryFull: "INVENTORY_FULL",
    invalidAction: "INVALID_ACTION",
    combatCooldown: "COMBAT_COOLDOWN",
    outOfRange: "OUT_OF_RANGE",
    insufficientLevel: "INSUFFICIENT_LEVEL",
    systemError: "SYSTEM_ERROR",
  },
  successMessages: {
    itemPickedUp: "Item picked up successfully",
    combatStarted: "Combat initiated",
    levelUp: "Congratulations! You have gained a level",
    questCompleted: "Quest completed",
    itemEquipped: "Item equipped",
    bankDeposit: "Item deposited to bank",
  },
};

describe("GameManifestSchema", () => {
  it("parses the Hyperscape reference manifest cleanly", () => {
    const result = GameManifestSchema.safeParse(hyperscapeGameManifest);
    if (!result.success) {
      throw new Error(
        `Hyperscape game manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("rejects wrong schema version", () => {
    const wrong = {
      ...hyperscapeGameManifest,
      $schema: "hyperforge.game.v0",
    };
    const result = GameManifestSchema.safeParse(wrong);
    expect(result.success).toBe(false);
  });

  it("rejects negative inventory slot count", () => {
    const bad = {
      ...hyperscapeGameManifest,
      inventory: { ...hyperscapeGameManifest.inventory, maxInventorySlots: -1 },
    };
    const result = GameManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects malformed hex color in contextMenuColors", () => {
    const bad = {
      ...hyperscapeGameManifest,
      contextMenuColors: {
        ...hyperscapeGameManifest.contextMenuColors,
        item: "not-a-hex",
      },
    };
    const result = GameManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects empty item id list", () => {
    const bad = { ...hyperscapeGameManifest, itemIds: [] };
    const result = GameManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects duplicate/empty skill key", () => {
    const bad = {
      ...hyperscapeGameManifest,
      skills: { ...hyperscapeGameManifest.skills, attack: "" },
    };
    const result = GameManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});

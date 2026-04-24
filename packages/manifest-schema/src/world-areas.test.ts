/**
 * Faithfulness test: a world-areas manifest with all five top-level
 * categories (starter towns, level 1/2/3 wilderness, special areas) MUST
 * parse cleanly.
 */

import { describe, expect, it } from "vitest";

import { WorldAreasManifestSchema, type WorldArea } from "./world-areas.js";

const brookhaven: WorldArea = {
  id: "brookhaven",
  name: "Brookhaven",
  description: "A sleepy river town",
  difficultyLevel: 0,
  bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 },
  biomeType: "grassland",
  safeZone: true,
  pvpEnabled: false,
  npcs: [
    {
      id: "innkeeper_brookhaven",
      type: "quest_giver",
      name: "Maud",
      position: { x: 0, y: 0, z: 0 },
      dialogue: { greet: "Welcome, traveler." },
    },
    {
      id: "brookhaven_general_store",
      type: "shop",
      position: { x: 10, y: 0, z: 0 },
      storeId: "general_store_brookhaven",
    },
  ],
  resources: [],
  mobSpawns: [],
  stations: [
    { id: "bank_brookhaven", type: "bank", position: { x: -10, y: 0, z: 0 } },
  ],
  fishing: { enabled: true, spotCount: 3, spotTypes: ["shrimp", "sardine"] },
};

const goblinPlains: WorldArea = {
  id: "goblin_plains",
  name: "Goblin Plains",
  description: "Overrun plains east of Brookhaven",
  difficultyLevel: 1,
  bounds: { minX: 60, maxX: 200, minZ: -100, maxZ: 100 },
  biomeType: "grassland",
  safeZone: false,
  pvpEnabled: false,
  mobSpawns: [
    {
      mobId: "goblin",
      position: { x: 100, y: 0, z: 0 },
      maxCount: 6,
      spawnRadius: 12,
    },
  ],
};

const reference = {
  starterTowns: { brookhaven },
  level1Areas: { goblin_plains: goblinPlains },
  level2Areas: {},
  level3Areas: {},
  specialAreas: {},
};

describe("WorldAreasManifestSchema", () => {
  it("parses the reference manifest cleanly", () => {
    const result = WorldAreasManifestSchema.safeParse(reference);
    if (!result.success) {
      throw new Error(
        `Reference manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("rejects a manifest missing one of the five required category keys", () => {
    const bad: Record<string, unknown> = { ...reference };
    delete bad.specialAreas;
    const result = WorldAreasManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects an area with empty id", () => {
    const bad = {
      ...reference,
      starterTowns: { brookhaven: { ...brookhaven, id: "" } },
    };
    const result = WorldAreasManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects a mob spawn with non-positive maxCount", () => {
    const bad = {
      ...reference,
      level1Areas: {
        goblin_plains: {
          ...goblinPlains,
          mobSpawns: [
            {
              mobId: "goblin",
              position: { x: 0, y: 0, z: 0 },
              maxCount: 0,
              spawnRadius: 10,
            },
          ],
        },
      },
    };
    const result = WorldAreasManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects negative spawnRadius", () => {
    const bad = {
      ...reference,
      level1Areas: {
        goblin_plains: {
          ...goblinPlains,
          mobSpawns: [
            {
              mobId: "goblin",
              position: { x: 0, y: 0, z: 0 },
              maxCount: 1,
              spawnRadius: -1,
            },
          ],
        },
      },
    };
    const result = WorldAreasManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("accepts area-level passthrough fields (extra content-creator metadata)", () => {
    const ok = {
      ...reference,
      starterTowns: {
        brookhaven: { ...brookhaven, patronDeity: "river_mother" },
      },
    };
    const result = WorldAreasManifestSchema.safeParse(ok);
    expect(result.success).toBe(true);
  });

  it("accepts authored teleport nodes within an area (lodestone, portal, shortcut)", () => {
    const withTeleports = {
      ...reference,
      starterTowns: {
        brookhaven: {
          ...brookhaven,
          teleports: [
            {
              id: "brookhaven_lodestone",
              name: "Brookhaven Lodestone",
              position: { x: 0, y: 0, z: 0 },
              type: "lodestone",
            },
            {
              id: "brookhaven_portal",
              name: "Ancient Portal",
              position: { x: 5, y: 0, z: 5 },
              type: "portal",
              cost: 100,
            },
            {
              id: "brookhaven_shortcut",
              name: "Mountain Pass",
              position: { x: 10, y: 0, z: 10 },
              type: "shortcut",
              requirements: {
                questComplete: "mountain_quest",
                level: 50,
                itemId: "climbing_boots",
              },
            },
          ],
        },
      },
    };
    const result = WorldAreasManifestSchema.safeParse(withTeleports);
    expect(result.success).toBe(true);
  });

  it("rejects an unknown teleport type (only lodestone/portal/shortcut allowed)", () => {
    const bad = {
      ...reference,
      starterTowns: {
        brookhaven: {
          ...brookhaven,
          teleports: [
            {
              id: "weird",
              name: "Weird",
              position: { x: 0, y: 0, z: 0 },
              type: "wormhole",
            },
          ],
        },
      },
    };
    const result = WorldAreasManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects negative teleport cost", () => {
    const bad = {
      ...reference,
      starterTowns: {
        brookhaven: {
          ...brookhaven,
          teleports: [
            {
              id: "x",
              name: "X",
              position: { x: 0, y: 0, z: 0 },
              type: "portal",
              cost: -1,
            },
          ],
        },
      },
    };
    const result = WorldAreasManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});

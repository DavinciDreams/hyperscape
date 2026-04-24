import { WorldAreasManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import {
  UnknownWorldAreaError,
  WorldAreasNotLoadedError,
  WorldAreasRegistry,
} from "../WorldAreasRegistry.js";

function manifest() {
  return WorldAreasManifestSchema.parse({
    starterTowns: {
      lumbridge: {
        id: "lumbridge",
        name: "Lumbridge",
        description: "",
        difficultyLevel: 0,
        bounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 },
        biomeType: "grassland",
        safeZone: true,
        npcs: [
          {
            id: "lumbridge_cook",
            type: "quest_giver",
            position: { x: 0, y: 0, z: 0 },
          },
        ],
      },
    },
    level1Areas: {
      goblin_hills: {
        id: "goblin_hills",
        name: "Goblin Hills",
        description: "",
        difficultyLevel: 1,
        bounds: { minX: 100, maxX: 200, minZ: 100, maxZ: 200 },
        biomeType: "hills",
        safeZone: false,
        mobSpawns: [
          {
            mobId: "goblin",
            position: { x: 150, y: 0, z: 150 },
            maxCount: 5,
            spawnRadius: 20,
          },
        ],
        stations: [
          {
            id: "furnace1",
            type: "furnace",
            position: { x: 110, y: 0, z: 110 },
          },
        ],
      },
    },
    level2Areas: {},
    level3Areas: {},
    specialAreas: {
      duel_arena: {
        id: "duel_arena",
        name: "Duel Arena",
        description: "",
        difficultyLevel: 0,
        bounds: { minX: 500, maxX: 600, minZ: 500, maxZ: 600 },
        biomeType: "arena",
        safeZone: false,
      },
    },
  });
}

describe("WorldAreasRegistry", () => {
  it("throws pre-load", () => {
    expect(() => new WorldAreasRegistry().manifest).toThrow(
      WorldAreasNotLoadedError,
    );
  });

  it("indexes + has + get + categoryOf", () => {
    const r = new WorldAreasRegistry(manifest());
    expect(r.has("lumbridge")).toBe(true);
    expect(r.has("ghost")).toBe(false);
    expect(r.get("lumbridge").name).toBe("Lumbridge");
    expect(r.categoryOf("lumbridge")).toBe("starterTowns");
    expect(r.categoryOf("goblin_hills")).toBe("level1Areas");
    expect(r.categoryOf("duel_arena")).toBe("specialAreas");
    expect(() => r.get("ghost")).toThrow(UnknownWorldAreaError);
  });

  it("contains + areaAt AABB test", () => {
    const r = new WorldAreasRegistry(manifest());
    expect(r.contains("lumbridge", 0, 0)).toBe(true);
    expect(r.contains("lumbridge", 100, 0)).toBe(false);
    expect(r.areaAt(150, 150)?.id).toBe("goblin_hills");
    expect(r.areaAt(9999, 9999)).toBeNull();
  });

  it("aggregate accessors", () => {
    const r = new WorldAreasRegistry(manifest());
    expect(r.allNPCs().length).toBe(1);
    expect(r.allMobSpawns().length).toBe(1);
    expect(r.allStations().length).toBe(1);
    expect(r.all().length).toBe(3);
  });

  it("byCategory + isSafeZone", () => {
    const r = new WorldAreasRegistry(manifest());
    expect(r.byCategory("starterTowns")[0]!.id).toBe("lumbridge");
    expect(r.isSafeZone("lumbridge")).toBe(true);
    expect(r.isSafeZone("goblin_hills")).toBe(false);
  });

  it("rejects id collisions across categories", () => {
    const bad = {
      starterTowns: {
        dup: {
          id: "dup",
          name: "Dup",
          description: "",
          difficultyLevel: 0,
          bounds: { minX: 0, maxX: 1, minZ: 0, maxZ: 1 },
          biomeType: "x",
          safeZone: true,
        },
      },
      level1Areas: {
        dup: {
          id: "dup",
          name: "Dup",
          description: "",
          difficultyLevel: 0,
          bounds: { minX: 0, maxX: 1, minZ: 0, maxZ: 1 },
          biomeType: "x",
          safeZone: true,
        },
      },
      level2Areas: {},
      level3Areas: {},
      specialAreas: {},
    };
    const parsed = WorldAreasManifestSchema.parse(bad);
    expect(() => new WorldAreasRegistry(parsed)).toThrow(/id collision/);
  });
});

describe("WorldAreasRegistry — onReloaded() reload listeners", () => {
  it("fires after every load()", () => {
    const reg = new WorldAreasRegistry();
    let count = 0;
    reg.onReloaded(() => {
      count += 1;
    });
    reg.load(manifest());
    reg.load(manifest());
    expect(count).toBe(2);
  });

  it("returned unsubscribe stops further notifications", () => {
    const reg = new WorldAreasRegistry();
    let count = 0;
    const unsubscribe = reg.onReloaded(() => {
      count += 1;
    });
    reg.load(manifest());
    expect(count).toBe(1);
    unsubscribe();
    reg.load(manifest());
    expect(count).toBe(1);
  });

  it("loadFromJson() also triggers the listener", () => {
    const reg = new WorldAreasRegistry();
    let fired = false;
    reg.onReloaded(() => {
      fired = true;
    });
    reg.loadFromJson(manifest());
    expect(fired).toBe(true);
  });

  it("a throwing listener does not break sibling listeners", () => {
    const reg = new WorldAreasRegistry();
    const seen: string[] = [];
    reg.onReloaded(() => {
      throw new Error("boom");
    });
    reg.onReloaded(() => seen.push("ok"));
    reg.load(manifest());
    expect(seen).toEqual(["ok"]);
  });
});

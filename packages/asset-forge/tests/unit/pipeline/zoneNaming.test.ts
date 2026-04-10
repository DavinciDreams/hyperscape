import { describe, it, expect } from "vitest";
import { nameZones } from "@/components/WorldStudio/pipeline/zoneNaming";
import type {
  RawZone,
  GridCell,
} from "@/components/WorldStudio/pipeline/zoneFloodFill";

/** Minimal DifficultyTierConfig for testing */
function makeTier(name: string) {
  return {
    name,
    scalarRange: [0, 1] as [number, number],
    levelRange: [1, 10] as [number, number],
    resourceLevelRange: [1, 10] as [number, number],
    namePrefix: name.toLowerCase(),
    color: "#000",
    mobDensityMultiplier: 1,
    resourceDensityMultiplier: 1,
    mobResourceBuffer: 10,
  };
}

function makeZone(
  id: number,
  tierIndex: number,
  biome: string,
  worldX: number,
  worldZ: number,
): RawZone {
  const cell: GridCell = {
    x: 0,
    z: 0,
    worldX,
    worldZ,
    scalar: 0.5,
    biome,
    isSafe: false,
    tierIndex,
    zoneId: id,
  };
  return { id, tierIndex, biome, cells: [cell] };
}

const tiers = [
  makeTier("Beginner"),
  makeTier("Intermediate"),
  makeTier("Dangerous"),
];

describe("nameZones", () => {
  it("produces a name for each zone", () => {
    const zones = [
      makeZone(0, 0, "forest", 100, 0),
      makeZone(1, 1, "desert", -100, 0),
    ];
    const names = nameZones(zones, tiers, []);
    expect(names.size).toBe(2);
    expect(names.has(0)).toBe(true);
    expect(names.has(1)).toBe(true);
  });

  it("capitalizes biome name", () => {
    const zones = [makeZone(0, 0, "forest", 0, 0)];
    const names = nameZones(zones, tiers, []);
    const name = names.get(0)!;
    expect(name).toContain("Forest");
    expect(name).not.toContain("forest");
  });

  it("includes tier name in parentheses", () => {
    const zones = [makeZone(0, 0, "plains", 0, 0)];
    const names = nameZones(zones, tiers, []);
    expect(names.get(0)).toContain("(Beginner)");
  });

  it("includes direction when town is provided", () => {
    const town = { position: { x: 0, z: 0 }, safeZoneRadius: 50 };
    // Zone is east of town (positive X)
    const zones = [makeZone(0, 0, "forest", 100, 0)];
    const names = nameZones(zones, tiers, [town]);
    expect(names.get(0)).toContain("Eastern");
  });

  it("computes correct cardinal directions", () => {
    const town = { position: { x: 0, z: 0 }, safeZoneRadius: 50 };

    // Test major directions
    const testCases: Array<{ wx: number; wz: number; dir: string }> = [
      { wx: 100, wz: 0, dir: "Eastern" },
      { wx: -100, wz: 0, dir: "Western" },
      { wx: 0, wz: -100, dir: "Northern" },
      { wx: 0, wz: 100, dir: "Southern" },
      { wx: 100, wz: 100, dir: "Southeastern" },
      { wx: -100, wz: -100, dir: "Northwestern" },
      { wx: 100, wz: -100, dir: "Northeastern" },
      { wx: -100, wz: 100, dir: "Southwestern" },
    ];

    for (const { wx, wz, dir } of testCases) {
      const zones = [makeZone(0, 0, "forest", wx, wz)];
      const names = nameZones(zones, tiers, [town]);
      expect(names.get(0)).toContain(dir);
    }
  });

  it("uses nearest town for direction", () => {
    const towns = [
      { position: { x: 0, z: 0 }, safeZoneRadius: 50 },
      { position: { x: 1000, z: 1000 }, safeZoneRadius: 50 },
    ];
    // Zone at (50, 0) — closest to town at origin, east of it
    const zones = [makeZone(0, 0, "forest", 50, 0)];
    const names = nameZones(zones, tiers, towns);
    expect(names.get(0)).toContain("Eastern");
  });

  it("omits direction when no towns are provided", () => {
    const zones = [makeZone(0, 0, "forest", 100, 0)];
    const names = nameZones(zones, tiers, []);
    const name = names.get(0)!;
    // Should be "Forest (Beginner)" without leading space
    expect(name).toBe("Forest (Beginner)");
  });

  it("deduplicates names with numeric suffix", () => {
    const zones = [
      makeZone(0, 0, "forest", 100, 0),
      makeZone(1, 0, "forest", 100, 0), // Same position, same tier, same biome
      makeZone(2, 0, "forest", 100, 0),
    ];
    const names = nameZones(zones, tiers, []);

    const nameSet = new Set(names.values());
    expect(nameSet.size).toBe(3); // All unique
    // Should have base name plus suffixed versions
    const nameArr = [...names.values()].sort();
    expect(nameArr[0]).toBe("Forest (Beginner)");
    expect(nameArr[1]).toBe("Forest (Beginner) 2");
    expect(nameArr[2]).toBe("Forest (Beginner) 3");
  });

  it("skips zones with invalid tier index", () => {
    const zones = [
      makeZone(0, 0, "forest", 0, 0),
      makeZone(1, 99, "desert", 0, 0), // tier 99 does not exist
    ];
    const names = nameZones(zones, tiers, []);
    expect(names.size).toBe(1);
    expect(names.has(0)).toBe(true);
    expect(names.has(1)).toBe(false);
  });

  it("returns empty map for empty zone list", () => {
    const names = nameZones([], tiers, []);
    expect(names.size).toBe(0);
  });
});

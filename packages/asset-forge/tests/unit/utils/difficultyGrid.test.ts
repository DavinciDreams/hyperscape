import { describe, it, expect } from "vitest";
import {
  createDifficultyGrid,
  resolveBiomeIndex,
  getCell,
  setCell,
  cellToWorld,
  worldToCell,
  forEachClassifiedCell,
  UNCLASSIFIED_TIER,
  UNASSIGNED_ZONE,
} from "@/components/WorldStudio/utils/difficultyGrid";

describe("createDifficultyGrid", () => {
  it("allocates arrays of correct size", () => {
    const grid = createDifficultyGrid(10, 20, 0, 0, 5);
    expect(grid.scalars.length).toBe(200);
    expect(grid.biomes.length).toBe(200);
    expect(grid.tiers.length).toBe(200);
    expect(grid.zoneIds.length).toBe(200);
  });

  it("initializes scalars to 0", () => {
    const grid = createDifficultyGrid(4, 4, 0, 0, 1);
    for (let i = 0; i < 16; i++) {
      expect(grid.scalars[i]).toBe(0);
    }
  });

  it("initializes tiers to UNCLASSIFIED_TIER", () => {
    const grid = createDifficultyGrid(4, 4, 0, 0, 1);
    for (let i = 0; i < 16; i++) {
      expect(grid.tiers[i]).toBe(UNCLASSIFIED_TIER);
    }
  });

  it("initializes zoneIds to UNASSIGNED_ZONE", () => {
    const grid = createDifficultyGrid(4, 4, 0, 0, 1);
    for (let i = 0; i < 16; i++) {
      expect(grid.zoneIds[i]).toBe(UNASSIGNED_ZONE);
    }
  });

  it("stores origin and resolution", () => {
    const grid = createDifficultyGrid(10, 10, -50, 100, 2.5);
    expect(grid.originX).toBe(-50);
    expect(grid.originZ).toBe(100);
    expect(grid.resolution).toBe(2.5);
    expect(grid.width).toBe(10);
    expect(grid.height).toBe(10);
  });

  it("starts with empty biome index", () => {
    const grid = createDifficultyGrid(4, 4, 0, 0, 1);
    expect(grid.biomeIndex).toEqual([]);
  });
});

describe("resolveBiomeIndex", () => {
  it("assigns sequential indices to new biomes", () => {
    const grid = createDifficultyGrid(4, 4, 0, 0, 1);
    expect(resolveBiomeIndex(grid, "forest")).toBe(0);
    expect(resolveBiomeIndex(grid, "desert")).toBe(1);
    expect(resolveBiomeIndex(grid, "swamp")).toBe(2);
  });

  it("returns same index for duplicate biome names", () => {
    const grid = createDifficultyGrid(4, 4, 0, 0, 1);
    const idx1 = resolveBiomeIndex(grid, "forest");
    const idx2 = resolveBiomeIndex(grid, "forest");
    expect(idx1).toBe(idx2);
  });

  it("populates biomeIndex array", () => {
    const grid = createDifficultyGrid(4, 4, 0, 0, 1);
    resolveBiomeIndex(grid, "forest");
    resolveBiomeIndex(grid, "desert");
    expect(grid.biomeIndex).toEqual(["forest", "desert"]);
  });
});

describe("setCell / getCell roundtrip", () => {
  it("stores and retrieves scalar, biome, and tier", () => {
    const grid = createDifficultyGrid(4, 4, 0, 0, 10);
    const biomeIdx = resolveBiomeIndex(grid, "mountains");
    setCell(grid, 2, 3, 0.75, biomeIdx, 2);

    const cell = getCell(grid, 2, 3);
    expect(cell).not.toBeNull();
    expect(cell!.scalar).toBeCloseTo(0.75, 2); // Float32 precision
    expect(cell!.biome).toBe("mountains");
    expect(cell!.tierIndex).toBe(2);
  });

  it("returns -1 tier for unclassified cells", () => {
    const grid = createDifficultyGrid(4, 4, 0, 0, 10);
    const cell = getCell(grid, 0, 0);
    expect(cell).not.toBeNull();
    expect(cell!.tierIndex).toBe(-1);
  });

  it("returns -1 zoneId for unassigned cells", () => {
    const grid = createDifficultyGrid(4, 4, 0, 0, 10);
    const cell = getCell(grid, 0, 0);
    expect(cell).not.toBeNull();
    expect(cell!.zoneId).toBe(-1);
  });

  it("stores negative tier as unclassified", () => {
    const grid = createDifficultyGrid(4, 4, 0, 0, 10);
    setCell(grid, 0, 0, 0.5, 0, -1);
    const cell = getCell(grid, 0, 0);
    expect(cell!.tierIndex).toBe(-1);
  });

  it("returns null for out-of-bounds coordinates", () => {
    const grid = createDifficultyGrid(4, 4, 0, 0, 10);
    expect(getCell(grid, -1, 0)).toBeNull();
    expect(getCell(grid, 0, -1)).toBeNull();
    expect(getCell(grid, 4, 0)).toBeNull();
    expect(getCell(grid, 0, 4)).toBeNull();
  });

  it("returns 'unknown' biome for cells with no biome set", () => {
    const grid = createDifficultyGrid(4, 4, 0, 0, 10);
    // biomes[0] is 0 by default, but biomeIndex is empty
    const cell = getCell(grid, 0, 0);
    expect(cell!.biome).toBe("unknown");
  });
});

describe("cellToWorld", () => {
  it("converts grid coords to world-space center", () => {
    const grid = createDifficultyGrid(10, 10, 0, 0, 10);
    const world = cellToWorld(grid, 0, 0);
    expect(world.x).toBe(5); // originX + 0*10 + 10/2
    expect(world.z).toBe(5);
  });

  it("respects origin offset", () => {
    const grid = createDifficultyGrid(10, 10, -100, 200, 10);
    const world = cellToWorld(grid, 2, 3);
    expect(world.x).toBe(-100 + 2 * 10 + 5); // -75
    expect(world.z).toBe(200 + 3 * 10 + 5); // 235
  });

  it("handles non-integer resolution", () => {
    const grid = createDifficultyGrid(10, 10, 0, 0, 2.5);
    const world = cellToWorld(grid, 1, 1);
    expect(world.x).toBeCloseTo(3.75);
    expect(world.z).toBeCloseTo(3.75);
  });
});

describe("worldToCell", () => {
  it("converts world-space to grid coords (floored)", () => {
    const grid = createDifficultyGrid(10, 10, 0, 0, 10);
    const cell = worldToCell(grid, 15, 25);
    expect(cell.gx).toBe(1);
    expect(cell.gz).toBe(2);
  });

  it("respects origin offset", () => {
    const grid = createDifficultyGrid(10, 10, -100, 200, 10);
    const cell = worldToCell(grid, -80, 220);
    expect(cell.gx).toBe(2); // (-80 - (-100)) / 10 = 2
    expect(cell.gz).toBe(2); // (220 - 200) / 10 = 2
  });

  it("floors fractional cell positions", () => {
    const grid = createDifficultyGrid(10, 10, 0, 0, 10);
    const cell = worldToCell(grid, 9.9, 19.9);
    expect(cell.gx).toBe(0);
    expect(cell.gz).toBe(1);
  });

  it("roundtrips with cellToWorld (cell center maps back to same cell)", () => {
    const grid = createDifficultyGrid(10, 10, -50, 50, 8);
    for (let gx = 0; gx < 10; gx++) {
      for (let gz = 0; gz < 10; gz++) {
        const world = cellToWorld(grid, gx, gz);
        const back = worldToCell(grid, world.x, world.z);
        expect(back.gx).toBe(gx);
        expect(back.gz).toBe(gz);
      }
    }
  });
});

describe("forEachClassifiedCell", () => {
  it("skips all cells on a fresh grid (all unclassified)", () => {
    const grid = createDifficultyGrid(4, 4, 0, 0, 10);
    let count = 0;
    forEachClassifiedCell(grid, () => {
      count++;
    });
    expect(count).toBe(0);
  });

  it("visits only classified cells", () => {
    const grid = createDifficultyGrid(4, 4, 0, 0, 10);
    const biomeIdx = resolveBiomeIndex(grid, "forest");
    setCell(grid, 1, 1, 0.5, biomeIdx, 0);
    setCell(grid, 2, 2, 0.7, biomeIdx, 1);
    setCell(grid, 3, 3, 0.9, biomeIdx, 2);

    const visited: Array<{ gx: number; gz: number }> = [];
    forEachClassifiedCell(grid, (gx, gz) => {
      visited.push({ gx, gz });
    });

    expect(visited).toHaveLength(3);
    expect(visited).toContainEqual({ gx: 1, gz: 1 });
    expect(visited).toContainEqual({ gx: 2, gz: 2 });
    expect(visited).toContainEqual({ gx: 3, gz: 3 });
  });

  it("provides correct flat index", () => {
    const grid = createDifficultyGrid(4, 4, 0, 0, 10);
    const biomeIdx = resolveBiomeIndex(grid, "forest");
    setCell(grid, 2, 3, 0.5, biomeIdx, 0);

    forEachClassifiedCell(grid, (gx, gz, index) => {
      expect(gx).toBe(2);
      expect(gz).toBe(3);
      expect(index).toBe(3 * 4 + 2); // gz * width + gx = 14
    });
  });
});

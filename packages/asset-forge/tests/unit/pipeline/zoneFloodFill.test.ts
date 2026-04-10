import { describe, it, expect } from "vitest";
import {
  floodFillZones,
  cleanupZones,
  zoneCentroid,
  zoneBounds,
  type GridCell,
  type RawZone,
} from "@/components/WorldStudio/pipeline/zoneFloodFill";

/** Helper: create a GridCell at grid position (x, z) with given tier and biome. */
function makeCell(
  x: number,
  z: number,
  tierIndex: number,
  biome: string,
  resolution = 10,
): GridCell {
  return {
    x,
    z,
    worldX: x * resolution,
    worldZ: z * resolution,
    scalar: tierIndex * 0.25,
    biome,
    isSafe: tierIndex < 0,
    tierIndex,
    zoneId: -1,
  };
}

/** Helper: create a grid of cells from a 2D tier map. */
function makeCellGrid(
  tierMap: number[][],
  biome = "forest",
  resolution = 10,
): { cells: GridCell[]; cols: number; rows: number } {
  const rows = tierMap.length;
  const cols = tierMap[0].length;
  const cells: GridCell[] = [];
  for (let z = 0; z < rows; z++) {
    for (let x = 0; x < cols; x++) {
      cells.push(makeCell(x, z, tierMap[z][x], biome, resolution));
    }
  }
  return { cells, cols, rows };
}

// ────────────────────────────────────────
// floodFillZones
// ────────────────────────────────────────

describe("floodFillZones", () => {
  it("fills a uniform grid into a single zone", () => {
    const { cells, cols, rows } = makeCellGrid([
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ]);
    const zones = floodFillZones(cells, cols, rows);
    expect(zones).toHaveLength(1);
    expect(zones[0].cells).toHaveLength(9);
    expect(zones[0].tierIndex).toBe(0);
    expect(zones[0].biome).toBe("forest");
  });

  it("separates disconnected regions of the same tier", () => {
    // Two tier-0 islands separated by tier-1
    const { cells, cols, rows } = makeCellGrid([
      [0, 1, 0],
      [0, 1, 0],
      [0, 1, 0],
    ]);
    const zones = floodFillZones(cells, cols, rows);
    expect(zones).toHaveLength(3); // left, middle, right
  });

  it("separates different tiers even when adjacent", () => {
    const { cells, cols, rows } = makeCellGrid([
      [0, 0, 1, 1],
      [0, 0, 1, 1],
    ]);
    const zones = floodFillZones(cells, cols, rows);
    expect(zones).toHaveLength(2);
    expect(zones[0].cells).toHaveLength(4);
    expect(zones[1].cells).toHaveLength(4);
  });

  it("separates different biomes even with same tier", () => {
    const cells = [
      makeCell(0, 0, 0, "forest"),
      makeCell(1, 0, 0, "forest"),
      makeCell(2, 0, 0, "desert"),
      makeCell(3, 0, 0, "desert"),
    ];
    const zones = floodFillZones(cells, 4, 1);
    expect(zones).toHaveLength(2);
    expect(zones[0].biome).toBe("forest");
    expect(zones[1].biome).toBe("desert");
  });

  it("skips unclassified cells (tierIndex < 0)", () => {
    const { cells, cols, rows } = makeCellGrid([
      [0, -1, 0],
      [-1, -1, -1],
      [0, -1, 0],
    ]);
    const zones = floodFillZones(cells, cols, rows);
    // 4 separate tier-0 cells that are not connected
    expect(zones).toHaveLength(4);
    for (const z of zones) {
      expect(z.cells).toHaveLength(1);
    }
  });

  it("assigns unique zone IDs", () => {
    const { cells, cols, rows } = makeCellGrid([
      [0, 1],
      [2, 3],
    ]);
    const zones = floodFillZones(cells, cols, rows);
    const ids = zones.map((z) => z.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("returns empty array for empty input", () => {
    const zones = floodFillZones([], 0, 0);
    expect(zones).toEqual([]);
  });

  it("returns empty array when all cells are unclassified", () => {
    const { cells, cols, rows } = makeCellGrid([
      [-1, -1],
      [-1, -1],
    ]);
    const zones = floodFillZones(cells, cols, rows);
    expect(zones).toEqual([]);
  });

  it("handles single cell grid", () => {
    const { cells, cols, rows } = makeCellGrid([[2]]);
    const zones = floodFillZones(cells, cols, rows);
    expect(zones).toHaveLength(1);
    expect(zones[0].cells).toHaveLength(1);
    expect(zones[0].tierIndex).toBe(2);
  });

  it("uses 4-connectivity (diagonals do not connect)", () => {
    // Tier-0 in corners, tier-1 on edges — corners should NOT connect diagonally
    const { cells, cols, rows } = makeCellGrid([
      [0, 1, 0],
      [1, 1, 1],
      [0, 1, 0],
    ]);
    const tier0Zones = floodFillZones(cells, cols, rows).filter(
      (z) => z.tierIndex === 0,
    );
    expect(tier0Zones).toHaveLength(4); // 4 separate corner cells
  });

  it("marks zoneId on all cells after fill", () => {
    const { cells, cols, rows } = makeCellGrid([
      [0, 0],
      [1, 1],
    ]);
    floodFillZones(cells, cols, rows);
    for (const cell of cells) {
      if (cell.tierIndex >= 0) {
        expect(cell.zoneId).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

// ────────────────────────────────────────
// cleanupZones — merge
// ────────────────────────────────────────

describe("cleanupZones — merging small zones", () => {
  it("merges small zones into nearest same-tier neighbor", () => {
    // Two tier-0 zones: one large (100 cells), one small (1 cell)
    const largeCells = Array.from({ length: 100 }, (_, i) =>
      makeCell(i % 10, Math.floor(i / 10), 0, "forest", 10),
    );
    const smallCell = makeCell(15, 5, 0, "forest", 10); // Nearby

    const largeZone: RawZone = {
      id: 0,
      tierIndex: 0,
      biome: "forest",
      cells: largeCells,
    };
    const smallZone: RawZone = {
      id: 1,
      tierIndex: 0,
      biome: "forest",
      cells: [smallCell],
    };

    // minArea = 200 m² → smallZone (1 cell * 100 m² = 100 m²) should merge
    const result = cleanupZones([largeZone, smallZone], 10, 200, 10000);
    expect(result).toHaveLength(1);
    expect(result[0].cells).toHaveLength(101); // merged
  });

  it("promotes orphan small zone if no large zones exist", () => {
    const smallZone: RawZone = {
      id: 0,
      tierIndex: 0,
      biome: "forest",
      cells: [makeCell(0, 0, 0, "forest")],
    };

    const result = cleanupZones([smallZone], 10, 9999, 10000);
    // Should be promoted, not dropped
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result.some((z) => z.cells.length > 0)).toBe(true);
  });

  it("preserves zones above minimum area", () => {
    const cells = Array.from({ length: 25 }, (_, i) =>
      makeCell(i % 5, Math.floor(i / 5), 0, "forest", 10),
    );
    const zone: RawZone = {
      id: 0,
      tierIndex: 0,
      biome: "forest",
      cells,
    };

    // 25 cells * 100 m² = 2500 m², min area = 100 m² → should not merge
    const result = cleanupZones([zone], 10, 100, 10000);
    expect(result).toHaveLength(1);
    expect(result[0].cells).toHaveLength(25);
  });
});

// ────────────────────────────────────────
// cleanupZones — split
// ────────────────────────────────────────

describe("cleanupZones — splitting oversized zones", () => {
  it("splits a zone that exceeds maxSpan", () => {
    // Create a zone spanning 0..200 in X (worldX = x * 10, so x 0..20)
    const cells = Array.from({ length: 21 }, (_, i) =>
      makeCell(i, 0, 0, "forest", 10),
    );
    const zone: RawZone = {
      id: 0,
      tierIndex: 0,
      biome: "forest",
      cells,
    };

    // maxSpan = 50 → worldX span is 200, should split multiple times
    const result = cleanupZones([zone], 10, 0, 50);
    expect(result.length).toBeGreaterThan(1);

    // All original cells should still be present
    const totalCells = result.reduce((sum, z) => sum + z.cells.length, 0);
    expect(totalCells).toBe(21);
  });

  it("does not split zones within maxSpan", () => {
    const cells = Array.from({ length: 4 }, (_, i) =>
      makeCell(i, 0, 0, "forest", 10),
    );
    const zone: RawZone = {
      id: 0,
      tierIndex: 0,
      biome: "forest",
      cells,
    };

    // maxSpan = 100 → worldX span is 30, should not split
    const result = cleanupZones([zone], 10, 0, 100);
    expect(result).toHaveLength(1);
  });

  it("preserves tier and biome after split", () => {
    const cells = Array.from({ length: 20 }, (_, i) =>
      makeCell(i, 0, 2, "mountains", 10),
    );
    const zone: RawZone = {
      id: 0,
      tierIndex: 2,
      biome: "mountains",
      cells,
    };

    const result = cleanupZones([zone], 10, 0, 50);
    for (const z of result) {
      expect(z.tierIndex).toBe(2);
      expect(z.biome).toBe("mountains");
    }
  });

  it("assigns unique IDs to split fragments", () => {
    const cells = Array.from({ length: 30 }, (_, i) =>
      makeCell(i, 0, 0, "forest", 10),
    );
    const zone: RawZone = {
      id: 0,
      tierIndex: 0,
      biome: "forest",
      cells,
    };

    const result = cleanupZones([zone], 10, 0, 50);
    const ids = result.map((z) => z.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ────────────────────────────────────────
// zoneCentroid
// ────────────────────────────────────────

describe("zoneCentroid", () => {
  it("returns center of a single cell", () => {
    const zone: RawZone = {
      id: 0,
      tierIndex: 0,
      biome: "forest",
      cells: [makeCell(0, 0, 0, "forest", 10)],
    };
    const c = zoneCentroid(zone);
    expect(c.x).toBe(0);
    expect(c.z).toBe(0);
  });

  it("returns average of multiple cells", () => {
    const zone: RawZone = {
      id: 0,
      tierIndex: 0,
      biome: "forest",
      cells: [
        makeCell(0, 0, 0, "forest", 10), // worldX=0, worldZ=0
        makeCell(2, 0, 0, "forest", 10), // worldX=20, worldZ=0
        makeCell(1, 2, 0, "forest", 10), // worldX=10, worldZ=20
      ],
    };
    const c = zoneCentroid(zone);
    expect(c.x).toBeCloseTo(10);
    expect(c.z).toBeCloseTo(20 / 3);
  });
});

// ────────────────────────────────────────
// zoneBounds
// ────────────────────────────────────────

describe("zoneBounds", () => {
  it("returns correct bounds for single cell", () => {
    const zone: RawZone = {
      id: 0,
      tierIndex: 0,
      biome: "forest",
      cells: [makeCell(3, 5, 0, "forest", 10)],
    };
    const b = zoneBounds(zone);
    expect(b.minX).toBe(30);
    expect(b.maxX).toBe(30);
    expect(b.minZ).toBe(50);
    expect(b.maxZ).toBe(50);
  });

  it("returns correct bounds for multiple cells", () => {
    const zone: RawZone = {
      id: 0,
      tierIndex: 0,
      biome: "forest",
      cells: [
        makeCell(0, 0, 0, "forest", 10),
        makeCell(5, 3, 0, "forest", 10),
        makeCell(2, 8, 0, "forest", 10),
      ],
    };
    const b = zoneBounds(zone);
    expect(b.minX).toBe(0);
    expect(b.maxX).toBe(50);
    expect(b.minZ).toBe(0);
    expect(b.maxZ).toBe(80);
  });
});

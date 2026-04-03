/**
 * zoneFloodFill — BFS flood fill, zone extraction, merge/split cleanup
 *
 * Takes a classified difficulty grid and groups contiguous cells with the
 * same (tier, biome) into zones. Small zones are merged into neighbors;
 * oversized zones are split along their longest axis.
 */

// ============== TYPES ==============

export interface GridCell {
  x: number; // grid column
  z: number; // grid row
  worldX: number;
  worldZ: number;
  scalar: number;
  biome: string;
  isSafe: boolean;
  tierIndex: number; // -1 for safe zones with no tier
  /** Zone ID assigned during flood fill */
  zoneId: number;
}

export interface RawZone {
  id: number;
  tierIndex: number;
  biome: string;
  cells: GridCell[];
}

// ============== FLOOD FILL ==============

export function floodFillZones(
  cells: GridCell[],
  cols: number,
  rows: number,
): RawZone[] {
  const zones: RawZone[] = [];
  let nextZoneId = 0;

  // Build lookup grid
  const grid = new Array<GridCell | null>(cols * rows).fill(null);
  for (const cell of cells) {
    grid[cell.z * cols + cell.x] = cell;
  }

  for (const cell of cells) {
    if (cell.zoneId !== -1) continue;
    if (cell.tierIndex < 0) continue; // skip unclassified / water

    const zoneId = nextZoneId++;
    const zone: RawZone = {
      id: zoneId,
      tierIndex: cell.tierIndex,
      biome: cell.biome,
      cells: [],
    };

    // BFS with index pointer (O(1) dequeue instead of O(n) shift)
    const queue: GridCell[] = [cell];
    let head = 0;
    cell.zoneId = zoneId;

    while (head < queue.length) {
      const current = queue[head++];
      zone.cells.push(current);

      // 4-connected neighbors
      const neighbors = [
        { x: current.x - 1, z: current.z },
        { x: current.x + 1, z: current.z },
        { x: current.x, z: current.z - 1 },
        { x: current.x, z: current.z + 1 },
      ];

      for (const n of neighbors) {
        if (n.x < 0 || n.x >= cols || n.z < 0 || n.z >= rows) continue;
        const neighbor = grid[n.z * cols + n.x];
        if (!neighbor || neighbor.zoneId !== -1) continue;
        if (neighbor.tierIndex !== cell.tierIndex) continue;
        if (neighbor.biome !== cell.biome) continue;
        neighbor.zoneId = zoneId;
        queue.push(neighbor);
      }
    }

    if (zone.cells.length > 0) {
      zones.push(zone);
    }
  }

  return zones;
}

// ============== CLEANUP ==============

export function cleanupZones(
  zones: RawZone[],
  resolution: number,
  minArea: number,
  maxSpan: number,
): RawZone[] {
  const cellArea = resolution * resolution;

  // Merge small zones into nearest same-tier neighbor
  const result: RawZone[] = [];
  const small: RawZone[] = [];
  const large: RawZone[] = [];

  for (const z of zones) {
    if (z.cells.length * cellArea < minArea) {
      small.push(z);
    } else {
      large.push(z);
    }
  }

  // Try to merge each small zone: prefer same-tier, fall back to nearest any-tier
  for (const sz of small) {
    const centroid = zoneCentroid(sz);
    let bestDist = Infinity;
    let bestZone: RawZone | null = null;

    // First pass: same-tier neighbors
    for (const lz of large) {
      if (lz.tierIndex !== sz.tierIndex) continue;
      const lc = zoneCentroid(lz);
      const d2 = (centroid.x - lc.x) ** 2 + (centroid.z - lc.z) ** 2;
      if (d2 < bestDist) {
        bestDist = d2;
        bestZone = lz;
      }
    }

    // Second pass: if no same-tier found, merge into nearest zone of any tier
    if (!bestZone) {
      for (const lz of large) {
        const lc = zoneCentroid(lz);
        const d2 = (centroid.x - lc.x) ** 2 + (centroid.z - lc.z) ** 2;
        if (d2 < bestDist) {
          bestDist = d2;
          bestZone = lz;
        }
      }
      if (bestZone) {
        console.warn(
          `[AutoGen] Cross-tier merge: small zone (tier ${sz.tierIndex}, ${sz.cells.length} cells) merged into tier ${bestZone.tierIndex}`,
        );
      }
    }

    if (bestZone) {
      bestZone.cells.push(...sz.cells);
    } else if (sz.cells.length > 0) {
      // No large zones exist at all — promote this small zone to avoid data loss
      large.push(sz);
    }
  }

  // Recursively split oversized zones along longest axis
  let nextSplitId = 10000;
  const splitZone = (z: RawZone): RawZone[] => {
    const bounds = zoneBounds(z);
    const spanX = bounds.maxX - bounds.minX;
    const spanZ = bounds.maxZ - bounds.minZ;
    const maxDim = Math.max(spanX, spanZ);

    if (maxDim <= maxSpan || z.cells.length <= 4) {
      return [z];
    }

    // Split along longest axis at midpoint
    const splitHorizontal = spanX >= spanZ;
    const mid = splitHorizontal
      ? (bounds.minX + bounds.maxX) / 2
      : (bounds.minZ + bounds.maxZ) / 2;

    const a: RawZone = { ...z, id: nextSplitId++, cells: [] };
    const b: RawZone = { ...z, id: nextSplitId++, cells: [] };

    for (const c of z.cells) {
      if (splitHorizontal ? c.worldX < mid : c.worldZ < mid) {
        a.cells.push(c);
      } else {
        b.cells.push(c);
      }
    }

    // Recurse on each half
    const parts: RawZone[] = [];
    if (a.cells.length > 0) parts.push(...splitZone(a));
    if (b.cells.length > 0) parts.push(...splitZone(b));
    return parts;
  };

  for (const z of large) {
    result.push(...splitZone(z));
  }

  return result;
}

// ============== HELPERS ==============

export function zoneCentroid(zone: RawZone): { x: number; z: number } {
  let cx = 0,
    cz = 0;
  for (const c of zone.cells) {
    cx += c.worldX;
    cz += c.worldZ;
  }
  return { x: cx / zone.cells.length, z: cz / zone.cells.length };
}

export function zoneBounds(zone: RawZone): {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
} {
  let minX = Infinity,
    maxX = -Infinity,
    minZ = Infinity,
    maxZ = -Infinity;
  for (const c of zone.cells) {
    if (c.worldX < minX) minX = c.worldX;
    if (c.worldX > maxX) maxX = c.worldX;
    if (c.worldZ < minZ) minZ = c.worldZ;
    if (c.worldZ > maxZ) maxZ = c.worldZ;
  }
  return { minX, maxX, minZ, maxZ };
}

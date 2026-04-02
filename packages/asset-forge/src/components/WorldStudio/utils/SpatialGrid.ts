/**
 * SpatialGrid — Generic spatial hash grid for O(1) proximity queries
 *
 * Used by zone auto-gen for mob-resource proximity buffer checks,
 * and available for editor entity queries and overlap detection.
 */

/**
 * 2D spatial hash grid for fast nearest-neighbor and radius queries.
 *
 * Items are stored by position in fixed-size cells. Queries check
 * the local cell neighborhood, giving O(1) amortized lookups
 * regardless of total item count.
 *
 * @typeParam T  The data associated with each inserted point.
 *               Defaults to `void` for position-only grids.
 */
export class SpatialGrid<T = void> {
  private readonly cellSize: number;
  private readonly cells = new Map<
    string,
    Array<{ x: number; z: number; data: T }>
  >();

  constructor(cellSize: number) {
    this.cellSize = cellSize;
  }

  private key(x: number, z: number): string {
    return `${Math.floor(x / this.cellSize)}_${Math.floor(z / this.cellSize)}`;
  }

  /** Insert a point with optional associated data. */
  insert(
    x: number,
    z: number,
    ...[data]: T extends void ? [data?: undefined] : [data: T]
  ): void {
    const k = this.key(x, z);
    let arr = this.cells.get(k);
    if (!arr) {
      arr = [];
      this.cells.set(k, arr);
    }
    arr.push({ x, z, data: data as T });
  }

  /**
   * Find the distance to the nearest point from (x, z).
   * Returns Infinity if the grid is empty.
   */
  nearestDistance(x: number, z: number): number {
    const cx = Math.floor(x / this.cellSize);
    const cz = Math.floor(z / this.cellSize);
    let minDist2 = Infinity;

    // Check 3x3 cell neighborhood
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const k = `${cx + dx}_${cz + dz}`;
        const arr = this.cells.get(k);
        if (!arr) continue;
        for (const p of arr) {
          const d2 = (x - p.x) * (x - p.x) + (z - p.z) * (z - p.z);
          if (d2 < minDist2) minDist2 = d2;
        }
      }
    }

    return Math.sqrt(minDist2);
  }

  /**
   * Find all points within the given radius of (x, z).
   * The search radius should be <= cellSize for correctness;
   * for larger radii, increase the neighborhood search.
   */
  queryRadius(
    x: number,
    z: number,
    radius: number,
  ): Array<{ x: number; z: number; data: T }> {
    const results: Array<{ x: number; z: number; data: T }> = [];
    const r2 = radius * radius;
    const cellsToCheck = Math.ceil(radius / this.cellSize);
    const cx = Math.floor(x / this.cellSize);
    const cz = Math.floor(z / this.cellSize);

    for (let dz = -cellsToCheck; dz <= cellsToCheck; dz++) {
      for (let dx = -cellsToCheck; dx <= cellsToCheck; dx++) {
        const k = `${cx + dx}_${cz + dz}`;
        const arr = this.cells.get(k);
        if (!arr) continue;
        for (const p of arr) {
          const d2 = (x - p.x) * (x - p.x) + (z - p.z) * (z - p.z);
          if (d2 <= r2) results.push(p);
        }
      }
    }

    return results;
  }

  /**
   * Find the nearest point and its data.
   * Returns null if the grid is empty.
   */
  nearest(
    x: number,
    z: number,
  ): { x: number; z: number; data: T; distance: number } | null {
    const cx = Math.floor(x / this.cellSize);
    const cz = Math.floor(z / this.cellSize);
    let minDist2 = Infinity;
    let closest: { x: number; z: number; data: T } | null = null;

    // Check 3x3 cell neighborhood
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const k = `${cx + dx}_${cz + dz}`;
        const arr = this.cells.get(k);
        if (!arr) continue;
        for (const p of arr) {
          const d2 = (x - p.x) * (x - p.x) + (z - p.z) * (z - p.z);
          if (d2 < minDist2) {
            minDist2 = d2;
            closest = p;
          }
        }
      }
    }

    if (!closest) return null;
    return { ...closest, distance: Math.sqrt(minDist2) };
  }

  /** Remove all points from the grid. */
  clear(): void {
    this.cells.clear();
  }

  /** Total number of inserted points. */
  get size(): number {
    let count = 0;
    for (const arr of this.cells.values()) {
      count += arr.length;
    }
    return count;
  }
}

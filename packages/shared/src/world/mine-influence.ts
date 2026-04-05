/**
 * Shared pure functions for mine influence calculation and bowl terrain deformation.
 *
 * Used by World Studio (TileBasedTerrain.tsx) and TerrainSystem.
 * Both use the same organic mine boundary + cosine falloff formula.
 */

/** Minimal mine area interface — any object matching this shape works. */
export interface MineArea {
  position: { x: number; y: number; z: number };
  radius: number;
  radialOffsets: number[];
  entryAngle: number;
  biome: string;
}

/** Biome index mapping for mine shader attributes */
const MINE_BIOME_INDEX: Record<string, number> = {
  forest: 0,
  tundra: 1,
  desert: 2,
  mountains: 3,
  plains: 4,
  swamp: 5,
  valley: 6,
};

/**
 * Get effective mine radius at a given angle using radial offsets.
 * Uses cosine interpolation between control points for organic boundaries.
 */
export function getMineEffectiveRadius(
  baseRadius: number,
  offsets: number[],
  angle: number,
): number {
  const n = offsets.length;
  if (n === 0) return baseRadius;
  const a = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const seg = (a / (Math.PI * 2)) * n;
  const i = Math.floor(seg);
  const f = seg - i;
  const v0 = offsets[i % n];
  const v1 = offsets[(i + 1) % n];
  const t = 0.5 * (1 - Math.cos(Math.PI * f));
  return baseRadius * (v0 + (v1 - v0) * t);
}

/** Pre-allocated result object to avoid GC pressure in per-vertex calls */
const _mineResult = { influence: 0, biomeIndex: 0 };

/**
 * Calculate mine influence (0-1) and biome index at a world position.
 * Returns highest influence from any mine at the given point.
 *
 * influence = 1 at mine center, smoothly falls to 0 at outer edge (1.2× effective radius).
 */
export function calculateMineInfluenceAtPoint(
  worldX: number,
  worldZ: number,
  mines: ReadonlyArray<MineArea> | undefined,
): { influence: number; biomeIndex: number } {
  _mineResult.influence = 0;
  _mineResult.biomeIndex = 0;
  if (!mines || mines.length === 0) return _mineResult;

  for (const mine of mines) {
    const dx = worldX - mine.position.x;
    const dz = worldZ - mine.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    // Quick AABB reject using max possible radius
    const maxR = mine.radius * 1.5;
    if (dist >= maxR) continue;

    // Organic boundary: effective radius varies by angle
    const angle = Math.atan2(dz, dx);
    const effectiveR = getMineEffectiveRadius(
      mine.radius,
      mine.radialOffsets,
      angle,
    );
    const outerRadius = effectiveR * 1.2;
    if (dist >= outerRadius) continue;

    // Smooth cosine falloff matching the bowl terrain shape
    const t = dist / outerRadius; // 0 at center, 1 at edge
    const influence = 0.5 * (1 + Math.cos(Math.PI * t)); // 1→0

    if (influence > _mineResult.influence) {
      _mineResult.influence = influence;
      _mineResult.biomeIndex = MINE_BIOME_INDEX[mine.biome] ?? 4;
    }
  }

  return _mineResult;
}

/** Bowl depression depth at full influence */
const MINE_BOWL_DEPTH = 6;

/**
 * Calculate bowl-shaped terrain height at a world position inside a mine area.
 * Returns the depressed height if inside the mine, or the original height if outside.
 */
export function calculateMineBowlHeight(
  worldX: number,
  worldZ: number,
  baseHeight: number,
  mine: MineArea,
): number {
  const dx = worldX - mine.position.x;
  const dz = worldZ - mine.position.z;
  const dist = Math.sqrt(dx * dx + dz * dz);

  const angle = Math.atan2(dz, dx);
  const effectiveR = getMineEffectiveRadius(
    mine.radius,
    mine.radialOffsets,
    angle,
  );
  const outerRadius = effectiveR * 1.2;
  if (dist >= outerRadius) return baseHeight;

  const t = dist / outerRadius;
  const bowlFactor = 0.5 * (1 + Math.cos(Math.PI * t)); // 1 at center, 0 at edge
  return baseHeight - MINE_BOWL_DEPTH * bowlFactor;
}

/**
 * Find the nearest mine to a world position that has non-zero influence.
 * Returns null if no mine influences the given point.
 */
export function findNearestInfluencingMine(
  worldX: number,
  worldZ: number,
  mines: ReadonlyArray<MineArea> | undefined,
): MineArea | null {
  if (!mines || mines.length === 0) return null;
  let nearest: MineArea | null = null;
  let nearestDist = Infinity;

  for (const mine of mines) {
    const dx = worldX - mine.position.x;
    const dz = worldZ - mine.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    const maxR = mine.radius * 1.5;
    if (dist >= maxR) continue;

    const angle = Math.atan2(dz, dx);
    const effectiveR = getMineEffectiveRadius(
      mine.radius,
      mine.radialOffsets,
      angle,
    );
    if (dist < effectiveR * 1.2 && dist < nearestDist) {
      nearest = mine;
      nearestDist = dist;
    }
  }

  return nearest;
}

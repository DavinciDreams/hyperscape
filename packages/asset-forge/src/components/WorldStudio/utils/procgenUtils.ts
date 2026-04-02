/**
 * procgenUtils — Shared deterministic RNG, hashing, distance, and selection utilities
 *
 * Used by both useZoneAutoGen (contour-based auto-generation) and
 * useZoneProcgen (tile-based per-region generation).
 *
 * Single source of truth — no duplicates allowed in hook files.
 */

/** Linear congruential PRNG seeded with an integer. Returns values in [0, 1). */
export function createSeededRng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s * 1664525 + 1013904223) | 0;
    return (s >>> 0) / 4294967296;
  };
}

/** Deterministic hash of a string to a 32-bit integer. */
export function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  return hash;
}

/** Squared Euclidean distance between two 2D points. */
export function dist2(x1: number, z1: number, x2: number, z2: number): number {
  const dx = x1 - x2;
  const dz = z1 - z2;
  return dx * dx + dz * dz;
}

/**
 * Weighted random selection from items that have a `weight` field.
 * Returns null for empty arrays.
 */
export function weightedSelect<T extends { weight: number }>(
  items: T[],
  rng: () => number,
): T | null {
  if (items.length === 0) return null;
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) return items[0];
  let roll = rng() * totalWeight;
  for (const item of items) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  return items[items.length - 1];
}

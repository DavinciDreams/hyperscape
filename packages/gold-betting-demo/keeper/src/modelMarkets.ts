import type { AgentRating } from "./trueskill";

const INDEX_BASE = 100;
const INDEX_STEP = 18;
const MIN_INDEX = 1;
const MAX_Z_SCORE = 4;

export function modelMarketIdFromCharacterId(characterId: string): number {
  let hash = 0x811c9dc5;
  const namespaced = `hyperscape:model:${characterId.trim().toLowerCase()}`;

  for (let index = 0; index < namespaced.length; index += 1) {
    hash ^= namespaced.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  const normalized = hash >>> 0;
  return normalized === 0 ? 1 : normalized;
}

export function conservativeSkill(rating: AgentRating): number {
  return rating.mu - 3 * rating.sigma;
}

export function calculateSyntheticSpotIndex(
  rating: AgentRating,
  population: readonly AgentRating[],
): number {
  const sample = population.length > 0 ? population : [rating];
  const conservativeScores = sample.map(conservativeSkill);
  const mean =
    conservativeScores.reduce((total, score) => total + score, 0) /
    conservativeScores.length;
  const variance =
    conservativeScores.reduce((total, score) => {
      const delta = score - mean;
      return total + delta * delta;
    }, 0) / conservativeScores.length;
  const stdDev = Math.sqrt(variance);
  const rawZScore =
    stdDev > Number.EPSILON ? (conservativeSkill(rating) - mean) / stdDev : 0;
  const zScore = Math.max(-MAX_Z_SCORE, Math.min(MAX_Z_SCORE, rawZScore));
  const syntheticIndex = Math.max(MIN_INDEX, INDEX_BASE + zScore * INDEX_STEP);
  return Math.round(syntheticIndex * 100) / 100;
}

export interface PerpsOracleHistorySnapshot {
  agentId: string;
  marketId: number;
  spotIndex: number;
  conservativeSkill: number;
  mu: number;
  sigma: number;
  recordedAt: number;
}

export interface PerpsOracleHistoryResponse {
  characterId: string;
  marketId: number;
  snapshots: PerpsOracleHistorySnapshot[];
  updatedAt: number;
}

export type PerpsMarketLifecycleStatus = "ACTIVE" | "CLOSE_ONLY" | "ARCHIVED";

export interface PerpsMarketDirectoryEntry {
  rank: number | null;
  characterId: string;
  marketId: number;
  name: string;
  provider: string;
  model: string;
  wins: number;
  losses: number;
  winRate: number;
  combatLevel: number;
  currentStreak: number;
  status: PerpsMarketLifecycleStatus;
  lastSeenAt: number;
  deprecatedAt: number | null;
  updatedAt: number;
}

export interface PerpsMarketsResponse {
  markets: PerpsMarketDirectoryEntry[];
  updatedAt: number;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPerpsOracleHistorySnapshot(
  value: unknown,
): value is PerpsOracleHistorySnapshot {
  const maybe = value as Partial<PerpsOracleHistorySnapshot>;
  return (
    typeof maybe?.agentId === "string" &&
    isFiniteNumber(maybe?.marketId) &&
    isFiniteNumber(maybe?.spotIndex) &&
    isFiniteNumber(maybe?.conservativeSkill) &&
    isFiniteNumber(maybe?.mu) &&
    isFiniteNumber(maybe?.sigma) &&
    isFiniteNumber(maybe?.recordedAt)
  );
}

function isPerpsMarketDirectoryEntry(
  value: unknown,
): value is PerpsMarketDirectoryEntry {
  const maybe = value as Partial<PerpsMarketDirectoryEntry>;
  return (
    typeof maybe?.characterId === "string" &&
    isFiniteNumber(maybe?.marketId) &&
    typeof maybe?.name === "string" &&
    typeof maybe?.provider === "string" &&
    typeof maybe?.model === "string" &&
    isFiniteNumber(maybe?.wins) &&
    isFiniteNumber(maybe?.losses) &&
    isFiniteNumber(maybe?.winRate) &&
    isFiniteNumber(maybe?.combatLevel) &&
    isFiniteNumber(maybe?.currentStreak) &&
    typeof maybe?.status === "string" &&
    isFiniteNumber(maybe?.lastSeenAt) &&
    isFiniteNumber(maybe?.updatedAt)
  );
}

export function sanitizePerpsOracleHistoryResponse(
  value: unknown,
  characterId: string,
): PerpsOracleHistoryResponse {
  const candidate = value as Partial<PerpsOracleHistoryResponse>;

  return {
    characterId:
      typeof candidate?.characterId === "string" &&
      candidate.characterId.trim().length > 0
        ? candidate.characterId
        : characterId,
    marketId: isFiniteNumber(candidate?.marketId)
      ? candidate.marketId
      : modelMarketIdFromCharacterId(characterId),
    snapshots: Array.isArray(candidate?.snapshots)
      ? candidate.snapshots.filter(isPerpsOracleHistorySnapshot)
      : [],
    updatedAt: isFiniteNumber(candidate?.updatedAt)
      ? candidate.updatedAt
      : Date.now(),
  };
}

export function sanitizePerpsMarketsResponse(
  value: unknown,
): PerpsMarketsResponse {
  const candidate = value as Partial<PerpsMarketsResponse>;
  return {
    markets: Array.isArray(candidate?.markets)
      ? candidate.markets.filter(isPerpsMarketDirectoryEntry)
      : [],
    updatedAt: isFiniteNumber(candidate?.updatedAt)
      ? candidate.updatedAt
      : Date.now(),
  };
}

export function modelMarketIdFromCharacterId(characterId: string): number {
  let hash = 0x811c9dc5;
  const namespaced = `hyperscape:model:${characterId.trim().toLowerCase()}`;

  for (let i = 0; i < namespaced.length; i += 1) {
    hash ^= namespaced.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }

  const normalized = hash >>> 0;
  return normalized === 0 ? 1 : normalized;
}

export function buildOracleHistoryLabel(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function toWinRatePercent(wins: number, losses: number): number {
  const total = wins + losses;
  if (total <= 0) return 0;
  return (wins / total) * 100;
}

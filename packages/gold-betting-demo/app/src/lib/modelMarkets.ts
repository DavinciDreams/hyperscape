export interface ModelsLeaderboardEntry {
  rank: number;
  characterId: string;
  name: string;
  provider: string;
  model: string;
  wins: number;
  losses: number;
  winRate: number;
  combatLevel: number;
  currentStreak: number;
}

export interface ModelsCycleAgent {
  id: string;
  name: string;
  provider: string;
  model: string;
  hp: number;
  maxHp: number;
  combatLevel: number;
  wins: number;
  losses: number;
  damageDealtThisFight: number;
}

export interface ModelsCycleSnapshot {
  cycleId: string;
  phase: "IDLE" | "ANNOUNCEMENT" | "COUNTDOWN" | "FIGHTING" | "RESOLUTION";
  cycleStartTime: number;
  phaseStartTime: number;
  phaseEndTime: number;
  timeRemaining: number;
  agent1: ModelsCycleAgent | null;
  agent2: ModelsCycleAgent | null;
  countdown: number | null;
  winnerId: string | null;
  winnerName: string | null;
  winReason: string | null;
}

export interface ModelsRecentDuelEntry {
  cycleId: string;
  duelId: string | null;
  finishedAt: number;
  winnerId: string;
  winnerName: string;
  loserId: string;
  loserName: string;
  winReason: "kill" | "hp_advantage" | "damage_advantage" | "draw";
  damageWinner: number;
  damageLoser: number;
}

export interface ModelsLeaderboardDetailsResponse {
  leaderboard: ModelsLeaderboardEntry[];
  cycle: ModelsCycleSnapshot;
  recentDuels: ModelsRecentDuelEntry[];
  updatedAt: number;
}

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

export interface ModelRankHistoryPoint {
  timestamp: number;
  rank: number;
  wins: number;
  losses: number;
  winRatePercent: number;
  label: string;
}

interface MutableRankState {
  characterId: string;
  name: string;
  wins: number;
  losses: number;
}

const FALLBACK_CYCLE: ModelsCycleSnapshot = {
  cycleId: "",
  phase: "IDLE",
  cycleStartTime: Date.now(),
  phaseStartTime: Date.now(),
  phaseEndTime: Date.now(),
  timeRemaining: 0,
  agent1: null,
  agent2: null,
  countdown: null,
  winnerId: null,
  winnerName: null,
  winReason: null,
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isModelsLeaderboardEntry(
  value: unknown,
): value is ModelsLeaderboardEntry {
  const maybe = value as Partial<ModelsLeaderboardEntry>;
  return (
    typeof maybe?.characterId === "string" &&
    typeof maybe?.name === "string" &&
    isFiniteNumber(maybe?.rank) &&
    isFiniteNumber(maybe?.wins) &&
    isFiniteNumber(maybe?.losses)
  );
}

function isModelsRecentDuelEntry(
  value: unknown,
): value is ModelsRecentDuelEntry {
  const maybe = value as Partial<ModelsRecentDuelEntry>;
  return (
    typeof maybe?.winnerId === "string" &&
    typeof maybe?.loserId === "string" &&
    isFiniteNumber(maybe?.finishedAt)
  );
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

export function sanitizeModelsLeaderboardResponse(
  value: unknown,
): ModelsLeaderboardDetailsResponse {
  const candidate = value as Partial<ModelsLeaderboardDetailsResponse>;

  return {
    leaderboard: Array.isArray(candidate?.leaderboard)
      ? candidate.leaderboard.filter(isModelsLeaderboardEntry)
      : [],
    cycle:
      candidate?.cycle && typeof candidate.cycle === "object"
        ? (candidate.cycle as ModelsCycleSnapshot)
        : FALLBACK_CYCLE,
    recentDuels: Array.isArray(candidate?.recentDuels)
      ? candidate.recentDuels.filter(isModelsRecentDuelEntry)
      : [],
    updatedAt: isFiniteNumber(candidate?.updatedAt)
      ? candidate.updatedAt
      : Date.now(),
  };
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

function sortRankStates(states: MutableRankState[]): MutableRankState[] {
  return [...states].sort((left, right) => {
    const winRateDelta =
      toWinRatePercent(right.wins, right.losses) -
      toWinRatePercent(left.wins, left.losses);
    if (Math.abs(winRateDelta) > Number.EPSILON) {
      return winRateDelta;
    }
    if (right.wins !== left.wins) {
      return right.wins - left.wins;
    }
    return left.name.localeCompare(right.name);
  });
}

function buildHistoryPoint(
  rank: number,
  timestamp: number,
  state: MutableRankState,
): ModelRankHistoryPoint {
  return {
    timestamp,
    rank,
    wins: state.wins,
    losses: state.losses,
    winRatePercent: toWinRatePercent(state.wins, state.losses),
    label: new Date(timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
}

export function buildModelRankHistory(
  leaderboard: readonly ModelsLeaderboardEntry[],
  recentDuels: readonly ModelsRecentDuelEntry[],
  selectedCharacterId: string | null,
): ModelRankHistoryPoint[] {
  if (!selectedCharacterId) return [];

  const stateById = new Map<string, MutableRankState>();
  for (const entry of leaderboard) {
    stateById.set(entry.characterId, {
      characterId: entry.characterId,
      name: entry.name,
      wins: entry.wins,
      losses: entry.losses,
    });
  }

  if (!stateById.has(selectedCharacterId)) {
    return [];
  }

  for (const duel of recentDuels) {
    const winner = stateById.get(duel.winnerId);
    const loser = stateById.get(duel.loserId);

    if (winner) {
      winner.wins = Math.max(0, winner.wins - 1);
    }
    if (loser) {
      loser.losses = Math.max(0, loser.losses - 1);
    }
  }

  const orderedDuels = [...recentDuels].sort(
    (left, right) => left.finishedAt - right.finishedAt,
  );
  const startingTimestamp = orderedDuels[0]?.finishedAt ?? Date.now() - 60_000;
  const history: ModelRankHistoryPoint[] = [];

  const pushCurrentRank = (timestamp: number) => {
    const orderedStates = sortRankStates([...stateById.values()]);
    const selectedIndex = orderedStates.findIndex(
      (state) => state.characterId === selectedCharacterId,
    );
    if (selectedIndex < 0) return;

    history.push(
      buildHistoryPoint(
        selectedIndex + 1,
        timestamp,
        orderedStates[selectedIndex],
      ),
    );
  };

  pushCurrentRank(Math.max(0, startingTimestamp - 1));

  for (const duel of orderedDuels) {
    const winner = stateById.get(duel.winnerId);
    const loser = stateById.get(duel.loserId);

    if (winner) {
      winner.wins += 1;
    }
    if (loser) {
      loser.losses += 1;
    }

    pushCurrentRank(duel.finishedAt);
  }

  return history;
}

import { describe, expect, test } from "bun:test";

import {
  buildOracleHistoryLabel,
  buildModelRankHistory,
  modelMarketIdFromCharacterId,
  sanitizePerpsOracleHistoryResponse,
  type ModelsLeaderboardEntry,
  type ModelsRecentDuelEntry,
} from "../../src/lib/modelMarkets";

describe("modelMarketIdFromCharacterId", () => {
  test("returns a stable non-zero market id", () => {
    const first = modelMarketIdFromCharacterId("agent-alpha");
    const second = modelMarketIdFromCharacterId("agent-alpha");
    const third = modelMarketIdFromCharacterId("agent-beta");

    expect(first).toBe(second);
    expect(first).not.toBe(0);
    expect(first).not.toBe(third);
  });
});

describe("buildModelRankHistory", () => {
  test("replays public duel history into rank snapshots", () => {
    const leaderboard: ModelsLeaderboardEntry[] = [
      {
        rank: 1,
        characterId: "alpha",
        name: "Alpha",
        provider: "openai",
        model: "gpt-alpha",
        wins: 1,
        losses: 0,
        winRate: 1,
        combatLevel: 99,
        currentStreak: 1,
      },
      {
        rank: 2,
        characterId: "beta",
        name: "Beta",
        provider: "anthropic",
        model: "claude-beta",
        wins: 1,
        losses: 1,
        winRate: 0.5,
        combatLevel: 99,
        currentStreak: 0,
      },
      {
        rank: 3,
        characterId: "gamma",
        name: "Gamma",
        provider: "google",
        model: "gemini-gamma",
        wins: 0,
        losses: 1,
        winRate: 0,
        combatLevel: 99,
        currentStreak: 0,
      },
    ];

    const recentDuels: ModelsRecentDuelEntry[] = [
      {
        cycleId: "cycle-2",
        duelId: "duel-2",
        finishedAt: 2_000,
        winnerId: "beta",
        winnerName: "Beta",
        loserId: "gamma",
        loserName: "Gamma",
        winReason: "kill",
        damageWinner: 12,
        damageLoser: 8,
      },
      {
        cycleId: "cycle-1",
        duelId: "duel-1",
        finishedAt: 1_000,
        winnerId: "alpha",
        winnerName: "Alpha",
        loserId: "beta",
        loserName: "Beta",
        winReason: "kill",
        damageWinner: 15,
        damageLoser: 6,
      },
    ];

    const history = buildModelRankHistory(leaderboard, recentDuels, "beta");

    expect(history).toHaveLength(3);
    expect(history.map((point) => point.rank)).toEqual([2, 2, 2]);
    expect(history.map((point) => [point.wins, point.losses])).toEqual([
      [0, 0],
      [0, 1],
      [1, 1],
    ]);
  });
});

describe("sanitizePerpsOracleHistoryResponse", () => {
  test("keeps only valid oracle snapshots and falls back to the derived market id", () => {
    const response = sanitizePerpsOracleHistoryResponse(
      {
        snapshots: [
          {
            agentId: "alpha",
            marketId: 123,
            spotIndex: 101.25,
            conservativeSkill: 7.5,
            mu: 25,
            sigma: 5.8,
            recordedAt: 1_000,
          },
          {
            agentId: "alpha",
            marketId: "bad",
          },
        ],
      },
      "alpha",
    );

    expect(response.characterId).toBe("alpha");
    expect(response.marketId).toBe(modelMarketIdFromCharacterId("alpha"));
    expect(response.snapshots).toHaveLength(1);
    expect(response.snapshots[0]?.spotIndex).toBe(101.25);
  });
});

describe("buildOracleHistoryLabel", () => {
  test("returns a non-empty time label", () => {
    expect(buildOracleHistoryLabel(1_000)).not.toHaveLength(0);
  });
});

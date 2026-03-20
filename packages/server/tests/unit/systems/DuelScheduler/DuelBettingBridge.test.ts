import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DuelBettingBridge } from "../../../../src/systems/DuelScheduler/DuelBettingBridge.js";

const { getStreamingDuelSchedulerMock } = vi.hoisted(() => ({
  getStreamingDuelSchedulerMock: vi.fn(),
}));

vi.mock(
  "../../../../src/systems/StreamingDuelScheduler/index.js",
  () => ({
    getStreamingDuelScheduler: getStreamingDuelSchedulerMock,
  }),
);

function createMockWorld() {
  return {
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
  } as unknown as Parameters<typeof DuelBettingBridge>[0];
}

function makeCycle(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    cycleId: "cycle-123",
    phase: "ANNOUNCEMENT",
    duelId: "duel-123",
    duelKeyHex:
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    agent1: {
      characterId: "agent-a",
      name: "Agent A",
    },
    agent2: {
      characterId: "agent-b",
      name: "Agent B",
    },
    betOpenTime: 1_000,
    betCloseTime: 2_000,
    cycleStartTime: 500,
    phaseStartTime: 500,
    duelEndTime: null,
    winnerId: null,
    loserId: null,
    winReason: null,
    seed: null,
    replayHash: null,
    arenaId: null,
    countdownValue: null,
    arenaPositions: null,
    ...overrides,
  };
}

describe("DuelBettingBridge streaming reconciliation", () => {
  let world: ReturnType<typeof createMockWorld>;
  let bridge: DuelBettingBridge;

  beforeEach(() => {
    vi.useFakeTimers();
    world = createMockWorld();
    bridge = new DuelBettingBridge(world as never);
    getStreamingDuelSchedulerMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("creates a market from streaming announcement data using the live duel key", async () => {
    await (bridge as any).handleStreamingAnnouncement({
      duelId: "duel-123",
      duelKeyHex:
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      agent1: { id: "agent-a", name: "Agent A" },
      agent2: { id: "agent-b", name: "Agent B" },
      betOpenTime: 1_000,
      betCloseTime: 2_000,
    });

    const market = bridge.getMarket("duel-123");
    expect(market).not.toBeNull();
    expect(market?.duelKeyHex).toBe(
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    );
    expect(market?.roundSeedHex).toBe(market?.duelKeyHex);
    expect(market?.status).toBe("betting");
    expect(world.emit).toHaveBeenCalledWith(
      "betting:market:created",
      expect.objectContaining({
        duelId: "duel-123",
        source: "streaming",
        market: expect.objectContaining({
          duelKeyHex:
            "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        }),
      }),
    );
  });

  it("locks and resolves a market when the live duel advances phases", async () => {
    await (bridge as any).handleStreamingAnnouncement({
      duelId: "duel-123",
      duelKeyHex:
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      agent1: { id: "agent-a", name: "Agent A" },
      agent2: { id: "agent-b", name: "Agent B" },
      betOpenTime: 1_000,
      betCloseTime: 2_000,
    });

    await (bridge as any).handleStreamingFightStart({
      duelId: "duel-123",
      duelKeyHex:
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      fightStartTime: 2_500,
    });

    expect(bridge.getMarket("duel-123")?.status).toBe("locked");
    expect(world.emit).toHaveBeenCalledWith(
      "betting:market:locked",
      expect.objectContaining({
        duelId: "duel-123",
      }),
    );

    await (bridge as any).handleStreamingResolution({
      duelId: "duel-123",
      duelKeyHex:
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      duelEndTime: 9_000,
      winnerId: "agent-a",
      loserId: "agent-b",
      winnerName: "Agent A",
      loserName: "Agent B",
      winReason: "kill",
      seed: "12345",
      replayHash: "deadbeef",
      duration: 6_500,
    });

    expect(bridge.getMarket("duel-123")).toBeNull();
    expect(bridge.getMarketHistory()).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(15_000);

    expect(world.emit).toHaveBeenCalledWith(
      "betting:market:resolved",
      expect.objectContaining({
        duelId: "duel-123",
        winnerId: "agent-a",
        winnerName: "Agent A",
      }),
    );
  });

  it("reconciles a missing market from the live streaming scheduler", async () => {
    const cycle = makeCycle();
    getStreamingDuelSchedulerMock.mockReturnValue({
      getCurrentCycle: () => cycle,
    });

    await (bridge as any).reconcileLiveCycle();

    const created = bridge.getMarket("duel-123");
    expect(created).not.toBeNull();
    expect(created?.duelKeyHex).toBe(cycle.duelKeyHex);

    cycle.phase = "FIGHTING";
    cycle.phaseStartTime = 2_500;
    cycle.fightStartTime = 2_500;
    getStreamingDuelSchedulerMock.mockReturnValue({
      getCurrentCycle: () => cycle,
    });

    await (bridge as any).reconcileLiveCycle();
    expect(bridge.getMarket("duel-123")?.status).toBe("locked");

    cycle.phase = "RESOLUTION";
    cycle.winnerId = "agent-a";
    cycle.loserId = "agent-b";
    cycle.winnerName = "Agent A";
    cycle.loserName = "Agent B";
    cycle.duelEndTime = 9_000;
    cycle.seed = "12345";
    cycle.replayHash = "deadbeef";
    getStreamingDuelSchedulerMock.mockReturnValue({
      getCurrentCycle: () => cycle,
    });

    await (bridge as any).reconcileLiveCycle();
    await vi.advanceTimersByTimeAsync(15_000);

    expect(bridge.getMarket("duel-123")).toBeNull();
    expect(bridge.getMarketHistory()).toHaveLength(1);
  });
});

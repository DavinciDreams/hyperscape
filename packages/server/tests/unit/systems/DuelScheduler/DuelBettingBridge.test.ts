import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DuelBettingBridge } from "../../../../src/systems/DuelScheduler/DuelBettingBridge.js";

function createMockWorld() {
  return {
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
  } as unknown as Parameters<typeof DuelBettingBridge>[0];
}

type DuelBettingBridgeTestHarness = DuelBettingBridge & {
  handleStreamingAnnouncement(payload: unknown): Promise<void>;
  handleStreamingFightStart(payload: unknown): Promise<void>;
  handleStreamingResolution(payload: unknown): Promise<void>;
  handleDuelResult(payload: unknown): Promise<void>;
  reconcileLiveCycle(): Promise<void>;
  runScheduledReconciliation(): Promise<void>;
  createOrSyncMarket(payload: unknown): Promise<void>;
  resolveMarket(...args: unknown[]): Promise<void>;
  reconcileTimer: ReturnType<typeof setTimeout> | null;
  reconcileInFlight: boolean;
};

function asTestHarness(
  bridge: DuelBettingBridge,
): DuelBettingBridgeTestHarness {
  return bridge as unknown as DuelBettingBridgeTestHarness;
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
  let bridgeHarness: DuelBettingBridgeTestHarness;
  let scheduler: { getCurrentCycle: () => ReturnType<typeof makeCycle> | null } | null;

  beforeEach(() => {
    vi.useFakeTimers();
    world = createMockWorld();
    scheduler = null;
    bridge = new DuelBettingBridge(world as never, {
      getStreamingDuelScheduler: () => scheduler as never,
    });
    bridgeHarness = asTestHarness(bridge);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("creates a market from streaming announcement data using the live duel key", async () => {
    await bridgeHarness.handleStreamingAnnouncement({
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

  it("ignores malformed announcement payloads instead of creating a market", async () => {
    await bridgeHarness.handleStreamingAnnouncement({
      duelId: "duel-123",
      agent1: { id: "agent-a", name: "Agent A" },
    });

    expect(bridge.getMarket("duel-123")).toBeNull();
    expect(world.emit).not.toHaveBeenCalledWith(
      "betting:market:created",
      expect.anything(),
    );
  });

  it("locks and resolves a market when the live duel advances phases", async () => {
    await bridgeHarness.handleStreamingAnnouncement({
      duelId: "duel-123",
      duelKeyHex:
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      agent1: { id: "agent-a", name: "Agent A" },
      agent2: { id: "agent-b", name: "Agent B" },
      betOpenTime: 1_000,
      betCloseTime: 2_000,
    });

    await bridgeHarness.handleStreamingFightStart({
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

    await bridgeHarness.handleStreamingResolution({
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
    scheduler = {
      getCurrentCycle: () => cycle,
    };

    await bridgeHarness.reconcileLiveCycle();

    const created = bridge.getMarket("duel-123");
    expect(created).not.toBeNull();
    expect(created?.duelKeyHex).toBe(cycle.duelKeyHex);

    cycle.phase = "FIGHTING";
    cycle.phaseStartTime = 2_500;
    cycle.fightStartTime = 2_500;
    await bridgeHarness.reconcileLiveCycle();
    expect(bridge.getMarket("duel-123")?.status).toBe("locked");

    cycle.phase = "RESOLUTION";
    cycle.winnerId = "agent-a";
    cycle.loserId = "agent-b";
    cycle.winnerName = "Agent A";
    cycle.loserName = "Agent B";
    cycle.duelEndTime = 9_000;
    cycle.seed = "12345";
    cycle.replayHash = "deadbeef";
    await bridgeHarness.reconcileLiveCycle();
    await vi.advanceTimersByTimeAsync(15_000);

    expect(bridge.getMarket("duel-123")).toBeNull();
    expect(bridge.getMarketHistory()).toHaveLength(1);
  });

  it("does not recreate a resolved market while the live cycle remains in resolution", async () => {
    const cycle = makeCycle();
    scheduler = {
      getCurrentCycle: () => cycle,
    };

    await bridgeHarness.reconcileLiveCycle();

    cycle.phase = "FIGHTING";
    cycle.phaseStartTime = 2_500;
    cycle.fightStartTime = 2_500;
    await bridgeHarness.reconcileLiveCycle();

    cycle.phase = "RESOLUTION";
    cycle.winnerId = "agent-a";
    cycle.loserId = "agent-b";
    cycle.winnerName = "Agent A";
    cycle.loserName = "Agent B";
    cycle.duelEndTime = 9_000;
    cycle.seed = "12345";
    cycle.replayHash = "deadbeef";

    await bridgeHarness.reconcileLiveCycle();

    expect(bridge.getMarket("duel-123")).toBeNull();
    expect(bridge.getMarketHistory()).toHaveLength(1);

    await bridgeHarness.reconcileLiveCycle();

    expect(bridge.getMarket("duel-123")).toBeNull();
    expect(bridge.getMarketHistory()).toHaveLength(1);
  });

  it("resets reconcileInFlight even when a reconcile pass throws", async () => {
    const cycle = makeCycle();
    scheduler = {
      getCurrentCycle: () => cycle,
    };

    const createOrSyncMarket = vi
      .spyOn(bridgeHarness, "createOrSyncMarket")
      .mockRejectedValueOnce(new Error("boom"));

    await expect(bridgeHarness.reconcileLiveCycle()).rejects.toThrow("boom");
    expect(bridgeHarness.reconcileInFlight).toBe(false);

    createOrSyncMarket.mockRestore();

    await bridgeHarness.reconcileLiveCycle();
    expect(bridge.getMarket("duel-123")).not.toBeNull();
  });

  it("swallows and logs direct reconcile failures from fight-start recovery", async () => {
    const reconcileLiveCycle = vi
      .spyOn(bridgeHarness, "reconcileLiveCycle")
      .mockRejectedValueOnce(new Error("boom"));

    await expect(
      bridgeHarness.handleStreamingFightStart({
        duelId: "duel-123",
      }),
    ).resolves.toBeUndefined();

    reconcileLiveCycle.mockRestore();
  });

  it("awaits duel-result resolution instead of fire-and-forgetting it", async () => {
    await bridgeHarness.handleStreamingAnnouncement({
      duelId: "duel-123",
      duelKeyHex:
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      agent1: { id: "agent-a", name: "Agent A" },
      agent2: { id: "agent-b", name: "Agent B" },
      betOpenTime: 1_000,
      betCloseTime: 2_000,
    });

    const resolveMarket = vi
      .spyOn(bridgeHarness, "resolveMarket")
      .mockRejectedValueOnce(new Error("boom"));

    await expect(
      bridgeHarness.handleDuelResult({
        winnerId: "agent-a",
        loserId: "agent-b",
      }),
    ).rejects.toThrow("boom");

    resolveMarket.mockRestore();
  });

  it("ignores malformed duel-result payloads instead of resolving a market", async () => {
    await bridgeHarness.handleStreamingAnnouncement({
      duelId: "duel-123",
      duelKeyHex:
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      agent1: { id: "agent-a", name: "Agent A" },
      agent2: { id: "agent-b", name: "Agent B" },
      betOpenTime: 1_000,
      betCloseTime: 2_000,
    });

    await bridgeHarness.handleDuelResult({
      winnerId: "agent-a",
    });

    expect(bridge.getMarket("duel-123")?.status).toBe("betting");
    expect(bridge.getMarketHistory()).toHaveLength(0);
  });

  it("stops the scheduled reconciliation loop when streaming is inactive and there are no markets", async () => {
    scheduler = null;

    await bridgeHarness.runScheduledReconciliation();

    expect(bridgeHarness.reconcileTimer).toBeNull();
  });

  it("ignores malformed resolution payloads instead of mutating market state", async () => {
    await bridgeHarness.handleStreamingAnnouncement({
      duelId: "duel-123",
      duelKeyHex:
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      agent1: { id: "agent-a", name: "Agent A" },
      agent2: { id: "agent-b", name: "Agent B" },
      betOpenTime: 1_000,
      betCloseTime: 2_000,
    });

    await bridgeHarness.handleStreamingResolution({
      duelId: "duel-123",
      winnerId: "agent-a",
    });

    expect(bridge.getMarket("duel-123")?.status).toBe("betting");
    expect(bridge.getMarketHistory()).toHaveLength(0);
  });
});

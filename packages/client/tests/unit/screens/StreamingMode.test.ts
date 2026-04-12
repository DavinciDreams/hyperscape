import { describe, it, expect, vi } from "vitest";
import { buildCaptureControlStatus } from "../../../src/lib/captureStatus";
import {
  deriveStreamingRendererHealth,
  shouldDismissStreamingLoading,
  shouldShowStreamingLoadingOverlay,
} from "../../../src/screens/StreamingMode";

describe("buildCaptureControlStatus", () => {
  it("emits absolute and relative last-chunk fields while preserving the legacy age field", () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(10_000);
    try {
      expect(
        buildCaptureControlStatus({
          recorderState: "recording",
          wsReadyState: WebSocket.OPEN,
          chunkCount: 4,
          bytesSent: 2048,
          startedAt: 9_000,
          lastChunkAt: 9_750,
          wsBufferedAmount: 256,
          heapUsedBytes: 1024,
          heapLimitBytes: 8192,
        }),
      ).toEqual({
        recording: true,
        wsConnected: true,
        chunkCount: 4,
        bytesSent: 2048,
        uptime: 1000,
        lastChunkAt: 9750,
        lastChunkAgeMs: 250,
        lastChunkMs: 250,
        wsBufferedAmount: 256,
        heapUsedBytes: 1024,
        heapLimitBytes: 8192,
      });
    } finally {
      nowSpy.mockRestore();
    }
  });
});

describe("shouldDismissStreamingLoading", () => {
  it("keeps the overlay up until the world is ready", () => {
    expect(
      shouldDismissStreamingLoading({
        connected: true,
        worldReady: false,
        terrainReady: true,
        hasStreamingState: true,
        initError: null,
        needsCameraLock: false,
        cameraLocked: false,
        phase: "ANNOUNCEMENT",
      }),
    ).toBe(false);
  });

  it("keeps the overlay up until the camera is locked when required", () => {
    expect(
      shouldDismissStreamingLoading({
        connected: true,
        worldReady: true,
        terrainReady: true,
        hasStreamingState: true,
        initError: null,
        needsCameraLock: true,
        cameraLocked: false,
        phase: "FIGHTING",
      }),
    ).toBe(false);
  });

  it("keeps the overlay up while disconnected", () => {
    expect(
      shouldDismissStreamingLoading({
        connected: false,
        worldReady: true,
        terrainReady: true,
        hasStreamingState: true,
        initError: null,
        needsCameraLock: false,
        cameraLocked: false,
        phase: "COUNTDOWN",
      }),
    ).toBe(false);
  });

  it("keeps the overlay up until terrain is ready", () => {
    expect(
      shouldDismissStreamingLoading({
        connected: true,
        worldReady: true,
        terrainReady: false,
        hasStreamingState: true,
        initError: null,
        needsCameraLock: false,
        cameraLocked: false,
        phase: "COUNTDOWN",
      }),
    ).toBe(false);
  });

  it("keeps the overlay up when the client is in an active duel without streaming state", () => {
    expect(
      shouldDismissStreamingLoading({
        connected: true,
        worldReady: true,
        terrainReady: true,
        hasStreamingState: false,
        initError: null,
        needsCameraLock: false,
        cameraLocked: false,
        phase: "FIGHTING",
      }),
    ).toBe(false);
  });

  it("never re-shows the loading overlay after the initial dismissal", () => {
    expect(
      shouldShowStreamingLoadingOverlay({
        initError: null,
        loadingDismissed: true,
      }),
    ).toBe(false);
  });

  it("does not show the loading overlay after an init error", () => {
    expect(
      shouldShowStreamingLoadingOverlay({
        initError: "WebGPU Required",
        loadingDismissed: false,
      }),
    ).toBe(false);
  });

  it("marks a live duel as degraded while the loading overlay is still visible", () => {
    expect(
      deriveStreamingRendererHealth({
        connected: true,
        worldReady: true,
        terrainReady: true,
        hasStreamingState: true,
        initError: null,
        needsCameraLock: true,
        cameraLocked: true,
        loadingDismissed: false,
        phase: "FIGHTING",
        agent1: {
          id: "a",
          name: "Agent A",
          provider: "provider",
          model: "model",
          hp: 10,
          maxHp: 10,
          combatLevel: 1,
          wins: 0,
          losses: 0,
          damageDealtThisFight: 0,
          highestHit: 0,
          attacksLanded: 0,
          healsUsed: 0,
          equipment: {},
          inventory: [],
          rank: 1,
          headToHeadWins: 0,
          headToHeadLosses: 0,
        },
        agent2: {
          id: "b",
          name: "Agent B",
          provider: "provider",
          model: "model",
          hp: 10,
          maxHp: 10,
          combatLevel: 1,
          wins: 0,
          losses: 0,
          damageDealtThisFight: 0,
          highestHit: 0,
          attacksLanded: 0,
          healsUsed: 0,
          equipment: {},
          inventory: [],
          rank: 2,
          headToHeadWins: 0,
          headToHeadLosses: 0,
        },
        arenaPositions: {
          agent1: [1, 0, 1],
          agent2: [3, 0, 3],
        },
      }).degradedReason,
    ).toBe("loading_overlay_active");
  });

  it("marks overlapping arena positions as unhealthy", () => {
    expect(
      deriveStreamingRendererHealth({
        connected: true,
        worldReady: true,
        terrainReady: true,
        hasStreamingState: true,
        initError: null,
        needsCameraLock: false,
        cameraLocked: false,
        loadingDismissed: true,
        phase: "COUNTDOWN",
        agent1: {
          id: "a",
          name: "Agent A",
          provider: "provider",
          model: "model",
          hp: 10,
          maxHp: 10,
          combatLevel: 1,
          wins: 0,
          losses: 0,
          damageDealtThisFight: 0,
          highestHit: 0,
          attacksLanded: 0,
          healsUsed: 0,
          equipment: {},
          inventory: [],
          rank: 1,
          headToHeadWins: 0,
          headToHeadLosses: 0,
        },
        agent2: {
          id: "b",
          name: "Agent B",
          provider: "provider",
          model: "model",
          hp: 10,
          maxHp: 10,
          combatLevel: 1,
          wins: 0,
          losses: 0,
          damageDealtThisFight: 0,
          highestHit: 0,
          attacksLanded: 0,
          healsUsed: 0,
          equipment: {},
          inventory: [],
          rank: 2,
          headToHeadWins: 0,
          headToHeadLosses: 0,
        },
        arenaPositions: {
          agent1: [2, 0, 2],
          agent2: [2, 0, 2],
        },
      }).degradedReason,
    ).toBe("arena_positions_invalid");
  });

  it("keeps the stream unhealthy until active duel arena visuals mount", () => {
    const health = deriveStreamingRendererHealth({
      connected: true,
      worldReady: true,
      terrainReady: true,
      hasStreamingState: true,
      initError: null,
      needsCameraLock: true,
      cameraLocked: true,
      needsArenaVisuals: true,
      arenaVisualsReady: false,
      needsTargetAvatar: false,
      targetAvatarReady: true,
      loadingDismissed: true,
      phase: "FIGHTING",
      agent1: {
        id: "a",
        name: "Agent A",
        provider: "provider",
        model: "model",
        hp: 10,
        maxHp: 10,
        combatLevel: 1,
        wins: 0,
        losses: 0,
        damageDealtThisFight: 0,
        highestHit: 0,
        attacksLanded: 0,
        healsUsed: 0,
        equipment: {},
        inventory: [],
        rank: 1,
        headToHeadWins: 0,
        headToHeadLosses: 0,
      },
      agent2: {
        id: "b",
        name: "Agent B",
        provider: "provider",
        model: "model",
        hp: 10,
        maxHp: 10,
        combatLevel: 1,
        wins: 0,
        losses: 0,
        damageDealtThisFight: 0,
        highestHit: 0,
        attacksLanded: 0,
        healsUsed: 0,
        equipment: {},
        inventory: [],
        rank: 2,
        headToHeadWins: 0,
        headToHeadLosses: 0,
      },
      arenaPositions: {
        agent1: [1, 0, 1],
        agent2: [4, 0, 4],
      },
    });

    expect(health.ready).toBe(false);
    expect(health.degradedReason).toBe("arena_visuals_not_ready");
  });

  it("reports ready only after the live duel surface is sane and the overlay is gone", () => {
    const health = deriveStreamingRendererHealth({
      connected: true,
      worldReady: true,
      terrainReady: true,
      hasStreamingState: true,
      initError: null,
      needsCameraLock: true,
      cameraLocked: true,
      loadingDismissed: true,
      phase: "FIGHTING",
      agent1: {
        id: "a",
        name: "Agent A",
        provider: "provider",
        model: "model",
        hp: 10,
        maxHp: 10,
        combatLevel: 1,
        wins: 0,
        losses: 0,
        damageDealtThisFight: 0,
        highestHit: 0,
        attacksLanded: 0,
        healsUsed: 0,
        equipment: {},
        inventory: [],
        rank: 1,
        headToHeadWins: 0,
        headToHeadLosses: 0,
      },
      agent2: {
        id: "b",
        name: "Agent B",
        provider: "provider",
        model: "model",
        hp: 8,
        maxHp: 10,
        combatLevel: 1,
        wins: 0,
        losses: 0,
        damageDealtThisFight: 0,
        highestHit: 0,
        attacksLanded: 0,
        healsUsed: 0,
        equipment: {},
        inventory: [],
        rank: 2,
        headToHeadWins: 0,
        headToHeadLosses: 0,
      },
      arenaPositions: {
        agent1: [1, 0, 1],
        agent2: [4, 0, 4],
      },
    });

    expect(health.ready).toBe(true);
    expect(health.degradedReason).toBeNull();
  });

  it("does not report ready during idle when streaming state is still absent", () => {
    const health = deriveStreamingRendererHealth({
      connected: true,
      worldReady: true,
      terrainReady: true,
      hasStreamingState: false,
      initError: null,
      needsCameraLock: false,
      cameraLocked: false,
      loadingDismissed: true,
      phase: "IDLE",
      agent1: null,
      agent2: null,
      arenaPositions: null,
    });

    expect(health.ready).toBe(false);
    expect(health.degradedReason).toBe("waiting_for_duel_data");
  });

  it("marks the stream as unhealthy when the game client reports an init error", () => {
    const health = deriveStreamingRendererHealth({
      connected: true,
      worldReady: true,
      terrainReady: true,
      hasStreamingState: true,
      initError: "HTTP error! status: 404",
      needsCameraLock: true,
      cameraLocked: true,
      loadingDismissed: true,
      phase: "ANNOUNCEMENT",
      agent1: {
        id: "a",
        name: "Agent A",
        provider: "provider",
        model: "model",
        hp: 10,
        maxHp: 10,
        combatLevel: 1,
        wins: 0,
        losses: 0,
        damageDealtThisFight: 0,
        highestHit: 0,
        attacksLanded: 0,
        healsUsed: 0,
        equipment: {},
        inventory: [],
        rank: 1,
        headToHeadWins: 0,
        headToHeadLosses: 0,
      },
      agent2: {
        id: "b",
        name: "Agent B",
        provider: "provider",
        model: "model",
        hp: 10,
        maxHp: 10,
        combatLevel: 1,
        wins: 0,
        losses: 0,
        damageDealtThisFight: 0,
        highestHit: 0,
        attacksLanded: 0,
        healsUsed: 0,
        equipment: {},
        inventory: [],
        rank: 2,
        headToHeadWins: 0,
        headToHeadLosses: 0,
      },
      arenaPositions: {
        agent1: [1, 0, 1],
        agent2: [4, 0, 4],
      },
    });

    expect(health.ready).toBe(false);
    expect(health.degradedReason).toBe("initialization_failed");
  });
});

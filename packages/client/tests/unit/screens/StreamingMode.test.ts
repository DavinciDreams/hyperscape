import { describe, it, expect } from "vitest";
import {
  deriveStreamingRendererHealth,
  shouldDismissStreamingLoading,
} from "../../../src/screens/StreamingMode";

describe("shouldDismissStreamingLoading", () => {
  it("allows dismissal once the server state is ready even before worldReady flips", () => {
    expect(
      shouldDismissStreamingLoading({
        connected: true,
        worldReady: false,
        terrainReady: true,
        hasStreamingState: true,
        needsCameraLock: false,
        cameraLocked: false,
      }),
    ).toBe(true);
  });

  it("keeps the overlay up until the camera is locked when required", () => {
    expect(
      shouldDismissStreamingLoading({
        connected: true,
        worldReady: true,
        terrainReady: true,
        hasStreamingState: true,
        needsCameraLock: true,
        cameraLocked: false,
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

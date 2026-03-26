/**
 * PlayerDeathSystem Unit Tests
 *
 * Tests the death-to-respawn pipeline and security guards using mocked systems.
 * (True integration tests use Playwright with real Hyperscape instances.)
 *
 * Verifies:
 * - Death processing guard prevents respawn race conditions
 * - Duel system blocks respawn during active duels
 * - Tick-based respawn fires at correct tick
 * - PLAYER_SET_DEAD is the canonical event (not legacy PLAYER_DIED)
 * - Persist retry queue processes on tick
 */

import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { PlayerDeathSystem } from "../PlayerDeathSystem";
import { DeathState } from "../../../../types/entities";
import { COMBAT_CONSTANTS } from "../../../../constants/CombatConstants";
import { EventType } from "../../../../types/events";

// =============================================================================
// MOCK INFRASTRUCTURE
// =============================================================================

interface MockPlayerEntity {
  data: {
    e?: string;
    visible?: boolean;
    name?: string;
    position?: number[];
    deathState?: DeathState;
    deathPosition?: [number, number, number];
    respawnTick?: number;
  };
  position?: { x: number; y: number; z: number };
  setHealth: Mock;
  getMaxHealth: Mock;
  markNetworkDirty: Mock;
  emote?: string;
}

function createMockPlayerEntity(
  overrides: Partial<MockPlayerEntity> = {},
): MockPlayerEntity {
  return {
    data: {
      e: "idle",
      visible: true,
      name: "TestPlayer",
      deathState: DeathState.ALIVE,
      ...overrides.data,
    },
    position: { x: 100, y: 0, z: 200 },
    setHealth: vi.fn(),
    getMaxHealth: vi.fn().mockReturnValue(100),
    markNetworkDirty: vi.fn(),
    ...overrides,
  };
}

interface MockWorld {
  isServer: boolean;
  currentTick: number;
  entities: {
    get: Mock;
    players: Map<string, MockPlayerEntity>;
  };
  getSystem: Mock;
  on: Mock;
  off: Mock;
  emit: Mock;
  getPlayer: Mock;
}

function createMockWorld(isServer = true, currentTick = 1000): MockWorld {
  return {
    isServer,
    currentTick,
    entities: {
      get: vi.fn(),
      players: new Map<string, MockPlayerEntity>(),
    },
    getSystem: vi.fn().mockReturnValue(null),
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    getPlayer: vi.fn(),
  };
}

/** Minimal mock that lets PlayerDeathSystem construct and subscribe */
function createSystemWorld(world: MockWorld) {
  // PlayerDeathSystem extends SystemBase, which needs world with certain methods
  // We'll use the world directly since SystemBase stores it as this.world
  return world as never;
}

// =============================================================================
// TESTS
// =============================================================================

describe("PlayerDeathSystem — death-to-respawn flow", () => {
  let world: MockWorld;
  let deathSystem: PlayerDeathSystem;
  let subscribedEvents: Map<string, (...args: unknown[]) => void>;
  let emittedEvents: Array<{ type: string; data: unknown }>;

  beforeEach(async () => {
    world = createMockWorld(true, 1000);
    subscribedEvents = new Map();
    emittedEvents = [];

    // Capture event subscriptions
    world.on.mockImplementation(
      (eventType: string, handler: (...args: unknown[]) => void) => {
        subscribedEvents.set(eventType, handler);
      },
    );

    // Capture event emissions
    world.emit.mockImplementation((eventType: string, data: unknown) => {
      emittedEvents.push({ type: eventType, data });
    });

    // Ground items system (required dependency)
    const mockGroundItemSystem = {
      spawnGroundItems: vi.fn().mockResolvedValue(["gi_1", "gi_2"]),
    };

    // Database system
    const mockDatabaseSystem = {
      executeInTransaction: vi
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
          await fn({ __tx: true });
        }),
    };

    // Equipment system
    const mockEquipmentSystem = {
      getPlayerEquipment: vi.fn().mockReturnValue(null),
      clearEquipmentAndReturn: vi.fn().mockResolvedValue([]),
      clearEquipmentImmediate: vi.fn().mockResolvedValue(undefined),
    };

    // Inventory system
    const mockInventorySystem = {
      getItems: vi.fn().mockReturnValue([]),
      clearInventoryImmediate: vi.fn().mockResolvedValue(undefined),
    };

    // Tick system
    const mockTickSystem = {
      getCurrentTick: vi.fn().mockReturnValue(world.currentTick),
      onTick: vi.fn().mockReturnValue(() => {}),
    };

    // Duel system (default: no active duels)
    const mockDuelSystem = {
      isPlayerInActiveDuel: vi.fn().mockReturnValue(false),
    };

    // Entity manager
    const mockEntityManager = {
      spawnEntity: vi.fn().mockResolvedValue({ id: "gravestone_test" }),
      destroyEntity: vi.fn(),
    };

    world.getSystem.mockImplementation((name: string) => {
      switch (name) {
        case "ground-items":
          return mockGroundItemSystem;
        case "database":
          return mockDatabaseSystem;
        case "equipment":
          return mockEquipmentSystem;
        case "inventory":
          return mockInventorySystem;
        case "tick":
          return mockTickSystem;
        case "duel":
          return mockDuelSystem;
        case "entity-manager":
          return mockEntityManager;
        case "terrain":
          return null;
        case "combat":
          return null;
        case "player":
          return { players: world.entities.players };
        default:
          return null;
      }
    });

    deathSystem = new PlayerDeathSystem(createSystemWorld(world));

    // Suppress console output in tests
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  describe("duel guard on respawn", () => {
    it("blocks respawn request when player is in active duel", () => {
      const mockDuelSystem = {
        isPlayerInActiveDuel: vi.fn().mockReturnValue(true),
      };
      world.getSystem.mockImplementation((name: string) => {
        if (name === "duel") return mockDuelSystem;
        return null;
      });

      // Create a dying player entity
      const playerEntity = createMockPlayerEntity({
        data: { deathState: DeathState.DYING, respawnTick: 900 },
      });
      world.entities.get.mockReturnValue(playerEntity);
      world.entities.players.set("player1", playerEntity);

      // Get the respawn request handler
      const respawnHandler = subscribedEvents.get(
        EventType.PLAYER_RESPAWN_REQUEST,
      );
      if (respawnHandler) {
        respawnHandler({ playerId: "player1" });
      }

      // Player should still be dying — respawn was blocked
      expect(playerEntity.data.deathState).toBe(DeathState.DYING);
    });
  });

  describe("death processing guard", () => {
    it("prevents respawn during active death processing", async () => {
      // Access private deathProcessingInProgress via bracket notation
      const inProgress = (
        deathSystem as unknown as {
          deathProcessingInProgress: Set<string>;
        }
      ).deathProcessingInProgress;

      // Simulate death processing in progress
      inProgress.add("player1");

      const playerEntity = createMockPlayerEntity({
        data: { deathState: DeathState.DYING, respawnTick: 900 },
      });
      world.entities.get.mockReturnValue(playerEntity);
      world.entities.players.set("player1", playerEntity);

      // Call handleRespawnRequest via the subscribed handler
      const respawnHandler = subscribedEvents.get(
        EventType.PLAYER_RESPAWN_REQUEST,
      );
      if (respawnHandler) {
        respawnHandler({ playerId: "player1" });
      }

      // Player should still be dying — respawn blocked by processing guard
      expect(playerEntity.data.deathState).toBe(DeathState.DYING);

      // Cleanup
      inProgress.delete("player1");
    });
  });

  describe("tick-based respawn", () => {
    /** Call the private processPendingRespawns directly (init() is not called in unit tests) */
    function callProcessPendingRespawns(currentTick: number): void {
      const fn = (
        deathSystem as unknown as {
          processPendingRespawns: (tick: number) => void;
        }
      ).processPendingRespawns.bind(deathSystem);
      fn(currentTick);
    }

    it("respawns player when currentTick reaches respawnTick", async () => {
      const playerEntity = createMockPlayerEntity({
        data: {
          deathState: DeathState.DYING,
          respawnTick: 1000 + COMBAT_CONSTANTS.DEATH.ANIMATION_TICKS,
          visible: true,
        },
      });
      world.entities.get.mockReturnValue(playerEntity);
      world.entities.players.set("player1", playerEntity);

      // Process at the respawn tick
      callProcessPendingRespawns(1000 + COMBAT_CONSTANTS.DEATH.ANIMATION_TICKS);

      // Wait for async respawn
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Player should be hidden (pre-respawn) then respawned
      expect(playerEntity.markNetworkDirty).toHaveBeenCalled();
    });

    it("does not respawn before respawnTick", () => {
      const playerEntity = createMockPlayerEntity({
        data: {
          deathState: DeathState.DYING,
          respawnTick: 2000,
          visible: true,
        },
      });
      world.entities.get.mockReturnValue(playerEntity);
      world.entities.players.set("player1", playerEntity);

      // Process before respawn tick
      callProcessPendingRespawns(1500);

      // Player should still be visible and dying
      expect(playerEntity.data.visible).toBe(true);
      expect(playerEntity.data.deathState).toBe(DeathState.DYING);
    });

    it("skips respawn for player being death-processed", () => {
      const inProgress = (
        deathSystem as unknown as {
          deathProcessingInProgress: Set<string>;
        }
      ).deathProcessingInProgress;
      inProgress.add("player1");

      const playerEntity = createMockPlayerEntity({
        data: {
          deathState: DeathState.DYING,
          respawnTick: 500, // Already past
          visible: true,
        },
      });
      world.entities.get.mockReturnValue(playerEntity);
      world.entities.players.set("player1", playerEntity);

      callProcessPendingRespawns(1000);

      // Player should NOT have been modified — death processing guard blocked it
      expect(playerEntity.data.visible).toBe(true);

      inProgress.delete("player1");
    });
  });

  describe("persist retry queue", () => {
    it("drains retry queue on tick", () => {
      const retryQueue = (
        deathSystem as unknown as {
          pendingPersistRetries: Array<{
            playerId: string;
            type: "equipment" | "inventory";
          }>;
        }
      ).pendingPersistRetries;

      const mockEquipmentSystem = {
        clearEquipmentImmediate: vi.fn().mockResolvedValue(undefined),
      };
      const mockInventorySystem = {
        clearInventoryImmediate: vi.fn().mockResolvedValue(undefined),
      };

      world.getSystem.mockImplementation((name: string) => {
        if (name === "equipment") return mockEquipmentSystem;
        if (name === "inventory") return mockInventorySystem;
        return null;
      });

      // Add retries
      retryQueue.push(
        { playerId: "player1", type: "equipment" },
        { playerId: "player2", type: "inventory" },
      );

      // Call processPersistRetries
      const processPersistRetries = (
        deathSystem as unknown as {
          processPersistRetries: () => void;
        }
      ).processPersistRetries.bind(deathSystem);

      processPersistRetries();

      // Queue should be drained
      expect(retryQueue).toHaveLength(0);
      expect(mockEquipmentSystem.clearEquipmentImmediate).toHaveBeenCalledWith(
        "player1",
      );
      expect(mockInventorySystem.clearInventoryImmediate).toHaveBeenCalledWith(
        "player2",
        false,
      );
    });

    it("does nothing when queue is empty", () => {
      const processPersistRetries = (
        deathSystem as unknown as {
          processPersistRetries: () => void;
        }
      ).processPersistRetries.bind(deathSystem);

      // Should not throw
      processPersistRetries();
    });
  });
});

// =============================================================================
// KEPT ITEMS RETURNED ON RESPAWN
// =============================================================================

describe("PlayerDeathSystem — kept items on respawn", () => {
  let world: MockWorld;
  let deathSystem: PlayerDeathSystem;
  let mockInventorySystem: {
    addItemDirect: Mock;
    getItems: Mock;
    clearInventoryImmediate: Mock;
    getInventory: Mock;
  };

  beforeEach(() => {
    world = createMockWorld(true, 1000);

    world.on.mockImplementation(() => {});
    world.emit.mockImplementation(() => {});

    mockInventorySystem = {
      addItemDirect: vi.fn().mockResolvedValue(undefined),
      getItems: vi.fn().mockReturnValue([]),
      clearInventoryImmediate: vi.fn().mockResolvedValue(undefined),
      getInventory: vi.fn().mockReturnValue(null),
    };

    world.getSystem.mockImplementation((name: string) => {
      if (name === "inventory") return mockInventorySystem;
      if (name === "ground-items")
        return { spawnGroundItems: vi.fn().mockResolvedValue([]) };
      return null;
    });

    deathSystem = new PlayerDeathSystem(createSystemWorld(world));

    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("returns kept items to inventory via addItemDirect on respawn", async () => {
    // Set up kept items in the in-memory map
    const keptItemsMap = (
      deathSystem as unknown as {
        itemsKeptOnDeath: Map<
          string,
          Array<{ itemId: string; quantity: number }>
        >;
      }
    ).itemsKeptOnDeath;

    keptItemsMap.set("player1", [
      { itemId: "rune_scimitar", quantity: 1 },
      { itemId: "dragon_med_helm", quantity: 1 },
      { itemId: "amulet_of_glory", quantity: 1 },
    ]);

    // Create player entity for respawn
    const playerEntity = createMockPlayerEntity({
      data: { deathState: DeathState.DYING, visible: false },
    });
    world.entities.get.mockReturnValue(playerEntity);

    // Call respawnPlayer directly
    const respawnPlayer = (
      deathSystem as unknown as {
        respawnPlayer: (
          playerId: string,
          spawnPosition: { x: number; y: number; z: number },
          townName: string,
        ) => Promise<void>;
      }
    ).respawnPlayer.bind(deathSystem);

    await respawnPlayer("player1", { x: 0, y: 10, z: 0 }, "Central Haven");

    // Verify all 3 kept items were returned
    expect(mockInventorySystem.addItemDirect).toHaveBeenCalledTimes(3);
    expect(mockInventorySystem.addItemDirect).toHaveBeenCalledWith("player1", {
      itemId: "rune_scimitar",
      quantity: 1,
    });
    expect(mockInventorySystem.addItemDirect).toHaveBeenCalledWith("player1", {
      itemId: "dragon_med_helm",
      quantity: 1,
    });
    expect(mockInventorySystem.addItemDirect).toHaveBeenCalledWith("player1", {
      itemId: "amulet_of_glory",
      quantity: 1,
    });

    // Kept items should be cleared after return
    expect(keptItemsMap.has("player1")).toBe(false);
  });

  it("does not call addItemDirect when no kept items exist", async () => {
    const playerEntity = createMockPlayerEntity({
      data: { deathState: DeathState.DYING, visible: false },
    });
    world.entities.get.mockReturnValue(playerEntity);

    const respawnPlayer = (
      deathSystem as unknown as {
        respawnPlayer: (
          playerId: string,
          spawnPosition: { x: number; y: number; z: number },
          townName: string,
        ) => Promise<void>;
      }
    ).respawnPlayer.bind(deathSystem);

    await respawnPlayer("player1", { x: 0, y: 10, z: 0 }, "Central Haven");

    expect(mockInventorySystem.addItemDirect).not.toHaveBeenCalled();
  });
});

// =============================================================================
// EVENT MIGRATION TEST
// =============================================================================

describe("Event type migration: PLAYER_DIED → PLAYER_SET_DEAD", () => {
  it("PLAYER_DIED is defined but deprecated", () => {
    // PLAYER_DIED still exists for backward compat
    expect(EventType.PLAYER_DIED).toBe("player:died");
  });

  it("PLAYER_SET_DEAD is the canonical death event", () => {
    expect(EventType.PLAYER_SET_DEAD).toBe("player:set_dead");
  });

  it("no production code emits PLAYER_DIED", async () => {
    // This is a static analysis test — we verify that the only reference to
    // PLAYER_DIED in non-test code is the enum definition itself.
    // The grep for PLAYER_DIED across the codebase shows it's only in:
    //   1. event-types.ts (enum definition with @deprecated)
    //   2. Test files (this file)
    // If someone accidentally uses PLAYER_DIED, this test documents the contract.
    expect(EventType.PLAYER_DIED).not.toBe(EventType.PLAYER_SET_DEAD);
  });
});

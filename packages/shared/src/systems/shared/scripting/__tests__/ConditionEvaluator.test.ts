import { describe, it, expect, vi, beforeEach } from "vitest";
import { ConditionRegistry } from "../ConditionEvaluator";
import type {
  ExecutionContext,
  ScriptingWorldInterface,
} from "../ScriptGraphInterpreter";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockWorld(
  overrides: Partial<ScriptingWorldInterface> = {},
): ScriptingWorldInterface {
  return {
    emit: vi.fn(),
    getEntityById: vi.fn().mockReturnValue(null),
    getTime: vi.fn().mockReturnValue(1000),
    ...overrides,
  };
}

function createContext(
  overrides: Partial<ExecutionContext> = {},
): ExecutionContext {
  return {
    triggerData: {},
    variables: new Map<string, unknown>(),
    entityId: "test-entity-1",
    world: createMockWorld(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ConditionRegistry", () => {
  let registry: ConditionRegistry;

  beforeEach(() => {
    registry = new ConditionRegistry();
  });

  // -------------------------------------------------------------------------
  // Registration
  // -------------------------------------------------------------------------

  describe("default evaluator registration", () => {
    it("has at least 25 default evaluators registered", () => {
      const types = registry.getRegisteredTypes();
      expect(types.length).toBeGreaterThanOrEqual(25);
    });

    it("includes all expected condition types", () => {
      const types = registry.getRegisteredTypes();
      const expected = [
        "condition/hasItem",
        "condition/questState",
        "condition/skillLevel",
        "condition/compareNumber",
        "condition/and",
        "condition/or",
        "condition/isInCombat",
        "condition/isAlive",
        "condition/healthCheck",
        "condition/hasEquipped",
        "condition/hasCoins",
        "condition/isInZone",
        "condition/isPrayerActive",
        "condition/not",
        "condition/random",
        "condition/compareString",
        "condition/entityType",
        "condition/entityExists",
        "condition/isPlayerInRange",
        "condition/hasQuestCompleted",
        "condition/timeOfDay",
        "condition/entityCount",
        "condition/isMobAlive",
        "condition/hasActiveBuff",
        "condition/variableExists",
      ];

      for (const type of expected) {
        expect(types).toContain(type);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Custom registration
  // -------------------------------------------------------------------------

  describe("custom evaluator registration", () => {
    it("registers and retrieves a custom evaluator", () => {
      const customEval = vi.fn().mockReturnValue(true);
      registry.register("condition/customCheck", customEval);

      const evaluator = registry.getEvaluator("condition/customCheck");
      expect(evaluator).toBe(customEval);
    });

    it("overwrites an existing evaluator when re-registered", () => {
      const replacement = vi.fn().mockReturnValue(false);
      registry.register("condition/hasItem", replacement);

      const evaluator = registry.getEvaluator("condition/hasItem");
      expect(evaluator).toBe(replacement);
    });
  });

  // -------------------------------------------------------------------------
  // getEvaluator
  // -------------------------------------------------------------------------

  describe("getEvaluator", () => {
    it("returns undefined for an unregistered type", () => {
      const evaluator = registry.getEvaluator("condition/nonexistent");
      expect(evaluator).toBeUndefined();
    });

    it("returns a function for a registered type", () => {
      const evaluator = registry.getEvaluator("condition/hasItem");
      expect(typeof evaluator).toBe("function");
    });
  });

  // -------------------------------------------------------------------------
  // condition/hasItem
  // -------------------------------------------------------------------------

  describe("condition/hasItem", () => {
    it("returns true when player has the item with sufficient quantity", () => {
      const world = createMockWorld({
        getEntityById: vi.fn().mockReturnValue({
          inventory: [
            { itemId: "bronze_sword", quantity: 3 },
            { itemId: "logs", quantity: 10 },
          ],
        }),
      });
      const ctx = createContext({
        world,
        triggerData: { playerId: "player-1" },
      });
      const evaluator = registry.getEvaluator("condition/hasItem")!;

      const result = evaluator({ itemId: "bronze_sword", quantity: 2 }, ctx);
      expect(result).toBe(true);
    });

    it("returns false when player has insufficient quantity", () => {
      const world = createMockWorld({
        getEntityById: vi.fn().mockReturnValue({
          inventory: [{ itemId: "bronze_sword", quantity: 1 }],
        }),
      });
      const ctx = createContext({
        world,
        triggerData: { playerId: "player-1" },
      });
      const evaluator = registry.getEvaluator("condition/hasItem")!;

      const result = evaluator({ itemId: "bronze_sword", quantity: 5 }, ctx);
      expect(result).toBe(false);
    });

    it("returns false when player does not have the item at all", () => {
      const world = createMockWorld({
        getEntityById: vi.fn().mockReturnValue({
          inventory: [{ itemId: "logs", quantity: 10 }],
        }),
      });
      const ctx = createContext({
        world,
        triggerData: { playerId: "player-1" },
      });
      const evaluator = registry.getEvaluator("condition/hasItem")!;

      const result = evaluator({ itemId: "dragon_scimitar" }, ctx);
      expect(result).toBe(false);
    });

    it("returns false when player entity does not exist", () => {
      const ctx = createContext({
        triggerData: { playerId: "player-missing" },
      });
      const evaluator = registry.getEvaluator("condition/hasItem")!;

      const result = evaluator({ itemId: "bronze_sword" }, ctx);
      expect(result).toBe(false);
    });

    it("returns false when itemId or playerId is missing", () => {
      const ctx = createContext();
      const evaluator = registry.getEvaluator("condition/hasItem")!;

      expect(evaluator({}, ctx)).toBe(false);
      expect(evaluator({ itemId: "sword" }, ctx)).toBe(false);
    });

    it("defaults required quantity to 1", () => {
      const world = createMockWorld({
        getEntityById: vi.fn().mockReturnValue({
          inventory: [{ itemId: "coins", quantity: 1 }],
        }),
      });
      const ctx = createContext({
        world,
        triggerData: { playerId: "player-1" },
      });
      const evaluator = registry.getEvaluator("condition/hasItem")!;

      const result = evaluator({ itemId: "coins" }, ctx);
      expect(result).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // condition/questState
  // -------------------------------------------------------------------------

  describe("condition/questState", () => {
    it("returns true when quest state matches expected state", () => {
      const world = createMockWorld({
        getEntityById: vi.fn().mockReturnValue({
          quests: {
            "dragon-slayer": { state: "in_progress" },
          },
        }),
      });
      const ctx = createContext({
        world,
        triggerData: { playerId: "player-1" },
      });
      const evaluator = registry.getEvaluator("condition/questState")!;

      const result = evaluator(
        { questId: "dragon-slayer", state: "in_progress" },
        ctx,
      );
      expect(result).toBe(true);
    });

    it("returns false when quest state does not match", () => {
      const world = createMockWorld({
        getEntityById: vi.fn().mockReturnValue({
          quests: {
            "dragon-slayer": { state: "completed" },
          },
        }),
      });
      const ctx = createContext({
        world,
        triggerData: { playerId: "player-1" },
      });
      const evaluator = registry.getEvaluator("condition/questState")!;

      const result = evaluator(
        { questId: "dragon-slayer", state: "in_progress" },
        ctx,
      );
      expect(result).toBe(false);
    });

    it('returns true for "not_started" when quest has no data', () => {
      const world = createMockWorld({
        getEntityById: vi.fn().mockReturnValue({
          quests: {},
        }),
      });
      const ctx = createContext({
        world,
        triggerData: { playerId: "player-1" },
      });
      const evaluator = registry.getEvaluator("condition/questState")!;

      const result = evaluator(
        { questId: "new-quest", state: "not_started" },
        ctx,
      );
      expect(result).toBe(true);
    });

    it("returns false when player does not exist", () => {
      const ctx = createContext({
        triggerData: { playerId: "player-missing" },
      });
      const evaluator = registry.getEvaluator("condition/questState")!;

      const result = evaluator(
        { questId: "some-quest", state: "in_progress" },
        ctx,
      );
      expect(result).toBe(false);
    });

    it("returns false when questId or state is missing", () => {
      const ctx = createContext({
        triggerData: { playerId: "player-1" },
      });
      const evaluator = registry.getEvaluator("condition/questState")!;

      expect(evaluator({ questId: "q1" }, ctx)).toBe(false);
      expect(evaluator({ state: "completed" }, ctx)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // condition/healthCheck
  // -------------------------------------------------------------------------

  describe("condition/healthCheck", () => {
    it('returns true when health is below threshold (default comparison "below")', () => {
      const world = createMockWorld({
        getEntityById: vi.fn().mockReturnValue({
          health: 20,
          maxHealth: 100,
        }),
      });
      const ctx = createContext({ world });
      const evaluator = registry.getEvaluator("condition/healthCheck")!;

      const result = evaluator({ entity: "test-entity-1", threshold: 50 }, ctx);
      expect(result).toBe(true);
    });

    it("returns false when health is above threshold with below comparison", () => {
      const world = createMockWorld({
        getEntityById: vi.fn().mockReturnValue({
          health: 80,
          maxHealth: 100,
        }),
      });
      const ctx = createContext({ world });
      const evaluator = registry.getEvaluator("condition/healthCheck")!;

      const result = evaluator(
        { entity: "test-entity-1", threshold: 50, comparison: "below" },
        ctx,
      );
      expect(result).toBe(false);
    });

    it('returns true when health is at or above threshold with "above" comparison', () => {
      const world = createMockWorld({
        getEntityById: vi.fn().mockReturnValue({
          health: 75,
          maxHealth: 100,
        }),
      });
      const ctx = createContext({ world });
      const evaluator = registry.getEvaluator("condition/healthCheck")!;

      const result = evaluator(
        { entity: "test-entity-1", threshold: 75, comparison: "above" },
        ctx,
      );
      expect(result).toBe(true);
    });

    it("uses hp/maxHp fallback fields", () => {
      const world = createMockWorld({
        getEntityById: vi.fn().mockReturnValue({
          hp: 10,
          maxHp: 50,
        }),
      });
      const ctx = createContext({ world });
      const evaluator = registry.getEvaluator("condition/healthCheck")!;

      // 10/50 = 20%, threshold defaults to 50
      const result = evaluator({ entity: "test-entity-1" }, ctx);
      expect(result).toBe(true); // 20% < 50%
    });

    it("returns false when entity does not exist", () => {
      const ctx = createContext();
      const evaluator = registry.getEvaluator("condition/healthCheck")!;

      const result = evaluator({ entity: "nonexistent" }, ctx);
      expect(result).toBe(false);
    });

    it("falls back to ctx.entityId when entity is not specified in data", () => {
      const world = createMockWorld({
        getEntityById: vi.fn().mockReturnValue({
          health: 30,
          maxHealth: 100,
        }),
      });
      const ctx = createContext({ world, entityId: "my-entity" });
      const evaluator = registry.getEvaluator("condition/healthCheck")!;

      const result = evaluator({ threshold: 50 }, ctx);
      expect(result).toBe(true); // 30% < 50%
      expect(world.getEntityById).toHaveBeenCalledWith("my-entity");
    });
  });

  // -------------------------------------------------------------------------
  // condition/compareNumber
  // -------------------------------------------------------------------------

  describe("condition/compareNumber", () => {
    it("compares variable value with == operator", () => {
      const variables = new Map<string, unknown>([["score", 42]]);
      const ctx = createContext({ variables });
      const evaluator = registry.getEvaluator("condition/compareNumber")!;

      expect(
        evaluator({ variable: "score", operator: "==", value: 42 }, ctx),
      ).toBe(true);
      expect(
        evaluator({ variable: "score", operator: "==", value: 43 }, ctx),
      ).toBe(false);
    });

    it("compares with != operator", () => {
      const variables = new Map<string, unknown>([["score", 10]]);
      const ctx = createContext({ variables });
      const evaluator = registry.getEvaluator("condition/compareNumber")!;

      expect(
        evaluator({ variable: "score", operator: "!=", value: 5 }, ctx),
      ).toBe(true);
      expect(
        evaluator({ variable: "score", operator: "!=", value: 10 }, ctx),
      ).toBe(false);
    });

    it("compares with > operator", () => {
      const variables = new Map<string, unknown>([["score", 10]]);
      const ctx = createContext({ variables });
      const evaluator = registry.getEvaluator("condition/compareNumber")!;

      expect(
        evaluator({ variable: "score", operator: ">", value: 5 }, ctx),
      ).toBe(true);
      expect(
        evaluator({ variable: "score", operator: ">", value: 10 }, ctx),
      ).toBe(false);
    });

    it("compares with >= operator", () => {
      const variables = new Map<string, unknown>([["score", 10]]);
      const ctx = createContext({ variables });
      const evaluator = registry.getEvaluator("condition/compareNumber")!;

      expect(
        evaluator({ variable: "score", operator: ">=", value: 10 }, ctx),
      ).toBe(true);
      expect(
        evaluator({ variable: "score", operator: ">=", value: 11 }, ctx),
      ).toBe(false);
    });

    it("compares with < operator", () => {
      const variables = new Map<string, unknown>([["score", 3]]);
      const ctx = createContext({ variables });
      const evaluator = registry.getEvaluator("condition/compareNumber")!;

      expect(
        evaluator({ variable: "score", operator: "<", value: 5 }, ctx),
      ).toBe(true);
      expect(
        evaluator({ variable: "score", operator: "<", value: 3 }, ctx),
      ).toBe(false);
    });

    it("compares with <= operator", () => {
      const variables = new Map<string, unknown>([["score", 5]]);
      const ctx = createContext({ variables });
      const evaluator = registry.getEvaluator("condition/compareNumber")!;

      expect(
        evaluator({ variable: "score", operator: "<=", value: 5 }, ctx),
      ).toBe(true);
      expect(
        evaluator({ variable: "score", operator: "<=", value: 4 }, ctx),
      ).toBe(false);
    });

    it("defaults to 0 when variable is not set", () => {
      const ctx = createContext();
      const evaluator = registry.getEvaluator("condition/compareNumber")!;

      expect(
        evaluator({ variable: "missing", operator: "==", value: 0 }, ctx),
      ).toBe(true);
    });

    it("defaults operator to == when not specified", () => {
      const variables = new Map<string, unknown>([["x", 7]]);
      const ctx = createContext({ variables });
      const evaluator = registry.getEvaluator("condition/compareNumber")!;

      expect(evaluator({ variable: "x", value: 7 }, ctx)).toBe(true);
    });

    it("returns false for unknown operator", () => {
      const variables = new Map<string, unknown>([["x", 5]]);
      const ctx = createContext({ variables });
      const evaluator = registry.getEvaluator("condition/compareNumber")!;

      expect(evaluator({ variable: "x", operator: "???", value: 5 }, ctx)).toBe(
        false,
      );
    });

    it("uses leftValue fallback when variable is not specified", () => {
      const ctx = createContext();
      const evaluator = registry.getEvaluator("condition/compareNumber")!;

      expect(evaluator({ leftValue: 10, operator: ">", value: 5 }, ctx)).toBe(
        true,
      );
    });
  });

  // -------------------------------------------------------------------------
  // condition/skillLevel
  // -------------------------------------------------------------------------

  describe("condition/skillLevel", () => {
    it("returns true when skill level meets minimum", () => {
      const world = createMockWorld({
        getEntityById: vi.fn().mockReturnValue({
          skills: {
            mining: { level: 45 },
            woodcutting: { level: 30 },
          },
        }),
      });
      const ctx = createContext({
        world,
        triggerData: { playerId: "player-1" },
      });
      const evaluator = registry.getEvaluator("condition/skillLevel")!;

      const result = evaluator({ skillId: "mining", minLevel: 40 }, ctx);
      expect(result).toBe(true);
    });

    it("returns false when skill level is below minimum", () => {
      const world = createMockWorld({
        getEntityById: vi.fn().mockReturnValue({
          skills: {
            mining: { level: 10 },
          },
        }),
      });
      const ctx = createContext({
        world,
        triggerData: { playerId: "player-1" },
      });
      const evaluator = registry.getEvaluator("condition/skillLevel")!;

      const result = evaluator({ skillId: "mining", minLevel: 20 }, ctx);
      expect(result).toBe(false);
    });

    it("returns false when skill is not found on player", () => {
      const world = createMockWorld({
        getEntityById: vi.fn().mockReturnValue({
          skills: {},
        }),
      });
      const ctx = createContext({
        world,
        triggerData: { playerId: "player-1" },
      });
      const evaluator = registry.getEvaluator("condition/skillLevel")!;

      const result = evaluator({ skillId: "herblore", minLevel: 5 }, ctx);
      expect(result).toBe(false);
    });

    it("returns false when player entity does not exist", () => {
      const ctx = createContext({
        triggerData: { playerId: "nonexistent" },
      });
      const evaluator = registry.getEvaluator("condition/skillLevel")!;

      const result = evaluator({ skillId: "mining", minLevel: 1 }, ctx);
      expect(result).toBe(false);
    });

    it("defaults minLevel to 1", () => {
      const world = createMockWorld({
        getEntityById: vi.fn().mockReturnValue({
          skills: {
            attack: { level: 1 },
          },
        }),
      });
      const ctx = createContext({
        world,
        triggerData: { playerId: "player-1" },
      });
      const evaluator = registry.getEvaluator("condition/skillLevel")!;

      const result = evaluator({ skillId: "attack" }, ctx);
      expect(result).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // condition/isInCombat
  // -------------------------------------------------------------------------

  describe("condition/isInCombat", () => {
    it("returns true when entity has inCombat flag set", () => {
      const world = createMockWorld({
        getEntityById: vi.fn().mockReturnValue({
          inCombat: true,
        }),
      });
      const ctx = createContext({ world });
      const evaluator = registry.getEvaluator("condition/isInCombat")!;

      const result = evaluator({ entity: "test-entity-1" }, ctx);
      expect(result).toBe(true);
    });

    it("returns true when entity has combatTarget set and inCombat is absent", () => {
      const world = createMockWorld({
        getEntityById: vi.fn().mockReturnValue({
          combatTarget: "mob-5",
        }),
      });
      const ctx = createContext({ world });
      const evaluator = registry.getEvaluator("condition/isInCombat")!;

      const result = evaluator({ entity: "test-entity-1" }, ctx);
      expect(result).toBe(true);
    });

    it("returns false when inCombat is explicitly false (nullish coalescing does not fall through)", () => {
      const world = createMockWorld({
        getEntityById: vi.fn().mockReturnValue({
          inCombat: false,
          combatTarget: "mob-5",
        }),
      });
      const ctx = createContext({ world });
      const evaluator = registry.getEvaluator("condition/isInCombat")!;

      // ?? treats false as non-nullish, so combatTarget is not checked
      const result = evaluator({ entity: "test-entity-1" }, ctx);
      expect(result).toBe(false);
    });

    it("returns false when entity is not in combat", () => {
      const world = createMockWorld({
        getEntityById: vi.fn().mockReturnValue({
          inCombat: false,
          combatTarget: null,
        }),
      });
      const ctx = createContext({ world });
      const evaluator = registry.getEvaluator("condition/isInCombat")!;

      const result = evaluator({ entity: "test-entity-1" }, ctx);
      expect(result).toBe(false);
    });

    it("returns false when entity does not exist", () => {
      const ctx = createContext();
      const evaluator = registry.getEvaluator("condition/isInCombat")!;

      const result = evaluator({ entity: "nonexistent" }, ctx);
      expect(result).toBe(false);
    });

    it("falls back to ctx.entityId when entity is not specified", () => {
      const world = createMockWorld({
        getEntityById: vi.fn().mockReturnValue({
          inCombat: true,
        }),
      });
      const ctx = createContext({ world, entityId: "fallback-entity" });
      const evaluator = registry.getEvaluator("condition/isInCombat")!;

      const result = evaluator({}, ctx);
      expect(result).toBe(true);
      expect(world.getEntityById).toHaveBeenCalledWith("fallback-entity");
    });
  });

  // -------------------------------------------------------------------------
  // condition/entityExists
  // -------------------------------------------------------------------------

  describe("condition/entityExists", () => {
    it("returns true when entity exists in the world", () => {
      const world = createMockWorld({
        getEntityById: vi.fn().mockReturnValue({ id: "mob-1" }),
      });
      const ctx = createContext({ world });
      const evaluator = registry.getEvaluator("condition/entityExists")!;

      const result = evaluator({ entityId: "mob-1" }, ctx);
      expect(result).toBe(true);
    });

    it("returns false when entity does not exist", () => {
      const ctx = createContext();
      const evaluator = registry.getEvaluator("condition/entityExists")!;

      const result = evaluator({ entityId: "nonexistent" }, ctx);
      expect(result).toBe(false);
    });

    it("falls back to triggerData.entityId", () => {
      const world = createMockWorld({
        getEntityById: vi.fn().mockReturnValue({ id: "trigger-entity" }),
      });
      const ctx = createContext({
        world,
        triggerData: { entityId: "trigger-entity" },
      });
      const evaluator = registry.getEvaluator("condition/entityExists")!;

      const result = evaluator({}, ctx);
      expect(result).toBe(true);
      expect(world.getEntityById).toHaveBeenCalledWith("trigger-entity");
    });

    it("returns false when no entityId is available at all", () => {
      const ctx = createContext();
      const evaluator = registry.getEvaluator("condition/entityExists")!;

      const result = evaluator({}, ctx);
      expect(result).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // condition/variableExists
  // -------------------------------------------------------------------------

  describe("condition/variableExists", () => {
    it("returns true when variable is set in context", () => {
      const variables = new Map<string, unknown>([["questProgress", 3]]);
      const ctx = createContext({ variables });
      const evaluator = registry.getEvaluator("condition/variableExists")!;

      const result = evaluator({ variableName: "questProgress" }, ctx);
      expect(result).toBe(true);
    });

    it("returns false when variable is not set", () => {
      const ctx = createContext();
      const evaluator = registry.getEvaluator("condition/variableExists")!;

      const result = evaluator({ variableName: "missing" }, ctx);
      expect(result).toBe(false);
    });

    it("returns false when variableName is missing from data", () => {
      const ctx = createContext();
      const evaluator = registry.getEvaluator("condition/variableExists")!;

      const result = evaluator({}, ctx);
      expect(result).toBe(false);
    });

    it("returns true even when variable value is falsy (0, empty string, null)", () => {
      const variables = new Map<string, unknown>([
        ["zeroVal", 0],
        ["emptyStr", ""],
        ["nullVal", null],
      ]);
      const ctx = createContext({ variables });
      const evaluator = registry.getEvaluator("condition/variableExists")!;

      expect(evaluator({ variableName: "zeroVal" }, ctx)).toBe(true);
      expect(evaluator({ variableName: "emptyStr" }, ctx)).toBe(true);
      expect(evaluator({ variableName: "nullVal" }, ctx)).toBe(true);
    });
  });
});

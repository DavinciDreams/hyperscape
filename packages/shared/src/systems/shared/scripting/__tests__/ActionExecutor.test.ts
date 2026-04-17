import { describe, it, expect, vi, beforeEach } from "vitest";
import { ActionExecutor } from "../ActionExecutor";
import type {
  ExecutionContext,
  ScriptingWorldInterface,
} from "../ScriptGraphInterpreter";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockWorld(): ScriptingWorldInterface {
  return {
    emit: vi.fn(),
    getEntityById: vi.fn().mockReturnValue(null),
    getTime: vi.fn().mockReturnValue(1000),
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

describe("ActionExecutor", () => {
  let executor: ActionExecutor;

  beforeEach(() => {
    executor = new ActionExecutor();
  });

  // -------------------------------------------------------------------------
  // Registration
  // -------------------------------------------------------------------------

  describe("default handler registration", () => {
    it("has at least 48 default handlers registered", () => {
      const types = executor.getRegisteredTypes();
      expect(types.length).toBeGreaterThanOrEqual(48);
    });

    it("includes all expected action types", () => {
      const types = executor.getRegisteredTypes();
      const expected = [
        "action/spawnMob",
        "action/despawnEntity",
        "action/teleportPlayer",
        "action/showDialogue",
        "action/startQuest",
        "action/playSound",
        "action/setVariable",
        "action/giveItem",
        "action/startCombat",
        "action/stopCombat",
        "action/dealDamage",
        "action/healEntity",
        "action/removeItem",
        "action/equipItem",
        "action/spawnItem",
        "action/giveXP",
        "action/giveCoins",
        "action/spawnNPC",
        "action/moveEntity",
        "action/setEntityProperty",
        "action/openShop",
        "action/openBank",
        "action/showNotification",
        "action/sendChat",
        "action/startDialogueTree",
        "action/progressQuest",
        "action/completeQuest",
        "action/activatePrayer",
        "action/deactivatePrayer",
        "action/playMusic",
        "action/stopMusic",
        "action/spawnParticle",
        "action/incrementVariable",
        "action/getEntityProperty",
        "action/playAnimation",
        "action/setMovementSpeed",
        "action/lockMovement",
        "action/unlockMovement",
        "action/applyBuff",
        "action/removeBuff",
        "action/setAggroRange",
        "action/setRespawnTime",
        "action/setDialogueOverride",
        "action/dropItem",
        "action/despawnAllInRadius",
        "action/log",
        "action/emitCustomEvent",
        "action/wait",
      ];

      for (const type of expected) {
        expect(types).toContain(type);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Custom registration
  // -------------------------------------------------------------------------

  describe("custom handler registration", () => {
    it("registers and retrieves a custom handler", () => {
      const customHandler = vi.fn();
      executor.register("action/customAction", customHandler);

      const handler = executor.getHandler("action/customAction");
      expect(handler).toBe(customHandler);
    });

    it("overwrites an existing handler when re-registered", () => {
      const replacement = vi.fn();
      executor.register("action/spawnMob", replacement);

      const handler = executor.getHandler("action/spawnMob");
      expect(handler).toBe(replacement);
    });
  });

  // -------------------------------------------------------------------------
  // getHandler
  // -------------------------------------------------------------------------

  describe("getHandler", () => {
    it("returns undefined for an unregistered type", () => {
      const handler = executor.getHandler("action/nonexistent");
      expect(handler).toBeUndefined();
    });

    it("returns a function for a registered type", () => {
      const handler = executor.getHandler("action/spawnMob");
      expect(typeof handler).toBe("function");
    });
  });

  // -------------------------------------------------------------------------
  // Action handler emit tests
  // -------------------------------------------------------------------------

  describe("action/spawnMob", () => {
    it('emits "mob_npc:spawn_request" with correct data', () => {
      const ctx = createContext();
      const handler = executor.getHandler("action/spawnMob")!;

      handler(
        {
          mobType: "goblin",
          position: { x: 10, y: 0, z: 5 },
          count: 3,
          level: 5,
        },
        ctx,
      );

      expect(ctx.world.emit).toHaveBeenCalledWith("mob_npc:spawn_request", {
        mobType: "goblin",
        position: { x: 10, y: 0, z: 5 },
        count: 3,
        level: 5,
        sourceEntityId: "test-entity-1",
      });
    });

    it("defaults count to 1 and level to 1 when not provided", () => {
      const ctx = createContext();
      const handler = executor.getHandler("action/spawnMob")!;

      handler({ mobType: "rat" }, ctx);

      expect(ctx.world.emit).toHaveBeenCalledWith(
        "mob_npc:spawn_request",
        expect.objectContaining({ count: 1, level: 1 }),
      );
    });
  });

  describe("action/despawnEntity", () => {
    it('emits "entity:remove" with the target entity id', () => {
      const ctx = createContext();
      const handler = executor.getHandler("action/despawnEntity")!;

      handler({ entityId: "mob-42" }, ctx);

      expect(ctx.world.emit).toHaveBeenCalledWith("entity:remove", {
        entityId: "mob-42",
        sourceEntityId: "test-entity-1",
      });
    });

    it("falls back to triggerData.entityId when data.entityId is absent", () => {
      const ctx = createContext({
        triggerData: { entityId: "trigger-mob-7" },
      });
      const handler = executor.getHandler("action/despawnEntity")!;

      handler({}, ctx);

      expect(ctx.world.emit).toHaveBeenCalledWith("entity:remove", {
        entityId: "trigger-mob-7",
        sourceEntityId: "test-entity-1",
      });
    });

    it("does not emit when no entityId is available", () => {
      const ctx = createContext();
      const handler = executor.getHandler("action/despawnEntity")!;

      handler({}, ctx);

      expect(ctx.world.emit).not.toHaveBeenCalled();
    });
  });

  describe("action/teleportPlayer", () => {
    it('emits "player:teleport_request" with position', () => {
      const ctx = createContext();
      const handler = executor.getHandler("action/teleportPlayer")!;
      const position = { x: 100, y: 0, z: 200 };

      handler({ playerId: "player-1", position }, ctx);

      expect(ctx.world.emit).toHaveBeenCalledWith("player:teleport_request", {
        playerId: "player-1",
        position,
        suppressEffect: false,
      });
    });

    it("falls back to triggerData.playerId", () => {
      const ctx = createContext({
        triggerData: { playerId: "player-from-trigger" },
      });
      const handler = executor.getHandler("action/teleportPlayer")!;
      const position = { x: 50, y: 0, z: 50 };

      handler({ position }, ctx);

      expect(ctx.world.emit).toHaveBeenCalledWith("player:teleport_request", {
        playerId: "player-from-trigger",
        position,
        suppressEffect: false,
      });
    });

    it("does not emit when position is missing", () => {
      const ctx = createContext();
      const handler = executor.getHandler("action/teleportPlayer")!;

      handler({ playerId: "player-1" }, ctx);

      expect(ctx.world.emit).not.toHaveBeenCalled();
    });
  });

  describe("action/showDialogue", () => {
    it('emits "dialogue:start" with dialogue data', () => {
      const ctx = createContext({
        triggerData: { playerId: "player-1" },
      });
      const handler = executor.getHandler("action/showDialogue")!;

      handler(
        { title: "Hello", text: "Welcome adventurer!", npcId: "npc-99" },
        ctx,
      );

      expect(ctx.world.emit).toHaveBeenCalledWith("dialogue:start", {
        playerId: "player-1",
        title: "Hello",
        text: "Welcome adventurer!",
        npcId: "npc-99",
        sourceEntityId: "test-entity-1",
      });
    });

    it("falls back to ctx.entityId for npcId when not provided", () => {
      const ctx = createContext({
        triggerData: { playerId: "player-1" },
      });
      const handler = executor.getHandler("action/showDialogue")!;

      handler({ title: "Hi", text: "Greetings." }, ctx);

      expect(ctx.world.emit).toHaveBeenCalledWith(
        "dialogue:start",
        expect.objectContaining({ npcId: "test-entity-1" }),
      );
    });
  });

  describe("action/startQuest", () => {
    it('emits "quest:started" with quest id and player id', () => {
      const ctx = createContext({
        triggerData: { playerId: "player-1" },
      });
      const handler = executor.getHandler("action/startQuest")!;

      handler({ questId: "quest-dragon-slayer" }, ctx);

      expect(ctx.world.emit).toHaveBeenCalledWith("quest:started", {
        playerId: "player-1",
        questId: "quest-dragon-slayer",
        sourceEntityId: "test-entity-1",
      });
    });
  });

  describe("action/giveItem", () => {
    it('emits "inventory:item_added" with item data', () => {
      const ctx = createContext({
        triggerData: { playerId: "player-1" },
      });
      const handler = executor.getHandler("action/giveItem")!;

      handler({ itemId: "bronze_sword", quantity: 2 }, ctx);

      expect(ctx.world.emit).toHaveBeenCalledWith("inventory:item_added", {
        playerId: "player-1",
        itemId: "bronze_sword",
        quantity: 2,
        sourceEntityId: "test-entity-1",
      });
    });

    it("defaults quantity to 1", () => {
      const ctx = createContext({
        triggerData: { playerId: "player-1" },
      });
      const handler = executor.getHandler("action/giveItem")!;

      handler({ itemId: "coins" }, ctx);

      expect(ctx.world.emit).toHaveBeenCalledWith(
        "inventory:item_added",
        expect.objectContaining({ quantity: 1 }),
      );
    });
  });

  describe("action/dealDamage", () => {
    it('emits "entity:damaged" with damage data', () => {
      const ctx = createContext();
      const handler = executor.getHandler("action/dealDamage")!;

      handler({ target: "mob-10", damage: 25, damageType: "magic" }, ctx);

      expect(ctx.world.emit).toHaveBeenCalledWith("entity:damaged", {
        entityId: "mob-10",
        damage: 25,
        damageType: "magic",
        sourceEntityId: "test-entity-1",
      });
    });

    it("defaults damage to 0 and damageType to melee", () => {
      const ctx = createContext();
      const handler = executor.getHandler("action/dealDamage")!;

      handler({ target: "mob-10" }, ctx);

      expect(ctx.world.emit).toHaveBeenCalledWith("entity:damaged", {
        entityId: "mob-10",
        damage: 0,
        damageType: "melee",
        sourceEntityId: "test-entity-1",
      });
    });

    it("does not emit when no target is available", () => {
      const ctx = createContext();
      const handler = executor.getHandler("action/dealDamage")!;

      handler({}, ctx);

      expect(ctx.world.emit).not.toHaveBeenCalled();
    });
  });

  describe("action/healEntity", () => {
    it('emits "combat:heal" with healing data', () => {
      const ctx = createContext();
      const handler = executor.getHandler("action/healEntity")!;

      handler({ entity: "player-1", amount: 30, percentage: 0 }, ctx);

      expect(ctx.world.emit).toHaveBeenCalledWith("combat:heal", {
        entityId: "player-1",
        amount: 30,
        percentage: 0,
        sourceEntityId: "test-entity-1",
      });
    });

    it("falls back to ctx.entityId when no entity specified", () => {
      const ctx = createContext();
      const handler = executor.getHandler("action/healEntity")!;

      handler({ amount: 10 }, ctx);

      expect(ctx.world.emit).toHaveBeenCalledWith("combat:heal", {
        entityId: "test-entity-1",
        amount: 10,
        percentage: 0,
        sourceEntityId: "test-entity-1",
      });
    });
  });

  describe("action/giveXP", () => {
    it('emits "skills:xp_gained" with skill and amount', () => {
      const ctx = createContext({
        triggerData: { playerId: "player-1" },
      });
      const handler = executor.getHandler("action/giveXP")!;

      handler({ skillId: "mining", amount: 50 }, ctx);

      expect(ctx.world.emit).toHaveBeenCalledWith("skills:xp_gained", {
        playerId: "player-1",
        skillId: "mining",
        amount: 50,
      });
    });

    it("uses data.player over triggerData.playerId when provided", () => {
      const ctx = createContext({
        triggerData: { playerId: "player-fallback" },
      });
      const handler = executor.getHandler("action/giveXP")!;

      handler(
        { player: "player-explicit", skillId: "attack", amount: 100 },
        ctx,
      );

      expect(ctx.world.emit).toHaveBeenCalledWith("skills:xp_gained", {
        playerId: "player-explicit",
        skillId: "attack",
        amount: 100,
      });
    });

    it("does not emit when no player is available", () => {
      const ctx = createContext();
      const handler = executor.getHandler("action/giveXP")!;

      handler({ skillId: "mining", amount: 10 }, ctx);

      expect(ctx.world.emit).not.toHaveBeenCalled();
    });
  });

  describe("action/giveCoins", () => {
    it('emits "inventory:add_coins" with amount', () => {
      const ctx = createContext({
        triggerData: { playerId: "player-1" },
      });
      const handler = executor.getHandler("action/giveCoins")!;

      handler({ amount: 500 }, ctx);

      expect(ctx.world.emit).toHaveBeenCalledWith("inventory:add_coins", {
        playerId: "player-1",
        amount: 500,
      });
    });

    it("does not emit when no player is available", () => {
      const ctx = createContext();
      const handler = executor.getHandler("action/giveCoins")!;

      handler({ amount: 100 }, ctx);

      expect(ctx.world.emit).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // String sanitization (Phase 5.5)
  // -------------------------------------------------------------------------

  describe("string sanitization", () => {
    it("strips C0 control characters from chat messages", () => {
      const ctx = createContext();
      const handler = executor.getHandler("action/sendChat")!;

      handler(
        {
          message: "hello\x00\x01\x02world\x07\x1b",
          sender: "Bob\x00",
        },
        ctx,
      );

      const emitMock = ctx.world.emit as unknown as ReturnType<typeof vi.fn>;
      const [event, payload] = emitMock.mock.calls[0];
      expect(event).toBe("chat:message");
      expect(payload.message).toBe("helloworld");
      expect(payload.sender).toBe("Bob");
    });

    it("preserves tabs, newlines, and carriage returns", () => {
      const ctx = createContext();
      const handler = executor.getHandler("action/sendChat")!;

      handler({ message: "hi\tthere\nfriend\r" }, ctx);

      const emitMock = ctx.world.emit as unknown as ReturnType<typeof vi.fn>;
      const payload = emitMock.mock.calls[0][1];
      expect(payload.message).toBe("hi\tthere\nfriend\r");
    });

    it("caps chat length at 500 characters", () => {
      const ctx = createContext();
      const handler = executor.getHandler("action/sendChat")!;
      const long = "a".repeat(1000);

      handler({ message: long }, ctx);

      const emitMock = ctx.world.emit as unknown as ReturnType<typeof vi.fn>;
      const payload = emitMock.mock.calls[0][1];
      expect(payload.message).toHaveLength(500);
    });

    it("sanitizes dialogue title and text", () => {
      const ctx = createContext({
        triggerData: { playerId: "p1" },
      });
      const handler = executor.getHandler("action/showDialogue")!;

      handler(
        {
          title: "Evil\x00Title",
          text: "Body\x07\x1fcontent",
        },
        ctx,
      );

      const emitMock = ctx.world.emit as unknown as ReturnType<typeof vi.fn>;
      const payload = emitMock.mock.calls[0][1];
      expect(payload.title).toBe("EvilTitle");
      expect(payload.text).toBe("Bodycontent");
    });

    it("sanitizes notification messages", () => {
      const ctx = createContext();
      const handler = executor.getHandler("action/showNotification")!;

      handler(
        {
          player: "p1",
          message: "toast\x00\x01body",
        },
        ctx,
      );

      const emitMock = ctx.world.emit as unknown as ReturnType<typeof vi.fn>;
      const payload = emitMock.mock.calls[0][1];
      expect(payload.message).toBe("toastbody");
    });

    it("returns an empty string for non-string message input", () => {
      const ctx = createContext();
      const handler = executor.getHandler("action/sendChat")!;

      handler({ message: 12345 as unknown as string }, ctx);

      const emitMock = ctx.world.emit as unknown as ReturnType<typeof vi.fn>;
      const payload = emitMock.mock.calls[0][1];
      expect(payload.message).toBe("");
    });
  });

  // -------------------------------------------------------------------------
  // Phase 3.4 — Debug nodes
  // -------------------------------------------------------------------------

  describe("action/log", () => {
    it("writes the message to console.log without throwing", () => {
      const ctx = createContext();
      const handler = executor.getHandler("action/log")!;
      const spy = vi.spyOn(console, "log").mockImplementation(() => {});

      handler({ message: "hello world", value: 42 }, ctx);

      expect(spy).toHaveBeenCalledOnce();
      const firstArg = spy.mock.calls[0][0] as string;
      expect(firstArg).toContain("hello world");
      spy.mockRestore();
    });

    it("falls back to an empty message when missing", () => {
      const ctx = createContext();
      const handler = executor.getHandler("action/log")!;
      const spy = vi.spyOn(console, "log").mockImplementation(() => {});

      expect(() => handler({}, ctx)).not.toThrow();
      expect(spy).toHaveBeenCalledOnce();
      spy.mockRestore();
    });
  });

  describe("action/emitCustomEvent", () => {
    it("emits the requested event name with the given payload", () => {
      const ctx = createContext();
      const handler = executor.getHandler("action/emitCustomEvent")!;

      handler({ eventName: "boss:phase2", payload: { stage: 2 } }, ctx);

      const emit = ctx.world.emit as unknown as ReturnType<typeof vi.fn>;
      const call = emit.mock.calls.find((c) => c[0] === "boss:phase2");
      expect(call).toBeDefined();
      expect(call![1]).toMatchObject({ stage: 2, entityId: "test-entity-1" });
    });

    it("ignores non-object payloads and still emits with entityId", () => {
      const ctx = createContext();
      const handler = executor.getHandler("action/emitCustomEvent")!;

      handler({ eventName: "signal:fire", payload: "not-an-object" }, ctx);

      const emit = ctx.world.emit as unknown as ReturnType<typeof vi.fn>;
      const call = emit.mock.calls.find((c) => c[0] === "signal:fire");
      expect(call).toBeDefined();
      expect(call![1]).toEqual({ entityId: "test-entity-1" });
    });
  });

  describe("action/debugDraw", () => {
    it("emits scripting:debug_draw with shape metadata", () => {
      const ctx = createContext();
      const handler = executor.getHandler("action/debugDraw")!;

      handler(
        {
          shape: "sphere",
          position: { x: 1, y: 2, z: 3 },
          color: "#ff0000",
          durationMs: 500,
        },
        ctx,
      );

      const emit = ctx.world.emit as unknown as ReturnType<typeof vi.fn>;
      const call = emit.mock.calls.find((c) => c[0] === "scripting:debug_draw");
      expect(call).toBeDefined();
    });
  });

  describe("action/breakpoint", () => {
    it("emits a debugger event and does not throw", () => {
      const ctx = createContext();
      const handler = executor.getHandler("action/breakpoint")!;

      expect(() => handler({ label: "boss-enrage" }, ctx)).not.toThrow();

      const emit = ctx.world.emit as unknown as ReturnType<typeof vi.fn>;
      const anyEmit = emit.mock.calls.find(
        (c) =>
          typeof c[0] === "string" &&
          ((c[0] as string).includes("break") ||
            (c[0] as string).includes("debug")),
      );
      expect(anyEmit).toBeDefined();
    });
  });
});

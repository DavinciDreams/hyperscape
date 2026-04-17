import { describe, it, expect, beforeEach } from "vitest";
import {
  TriggerEvaluator,
  DEFAULT_TRIGGER_MAPPINGS,
} from "../TriggerEvaluator";
import type { RuntimeScriptNode } from "../ScriptGraphInterpreter";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTriggerNode(
  type: string,
  data: Record<string, unknown> = {},
): RuntimeScriptNode {
  return {
    id: `node-${Math.random().toString(36).slice(2, 8)}`,
    type,
    data,
    inputs: [],
    outputs: [],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TriggerEvaluator", () => {
  let evaluator: TriggerEvaluator;

  beforeEach(() => {
    evaluator = new TriggerEvaluator();
  });

  // -------------------------------------------------------------------------
  // DEFAULT_TRIGGER_MAPPINGS
  // -------------------------------------------------------------------------

  describe("DEFAULT_TRIGGER_MAPPINGS", () => {
    it("has at least 50 entries", () => {
      expect(DEFAULT_TRIGGER_MAPPINGS.length).toBeGreaterThanOrEqual(50);
    });

    it("every mapping has triggerType, eventNames, and extractData", () => {
      for (const mapping of DEFAULT_TRIGGER_MAPPINGS) {
        expect(typeof mapping.triggerType).toBe("string");
        expect(Array.isArray(mapping.eventNames)).toBe(true);
        expect(typeof mapping.extractData).toBe("function");
      }
    });

    it("all triggerType values are unique", () => {
      const types = DEFAULT_TRIGGER_MAPPINGS.map((m) => m.triggerType);
      const uniqueTypes = new Set(types);
      expect(uniqueTypes.size).toBe(types.length);
    });
  });

  // -------------------------------------------------------------------------
  // getSubscribedEvents
  // -------------------------------------------------------------------------

  describe("getSubscribedEvents", () => {
    it("returns unique event names from all mappings", () => {
      const events = evaluator.getSubscribedEvents();
      expect(events.length).toBeGreaterThan(0);

      // Should be unique
      const unique = new Set(events);
      expect(unique.size).toBe(events.length);
    });

    it("includes known event names", () => {
      const events = evaluator.getSubscribedEvents();
      expect(events).toContain("zone:player-enter");
      expect(events).toContain("zone:player-leave");
      expect(events).toContain("combat:death");
      expect(events).toContain("quest:complete");
      expect(events).toContain("combat:started");
      expect(events).toContain("npc:interaction");
      expect(events).toContain("player:spawned");
    });

    it("does not include empty-eventNames trigger types (e.g. onTimer)", () => {
      const events = evaluator.getSubscribedEvents();
      // onTimer has eventNames: [] so no event should be subscribed for it
      // We just verify that there are no empty strings
      for (const event of events) {
        expect(event.length).toBeGreaterThan(0);
      }
    });
  });

  // -------------------------------------------------------------------------
  // getMappingsForEvent
  // -------------------------------------------------------------------------

  describe("getMappingsForEvent", () => {
    it("returns correct mappings for zone:player-enter", () => {
      const mappings = evaluator.getMappingsForEvent("zone:player-enter");
      expect(mappings.length).toBeGreaterThanOrEqual(1);
      expect(mappings[0].triggerType).toBe("trigger/onPlayerEnterZone");
    });

    it("returns correct mappings for combat:death", () => {
      const mappings = evaluator.getMappingsForEvent("combat:death");
      expect(mappings.length).toBeGreaterThanOrEqual(1);
      expect(mappings[0].triggerType).toBe("trigger/onMobKilled");
    });

    it("returns correct mappings for quest:started", () => {
      const mappings = evaluator.getMappingsForEvent("quest:started");
      expect(mappings.length).toBeGreaterThanOrEqual(1);
      expect(mappings[0].triggerType).toBe("trigger/onQuestStarted");
    });

    it("returns empty array for unknown events", () => {
      const mappings = evaluator.getMappingsForEvent("unknown:event");
      expect(mappings).toEqual([]);
    });

    it("returns multiple mappings when events are shared", () => {
      // entity:damaged is mapped to trigger/onEntityDamaged
      const mappings = evaluator.getMappingsForEvent("entity:damaged");
      expect(mappings.length).toBeGreaterThanOrEqual(1);
    });
  });

  // -------------------------------------------------------------------------
  // matchesTrigger
  // -------------------------------------------------------------------------

  describe("matchesTrigger", () => {
    it("returns true when event matches trigger node type", () => {
      const node = createTriggerNode("trigger/onPlayerEnterZone");
      const result = evaluator.matchesTrigger(
        node,
        "zone:player-enter",
        { playerId: "player-1", zoneId: "zone-1" },
        "zone-1",
      );
      expect(result).toBe(true);
    });

    it("returns false when event does not match trigger node type", () => {
      const node = createTriggerNode("trigger/onPlayerEnterZone");
      const result = evaluator.matchesTrigger(
        node,
        "combat:death",
        { entityId: "mob-1" },
        "zone-1",
      );
      expect(result).toBe(false);
    });

    it("returns false for unregistered trigger type", () => {
      const node = createTriggerNode("trigger/nonexistent");
      const result = evaluator.matchesTrigger(
        node,
        "zone:player-enter",
        { playerId: "player-1" },
        "entity-1",
      );
      expect(result).toBe(false);
    });

    it("handles zone-specific filtering (zoneId must match entityId)", () => {
      const node = createTriggerNode("trigger/onPlayerEnterZone");

      // Should match when zoneId equals entityId
      const matchResult = evaluator.matchesTrigger(
        node,
        "zone:player-enter",
        { playerId: "player-1", zoneId: "zone-42" },
        "zone-42",
      );
      expect(matchResult).toBe(true);

      // Should not match when zoneId differs from entityId
      const noMatchResult = evaluator.matchesTrigger(
        node,
        "zone:player-enter",
        { playerId: "player-1", zoneId: "zone-99" },
        "zone-42",
      );
      expect(noMatchResult).toBe(false);
    });

    it("handles zone leave filtering", () => {
      const node = createTriggerNode("trigger/onPlayerLeaveZone");

      const matchResult = evaluator.matchesTrigger(
        node,
        "zone:player-leave",
        { playerId: "player-1", zoneId: "zone-7" },
        "zone-7",
      );
      expect(matchResult).toBe(true);

      const noMatchResult = evaluator.matchesTrigger(
        node,
        "zone:player-leave",
        { playerId: "player-1", zoneId: "zone-7" },
        "zone-8",
      );
      expect(noMatchResult).toBe(false);
    });

    it("handles mob killed filtering by mobType in node data", () => {
      const node = createTriggerNode("trigger/onMobKilled", {
        mobType: "goblin",
      });

      // Should match when entityType matches node's mobType
      const matchResult = evaluator.matchesTrigger(
        node,
        "combat:death",
        { entityId: "mob-1", killerId: "player-1", entityType: "goblin" },
        "any-entity",
      );
      expect(matchResult).toBe(true);

      // Should not match when entityType differs
      const noMatchResult = evaluator.matchesTrigger(
        node,
        "combat:death",
        { entityId: "mob-2", killerId: "player-1", entityType: "dragon" },
        "any-entity",
      );
      expect(noMatchResult).toBe(false);
    });

    it("mob killed with no mobType filter matches all mob types", () => {
      const node = createTriggerNode("trigger/onMobKilled", {});

      const result = evaluator.matchesTrigger(
        node,
        "combat:death",
        { entityId: "mob-1", killerId: "player-1", entityType: "dragon" },
        "any-entity",
      );
      expect(result).toBe(true);
    });

    it("handles movement triggers with entity matching", () => {
      const node = createTriggerNode("trigger/onMovementCompleted");

      const matchResult = evaluator.matchesTrigger(
        node,
        "movement:completed",
        { entityId: "entity-5", position: { x: 10, y: 0, z: 20 } },
        "entity-5",
      );
      expect(matchResult).toBe(true);

      const noMatchResult = evaluator.matchesTrigger(
        node,
        "movement:completed",
        { entityId: "entity-5", position: { x: 10, y: 0, z: 20 } },
        "entity-99",
      );
      expect(noMatchResult).toBe(false);
    });

    it("handles playerDied trigger filtering for player entity type", () => {
      const node = createTriggerNode("trigger/onPlayerDied");

      // Should match for player entity type
      const matchResult = evaluator.matchesTrigger(
        node,
        "entity:death",
        { entityId: "p-1", killerId: "mob-1", entityType: "player" },
        "any",
      );
      expect(matchResult).toBe(true);

      // Should not match for mob entity type
      const noMatchResult = evaluator.matchesTrigger(
        node,
        "entity:death",
        { entityId: "m-1", killerId: "p-1", entityType: "mob" },
        "any",
      );
      expect(noMatchResult).toBe(false);
    });

    it("triggers without matchesEntity function always match on correct event", () => {
      const node = createTriggerNode("trigger/onQuestComplete");

      const result = evaluator.matchesTrigger(
        node,
        "quest:complete",
        { playerId: "player-1", questId: "q-1" },
        "any-entity",
      );
      expect(result).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // extractTriggerData
  // -------------------------------------------------------------------------

  describe("extractTriggerData", () => {
    it("extracts zone enter data correctly", () => {
      const data = evaluator.extractTriggerData("trigger/onPlayerEnterZone", {
        playerId: "player-1",
        zoneId: "zone-5",
        zoneName: "Lumbridge",
        extra: "ignored",
      });

      expect(data).toEqual({
        playerId: "player-1",
        zoneId: "zone-5",
        zoneName: "Lumbridge",
      });
    });

    it("extracts mob killed data correctly", () => {
      const data = evaluator.extractTriggerData("trigger/onMobKilled", {
        entityId: "mob-42",
        killerId: "player-1",
        entityType: "goblin",
        loot: [],
      });

      expect(data).toEqual({
        entityId: "mob-42",
        killerId: "player-1",
        entityType: "goblin",
      });
    });

    it("extracts item collected data correctly", () => {
      const data = evaluator.extractTriggerData("trigger/onItemCollected", {
        playerId: "player-1",
        itemId: "bronze_sword",
        quantity: 1,
      });

      expect(data).toEqual({
        playerId: "player-1",
        itemId: "bronze_sword",
        quantity: 1,
      });
    });

    it("extracts combat started data correctly", () => {
      const data = evaluator.extractTriggerData("trigger/onCombatStarted", {
        attackerId: "player-1",
        targetId: "mob-10",
      });

      expect(data).toEqual({
        attacker: "player-1",
        target: "mob-10",
      });
    });

    it("extracts player level up data correctly", () => {
      const data = evaluator.extractTriggerData("trigger/onPlayerLevelUp", {
        playerId: "player-1",
        skillId: "mining",
        level: 50,
      });

      expect(data).toEqual({
        player: "player-1",
        skill: "mining",
        level: 50,
      });
    });

    it("extracts NPC interaction data correctly", () => {
      const data = evaluator.extractTriggerData("trigger/onNPCInteraction", {
        playerId: "player-1",
        npcId: "npc-bob",
      });

      expect(data).toEqual({
        player: "player-1",
        npc: "npc-bob",
        npcId: "npc-bob",
      });
    });

    it("extracts entity damaged data correctly", () => {
      const data = evaluator.extractTriggerData("trigger/onEntityDamaged", {
        entityId: "mob-3",
        damage: 15,
        sourceEntityId: "player-1",
      });

      expect(data).toEqual({
        entityId: "mob-3",
        damage: 15,
        sourceEntityId: "player-1",
      });
    });

    it("returns raw event data for unregistered trigger type", () => {
      const eventData = { foo: "bar", baz: 42 };
      const data = evaluator.extractTriggerData("trigger/unknown", eventData);
      expect(data).toBe(eventData);
    });
  });

  // -------------------------------------------------------------------------
  // register (custom mapping)
  // -------------------------------------------------------------------------

  describe("register", () => {
    it("adds a new trigger mapping", () => {
      evaluator.register({
        triggerType: "trigger/onCustomEvent",
        eventNames: ["custom:fired"],
        extractData: (data) => ({ value: data.value }),
      });

      const events = evaluator.getSubscribedEvents();
      expect(events).toContain("custom:fired");

      const mappings = evaluator.getMappingsForEvent("custom:fired");
      expect(mappings.length).toBe(1);
      expect(mappings[0].triggerType).toBe("trigger/onCustomEvent");
    });

    it("new mapping works with matchesTrigger", () => {
      evaluator.register({
        triggerType: "trigger/onCustomEvent",
        eventNames: ["custom:fired"],
        extractData: (data) => ({ value: data.value }),
      });

      const node = createTriggerNode("trigger/onCustomEvent");
      const result = evaluator.matchesTrigger(
        node,
        "custom:fired",
        { value: 42 },
        "entity-1",
      );
      expect(result).toBe(true);
    });

    it("new mapping works with extractTriggerData", () => {
      evaluator.register({
        triggerType: "trigger/onCustomEvent",
        eventNames: ["custom:fired"],
        extractData: (data) => ({ value: data.value }),
      });

      const data = evaluator.extractTriggerData("trigger/onCustomEvent", {
        value: 42,
        extra: "ignored",
      });
      expect(data).toEqual({ value: 42 });
    });
  });

  // -------------------------------------------------------------------------
  // Constructor with custom mappings
  // -------------------------------------------------------------------------

  describe("constructor with custom mappings", () => {
    it("accepts custom mappings array instead of defaults", () => {
      const custom = new TriggerEvaluator([
        {
          triggerType: "trigger/onFoo",
          eventNames: ["foo:bar"],
          extractData: (d) => ({ x: d.x }),
        },
      ]);

      const events = custom.getSubscribedEvents();
      expect(events).toEqual(["foo:bar"]);
      expect(events).not.toContain("zone:player-enter");
    });

    it("accepts empty array", () => {
      const empty = new TriggerEvaluator([]);
      expect(empty.getSubscribedEvents()).toEqual([]);
    });
  });
});

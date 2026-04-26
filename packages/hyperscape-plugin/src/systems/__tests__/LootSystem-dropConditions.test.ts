/**
 * LootSystem drop-condition evaluator integration.
 *
 * Verifies the pluggable `DropCondition` evaluator surface:
 *
 *  - The default evaluator lets `always` entries roll and drops every
 *    non-`always` kind. Safe-by-default.
 *  - A custom evaluator receives each `DropCondition` + a
 *    `LootDropContext` carrying `mobType` and (when known) `killerId`.
 *  - A throwing evaluator is caught at the callsite and treated as
 *    `false` — plugin misbehavior never takes down the drop loop.
 *  - `setDropConditionEvaluator(null)` restores the safe default.
 *
 * These tests exercise the roller through `rollLootFor` directly; the
 * `handleMobDeath` → `rollLootFor(mobType, killedBy)` plumbing is
 * covered implicitly by asserting the `killerId` that the evaluator
 * observes.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

import type { LootTablesManifest } from "@hyperforge/manifest-schema";

// Migrated 2026-04-25 alongside LootSystem from
// `packages/shared/src/systems/shared/economy/__tests__/`. Imports
// updated to match the new home in `@hyperforge/hyperscape`.
import { LootSystem } from "../LootSystem";
import { createDropConditionDispatcher } from "../economy/DropConditionDispatcher";
import {
  defaultDropConditionEvaluator,
  type LootDropConditionEvaluator,
  type LootDropContext,
  type World,
} from "@hyperforge/shared";

function makeWorld(): World {
  return {
    isServer: true,
    entities: new Map(),
    currentTick: 0,
    getSystem: vi.fn(() => null),
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  } as unknown as World;
}

/**
 * Fixture: one "gated" item guarded by `quest-active` and one
 * `always` baseline. Weights are 1 each but `always` is present so
 * we never roll an empty result when the gated entry fails.
 */
const manifest: LootTablesManifest = [
  {
    id: "gated_bandit_drops",
    name: "Gated bandit drops",
    description: "",
    rolls: { min: 1, max: 1 },
    entries: [
      {
        kind: "item",
        weight: 1,
        itemId: "quest_ring",
        stack: { min: 1, max: 1 },
        condition: {
          kind: "quest-active",
          params: { questId: "bandits_quest" },
        },
      },
    ],
  },
  {
    id: "always_drops",
    name: "Always drops",
    description: "",
    rolls: { min: 1, max: 1 },
    entries: [
      {
        kind: "item",
        weight: 1,
        itemId: "coins",
        stack: { min: 5, max: 5 },
        condition: { kind: "always", params: {} },
      },
    ],
  },
] as LootTablesManifest;

describe("LootSystem drop-condition evaluator", () => {
  let loot: LootSystem;

  beforeEach(() => {
    loot = new LootSystem(makeWorld());
    loot.setAuthoredLootTables(manifest);
  });

  describe("defaults (no evaluator installed)", () => {
    it("`defaultDropConditionEvaluator` lets `always` through and drops others", () => {
      expect(
        defaultDropConditionEvaluator(
          { kind: "always", params: {} },
          { mobType: "bandit" },
        ),
      ).toBe(true);
      for (const kind of [
        "quest-active",
        "quest-completed",
        "level-at-least",
        "has-item",
        "custom",
      ] as const) {
        expect(
          defaultDropConditionEvaluator(
            { kind, params: {} },
            { mobType: "bandit" },
          ),
        ).toBe(false);
      }
    });

    it("rolls `always` entries and skips conditional ones by default", () => {
      loot.setMobLootTable("bandit", "gated_bandit_drops");
      // The gated entry is the only entry; default evaluator returns
      // false for `quest-active`, so no drops.
      expect(loot.rollLootFor("bandit")).toEqual([]);

      loot.setMobLootTable("peasant", "always_drops");
      expect(loot.rollLootFor("peasant")).toEqual([
        { itemId: "coins", quantity: 5 },
      ]);
    });
  });

  describe("custom evaluator", () => {
    it("receives the DropCondition and LootDropContext for every non-`always` entry", () => {
      const seen: Array<{
        kind: string;
        params: Record<string, unknown>;
        mobType: string;
        killerId?: string;
      }> = [];
      const evaluator: LootDropConditionEvaluator = (condition, ctx) => {
        seen.push({
          kind: condition.kind,
          params: { ...condition.params },
          mobType: ctx.mobType,
          killerId: ctx.killerId,
        });
        return false;
      };
      loot.setDropConditionEvaluator(evaluator);
      loot.setMobLootTable("bandit", "gated_bandit_drops");

      loot.rollLootFor("bandit", "player_42");

      expect(seen).toHaveLength(1);
      expect(seen[0]).toEqual({
        kind: "quest-active",
        params: { questId: "bandits_quest" },
        mobType: "bandit",
        killerId: "player_42",
      });
    });

    it("gates drops on returned boolean — true allows, false skips", () => {
      let allow = false;
      loot.setDropConditionEvaluator(() => allow);
      loot.setMobLootTable("bandit", "gated_bandit_drops");

      expect(loot.rollLootFor("bandit", "p1")).toEqual([]);

      allow = true;
      expect(loot.rollLootFor("bandit", "p1")).toEqual([
        { itemId: "quest_ring", quantity: 1 },
      ]);
    });

    it("can inspect killerId to authorize per-player drops", () => {
      // Simulates a QuestSystem-style evaluator: only player_42 has the
      // bandit quest active, everyone else fails the gate.
      const activeQuests: Record<string, Set<string>> = {
        player_42: new Set(["bandits_quest"]),
      };
      loot.setDropConditionEvaluator((condition, ctx) => {
        if (condition.kind !== "quest-active") return false;
        const questId = condition.params.questId;
        if (typeof questId !== "string") return false;
        if (!ctx.killerId) return false;
        return activeQuests[ctx.killerId]?.has(questId) === true;
      });
      loot.setMobLootTable("bandit", "gated_bandit_drops");

      expect(loot.rollLootFor("bandit", "player_42")).toEqual([
        { itemId: "quest_ring", quantity: 1 },
      ]);
      expect(loot.rollLootFor("bandit", "player_99")).toEqual([]);
      // No killerId → gate fails.
      expect(loot.rollLootFor("bandit")).toEqual([]);
    });

    it("is invoked for every entry (including `always`) so the evaluator owns full policy", () => {
      const evaluator = vi.fn<LootDropConditionEvaluator>(
        (cond) => cond.kind === "always",
      );
      loot.setDropConditionEvaluator(evaluator);
      loot.setMobLootTable("peasant", "always_drops");

      const drops = loot.rollLootFor("peasant", "p1");
      expect(evaluator).toHaveBeenCalledTimes(1);
      expect(evaluator.mock.calls[0][0]).toEqual({
        kind: "always",
        params: {},
      });
      // Evaluator allowed `always` through, so the drop still rolls.
      expect(drops).toEqual([{ itemId: "coins", quantity: 5 }]);
    });

    it("last-write-wins on repeated setter calls", () => {
      loot.setDropConditionEvaluator(() => false);
      loot.setDropConditionEvaluator(() => true);
      loot.setMobLootTable("bandit", "gated_bandit_drops");

      expect(loot.rollLootFor("bandit", "p1")).toEqual([
        { itemId: "quest_ring", quantity: 1 },
      ]);
    });
  });

  describe("plugin isolation", () => {
    it("treats a throwing evaluator as `false` instead of bubbling the throw", () => {
      loot.setDropConditionEvaluator(() => {
        throw new Error("plugin-side boom");
      });
      loot.setMobLootTable("bandit", "gated_bandit_drops");

      // Must not throw; must return [] (the gated entry's condition
      // threw → treated as false → entry skipped).
      expect(() => loot.rollLootFor("bandit", "p1")).not.toThrow();
      expect(loot.rollLootFor("bandit", "p1")).toEqual([]);
    });

    it("isolates throws per-entry — a throwing gate does not kill unrelated `always` entries on another table", () => {
      // Evaluator throws only for quest-active; always is allowed
      // through. Proves the try/catch is scoped to the single
      // `evaluateCondition` call, not the whole roll.
      loot.setDropConditionEvaluator((cond) => {
        if (cond.kind === "always") return true;
        throw new Error("plugin-side boom");
      });
      loot.setMobLootTable("bandit", "gated_bandit_drops");
      loot.setMobLootTable("peasant", "always_drops");

      expect(loot.rollLootFor("bandit", "p1")).toEqual([]);
      expect(loot.rollLootFor("peasant", "p1")).toEqual([
        { itemId: "coins", quantity: 5 },
      ]);
    });
  });

  describe("restore default", () => {
    it("setDropConditionEvaluator(null) restores the safe default", () => {
      loot.setDropConditionEvaluator(() => true);
      loot.setMobLootTable("bandit", "gated_bandit_drops");
      expect(loot.rollLootFor("bandit", "p1")).toEqual([
        { itemId: "quest_ring", quantity: 1 },
      ]);

      loot.setDropConditionEvaluator(null);
      expect(loot.rollLootFor("bandit", "p1")).toEqual([]);
    });
  });

  describe("DropConditionDispatcher integration", () => {
    it("dispatcher.evaluate plugs straight into setDropConditionEvaluator", () => {
      const dispatcher = createDropConditionDispatcher();
      const activeQuests: Record<string, Set<string>> = {
        player_42: new Set(["bandits_quest"]),
      };
      dispatcher.register("quest-active", (params, ctx) => {
        const questId = params.questId;
        if (typeof questId !== "string") return false;
        if (!ctx.killerId) return false;
        return activeQuests[ctx.killerId]?.has(questId) === true;
      });

      loot.setDropConditionEvaluator(dispatcher.evaluate);
      loot.setMobLootTable("bandit", "gated_bandit_drops");
      loot.setMobLootTable("peasant", "always_drops");

      // Quest-active player gets the gated drop.
      expect(loot.rollLootFor("bandit", "player_42")).toEqual([
        { itemId: "quest_ring", quantity: 1 },
      ]);
      // No quest → gated entry hidden.
      expect(loot.rollLootFor("bandit", "player_99")).toEqual([]);
      // `always` baseline still rolls — dispatcher pre-registers it.
      expect(loot.rollLootFor("peasant", "player_99")).toEqual([
        { itemId: "coins", quantity: 5 },
      ]);
    });

    it("a dispatcher handler that throws is isolated by LootSystem's try/catch", () => {
      const dispatcher = createDropConditionDispatcher();
      dispatcher.register("quest-active", () => {
        throw new Error("plugin-side boom");
      });
      loot.setDropConditionEvaluator(dispatcher.evaluate);
      loot.setMobLootTable("bandit", "gated_bandit_drops");

      // LootSystem catches the throw and treats the gate as false.
      expect(() => loot.rollLootFor("bandit", "p1")).not.toThrow();
      expect(loot.rollLootFor("bandit", "p1")).toEqual([]);
    });
  });

  describe("context threading", () => {
    it("passes undefined killerId through when rollLootFor is called without one", () => {
      const captured: LootDropContext[] = [];
      loot.setDropConditionEvaluator((_cond, ctx) => {
        captured.push({ mobType: ctx.mobType, killerId: ctx.killerId });
        return false;
      });
      loot.setMobLootTable("bandit", "gated_bandit_drops");

      loot.rollLootFor("bandit");
      expect(captured).toHaveLength(1);
      expect(captured[0].mobType).toBe("bandit");
      expect(captured[0].killerId).toBeUndefined();
    });
  });
});

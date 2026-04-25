/**
 * Tests for the world-backed concrete DropCondition handlers.
 *
 * These handlers bridge the manifest-side `DropCondition` kinds to
 * live QuestSystem / InventorySystem / SkillsSystem reads. Each test
 * builds a fake `World` with a `getSystem` stub that returns a small
 * shim implementing just the read surface the handler touches.
 */
import { describe, it, expect, vi } from "vitest";

import type { World } from "../../../../types/index";
import type { LootDropContext } from "../../../../types/loot-drops";
import {
  createQuestActiveHandler,
  createQuestCompletedHandler,
  createHasItemHandler,
  createLevelAtLeastHandler,
  installWorldDropConditions,
} from "../WorldDropConditionEvaluators";
import { createDropConditionDispatcher } from "../DropConditionDispatcher";

interface FakeSystems {
  quest?: {
    getActiveQuests: (playerId: string) => Array<{
      questId: string;
      status: string;
    }>;
    hasCompletedQuest: (playerId: string, questId: string) => boolean;
  };
  inventory?: {
    hasItem: (playerId: string, itemId: string, qty: number) => boolean;
  };
  skills?: {
    getSkillData: (
      playerId: string,
      skill: string,
    ) => { level: number } | undefined;
  };
}

function makeWorld(systems: FakeSystems): World {
  return {
    isServer: true,
    entities: new Map(),
    currentTick: 0,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getSystem: vi.fn((name: string) => (systems as any)[name] ?? null),
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  } as unknown as World;
}

const ctx = (killerId?: string): LootDropContext => ({
  mobType: "bandit",
  killerId,
});

describe("createQuestActiveHandler", () => {
  it("returns false when killerId missing", () => {
    const h = createQuestActiveHandler(makeWorld({}));
    expect(h({ questId: "q1" }, ctx())).toBe(false);
  });

  it("returns false when questId missing or wrong type", () => {
    const h = createQuestActiveHandler(
      makeWorld({
        quest: {
          getActiveQuests: () => [{ questId: "q1", status: "in_progress" }],
          hasCompletedQuest: () => false,
        },
      }),
    );
    expect(h({}, ctx("p1"))).toBe(false);
    expect(h({ questId: 42 }, ctx("p1"))).toBe(false);
    expect(h({ questId: "" }, ctx("p1"))).toBe(false);
  });

  it("returns false when QuestSystem missing", () => {
    const h = createQuestActiveHandler(makeWorld({}));
    expect(h({ questId: "q1" }, ctx("p1"))).toBe(false);
  });

  it("returns true when quest is in progress for the killer", () => {
    const h = createQuestActiveHandler(
      makeWorld({
        quest: {
          getActiveQuests: () => [
            { questId: "q1", status: "in_progress" },
            { questId: "q2", status: "ready_to_complete" },
          ],
          hasCompletedQuest: () => false,
        },
      }),
    );
    expect(h({ questId: "q1" }, ctx("p1"))).toBe(true);
    expect(h({ questId: "q2" }, ctx("p1"))).toBe(true);
  });

  it("returns false when quest is already completed (status==='completed')", () => {
    const h = createQuestActiveHandler(
      makeWorld({
        quest: {
          getActiveQuests: () => [{ questId: "q1", status: "completed" }],
          hasCompletedQuest: () => true,
        },
      }),
    );
    expect(h({ questId: "q1" }, ctx("p1"))).toBe(false);
  });

  it("returns false when quest is not in active list", () => {
    const h = createQuestActiveHandler(
      makeWorld({
        quest: {
          getActiveQuests: () => [],
          hasCompletedQuest: () => false,
        },
      }),
    );
    expect(h({ questId: "q1" }, ctx("p1"))).toBe(false);
  });
});

describe("createQuestCompletedHandler", () => {
  it("delegates to QuestSystem.hasCompletedQuest", () => {
    const calls: Array<{ playerId: string; questId: string }> = [];
    const h = createQuestCompletedHandler(
      makeWorld({
        quest: {
          getActiveQuests: () => [],
          hasCompletedQuest: (playerId, questId) => {
            calls.push({ playerId, questId });
            return questId === "beaten_quest";
          },
        },
      }),
    );
    expect(h({ questId: "beaten_quest" }, ctx("p1"))).toBe(true);
    expect(h({ questId: "other" }, ctx("p1"))).toBe(false);
    expect(calls).toEqual([
      { playerId: "p1", questId: "beaten_quest" },
      { playerId: "p1", questId: "other" },
    ]);
  });

  it("returns false when killerId / questId missing or QuestSystem absent", () => {
    const world = makeWorld({});
    const h = createQuestCompletedHandler(world);
    expect(h({ questId: "q" }, ctx())).toBe(false);
    expect(h({}, ctx("p1"))).toBe(false);
    expect(h({ questId: "q" }, ctx("p1"))).toBe(false);
  });
});

describe("createHasItemHandler", () => {
  it("defaults quantity to 1 when omitted", () => {
    const seen: number[] = [];
    const h = createHasItemHandler(
      makeWorld({
        inventory: {
          hasItem: (_p, _i, qty) => {
            seen.push(qty);
            return true;
          },
        },
      }),
    );
    h({ itemId: "logs" }, ctx("p1"));
    expect(seen).toEqual([1]);
  });

  it("honors explicit quantity", () => {
    const seen: number[] = [];
    const h = createHasItemHandler(
      makeWorld({
        inventory: {
          hasItem: (_p, _i, qty) => {
            seen.push(qty);
            return true;
          },
        },
      }),
    );
    h({ itemId: "logs", quantity: 5 }, ctx("p1"));
    expect(seen).toEqual([5]);
  });

  it("returns false when quantity ≤ 0", () => {
    const h = createHasItemHandler(
      makeWorld({
        inventory: { hasItem: () => true },
      }),
    );
    expect(h({ itemId: "logs", quantity: 0 }, ctx("p1"))).toBe(false);
    expect(h({ itemId: "logs", quantity: -3 }, ctx("p1"))).toBe(false);
  });

  it("returns false when itemId / killerId missing or InventorySystem absent", () => {
    const world = makeWorld({});
    const h = createHasItemHandler(world);
    expect(h({ itemId: "logs" }, ctx())).toBe(false);
    expect(h({}, ctx("p1"))).toBe(false);
    expect(h({ itemId: "logs" }, ctx("p1"))).toBe(false);
  });

  it("delegates to InventorySystem.hasItem and respects its return value", () => {
    const h = createHasItemHandler(
      makeWorld({
        inventory: { hasItem: (_p, itemId) => itemId === "key" },
      }),
    );
    expect(h({ itemId: "key" }, ctx("p1"))).toBe(true);
    expect(h({ itemId: "scroll" }, ctx("p1"))).toBe(false);
  });
});

describe("createLevelAtLeastHandler", () => {
  it("returns true when skill level ≥ required", () => {
    const h = createLevelAtLeastHandler(
      makeWorld({
        skills: {
          getSkillData: () => ({ level: 42 }),
        },
      }),
    );
    expect(h({ skill: "mining", level: 40 }, ctx("p1"))).toBe(true);
    expect(h({ skill: "mining", level: 42 }, ctx("p1"))).toBe(true);
  });

  it("returns false when skill level < required", () => {
    const h = createLevelAtLeastHandler(
      makeWorld({
        skills: {
          getSkillData: () => ({ level: 10 }),
        },
      }),
    );
    expect(h({ skill: "mining", level: 20 }, ctx("p1"))).toBe(false);
  });

  it("rejects unknown skill names", () => {
    const h = createLevelAtLeastHandler(
      makeWorld({
        skills: {
          getSkillData: () => ({ level: 99 }),
        },
      }),
    );
    expect(h({ skill: "dancing", level: 1 }, ctx("p1"))).toBe(false);
  });

  it("returns false when skill / level / killerId missing or SkillsSystem absent", () => {
    const world = makeWorld({});
    const h = createLevelAtLeastHandler(world);
    expect(h({ skill: "mining", level: 1 }, ctx())).toBe(false);
    expect(h({ skill: "mining" }, ctx("p1"))).toBe(false);
    expect(h({ level: 1 }, ctx("p1"))).toBe(false);
    expect(h({ skill: "mining", level: 1 }, ctx("p1"))).toBe(false);
  });

  it("returns false when SkillsSystem.getSkillData is undefined (skill not tracked)", () => {
    const h = createLevelAtLeastHandler(
      makeWorld({
        skills: {
          getSkillData: () => undefined,
        },
      }),
    );
    expect(h({ skill: "mining", level: 1 }, ctx("p1"))).toBe(false);
  });
});

describe("installWorldDropConditions", () => {
  it("registers all four kinds on the dispatcher", () => {
    const dispatcher = createDropConditionDispatcher();
    installWorldDropConditions(dispatcher, makeWorld({}));
    expect(dispatcher.getRegisteredKinds()).toEqual([
      "always",
      "has-item",
      "level-at-least",
      "quest-active",
      "quest-completed",
    ]);
  });

  it("installed handlers route to live systems via world.getSystem", () => {
    const dispatcher = createDropConditionDispatcher();
    const world = makeWorld({
      quest: {
        getActiveQuests: () => [{ questId: "q1", status: "in_progress" }],
        hasCompletedQuest: (_p, qid) => qid === "q2",
      },
      inventory: {
        hasItem: (_p, itemId, qty) => itemId === "key" && qty === 1,
      },
      skills: {
        getSkillData: (_p, skill) =>
          skill === "mining" ? { level: 50 } : undefined,
      },
    });
    installWorldDropConditions(dispatcher, world);

    expect(
      dispatcher.evaluate(
        { kind: "quest-active", params: { questId: "q1" } },
        ctx("p1"),
      ),
    ).toBe(true);
    expect(
      dispatcher.evaluate(
        { kind: "quest-completed", params: { questId: "q2" } },
        ctx("p1"),
      ),
    ).toBe(true);
    expect(
      dispatcher.evaluate(
        { kind: "has-item", params: { itemId: "key" } },
        ctx("p1"),
      ),
    ).toBe(true);
    expect(
      dispatcher.evaluate(
        { kind: "level-at-least", params: { skill: "mining", level: 40 } },
        ctx("p1"),
      ),
    ).toBe(true);
    // `always` baseline still works.
    expect(dispatcher.evaluate({ kind: "always", params: {} }, ctx("p1"))).toBe(
      true,
    );
  });

  it("picks up systems registered AFTER install (resolves getSystem on each call)", () => {
    const dispatcher = createDropConditionDispatcher();
    const systems: FakeSystems = {};
    const world = makeWorld(systems);
    installWorldDropConditions(dispatcher, world);

    // Before registration — handler returns false.
    expect(
      dispatcher.evaluate(
        { kind: "has-item", params: { itemId: "key" } },
        ctx("p1"),
      ),
    ).toBe(false);

    // Register late.
    systems.inventory = { hasItem: () => true };

    // Same dispatcher, same handler, now routes through.
    expect(
      dispatcher.evaluate(
        { kind: "has-item", params: { itemId: "key" } },
        ctx("p1"),
      ),
    ).toBe(true);
  });
});

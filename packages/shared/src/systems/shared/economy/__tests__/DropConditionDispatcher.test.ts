/**
 * Tests for the per-kind `DropConditionDispatcher` helper.
 *
 * Verifies:
 *  - `always` is registered by default and returns true.
 *  - Unknown kinds default to false.
 *  - Registered handlers receive (params, ctx) and gate on return.
 *  - `unregister` drops a single kind; `clear` drops everything but
 *    re-installs the `always` baseline.
 *  - `getRegisteredKinds` returns a sorted snapshot.
 *  - Handler throws are NOT caught here — the LootSystem callsite
 *    owns plugin isolation.
 */
import { describe, it, expect } from "vitest";

import type { DropCondition } from "@hyperforge/manifest-schema";

import type { LootDropContext } from "../LootSystem";
import {
  createDropConditionDispatcher,
  createCustomKindDispatcher,
  type DropConditionKindHandler,
} from "../DropConditionDispatcher";

function ctx(mobType = "bandit", killerId?: string): LootDropContext {
  return { mobType, killerId };
}

function cond(
  kind: DropCondition["kind"],
  params: DropCondition["params"] = {},
): DropCondition {
  return { kind, params };
}

describe("DropConditionDispatcher", () => {
  describe("defaults", () => {
    it("pre-registers `always` and returns true for it", () => {
      const d = createDropConditionDispatcher();
      expect(d.has("always")).toBe(true);
      expect(d.evaluate(cond("always"), ctx())).toBe(true);
    });

    it("returns false for kinds with no registered handler", () => {
      const d = createDropConditionDispatcher();
      for (const kind of [
        "quest-active",
        "quest-completed",
        "level-at-least",
        "has-item",
        "custom",
      ] as const) {
        expect(d.evaluate(cond(kind), ctx())).toBe(false);
      }
    });
  });

  describe("register / unregister", () => {
    it("invokes the registered handler with (params, ctx)", () => {
      const d = createDropConditionDispatcher();
      const seen: Array<{ params: unknown; ctx: LootDropContext }> = [];
      const handler: DropConditionKindHandler = (params, c) => {
        seen.push({ params, ctx: c });
        return true;
      };
      d.register("quest-active", handler);
      d.evaluate(
        cond("quest-active", { questId: "bandits_quest" }),
        ctx("bandit", "player_42"),
      );
      expect(seen).toHaveLength(1);
      expect(seen[0].params).toEqual({ questId: "bandits_quest" });
      expect(seen[0].ctx).toEqual({
        mobType: "bandit",
        killerId: "player_42",
      });
    });

    it("gates on handler return value", () => {
      const d = createDropConditionDispatcher();
      d.register("has-item", (params) => params.itemId === "key");
      expect(d.evaluate(cond("has-item", { itemId: "key" }), ctx())).toBe(true);
      expect(d.evaluate(cond("has-item", { itemId: "other" }), ctx())).toBe(
        false,
      );
    });

    it("last-write-wins on re-registration", () => {
      const d = createDropConditionDispatcher();
      d.register("custom", () => false);
      d.register("custom", () => true);
      expect(d.evaluate(cond("custom"), ctx())).toBe(true);
    });

    it("unregister drops a single kind (and leaves the rest)", () => {
      const d = createDropConditionDispatcher();
      d.register("quest-active", () => true);
      d.register("level-at-least", () => true);
      d.unregister("quest-active");
      expect(d.evaluate(cond("quest-active"), ctx())).toBe(false);
      expect(d.evaluate(cond("level-at-least"), ctx())).toBe(true);
      // `always` baseline still intact.
      expect(d.evaluate(cond("always"), ctx())).toBe(true);
    });
  });

  describe("clear", () => {
    it("drops every handler except the `always` baseline", () => {
      const d = createDropConditionDispatcher();
      d.register("quest-active", () => true);
      d.register("has-item", () => true);
      d.clear();
      expect(d.evaluate(cond("quest-active"), ctx())).toBe(false);
      expect(d.evaluate(cond("has-item"), ctx())).toBe(false);
      // always is preserved so pre-existing tables keep rolling.
      expect(d.evaluate(cond("always"), ctx())).toBe(true);
      expect(d.has("always")).toBe(true);
    });
  });

  describe("getRegisteredKinds", () => {
    it("returns a sorted snapshot", () => {
      const d = createDropConditionDispatcher();
      // Fresh dispatcher has just `always`.
      expect(d.getRegisteredKinds()).toEqual(["always"]);

      d.register("quest-active", () => true);
      d.register("has-item", () => true);
      d.register("level-at-least", () => true);

      expect(d.getRegisteredKinds()).toEqual([
        "always",
        "has-item",
        "level-at-least",
        "quest-active",
      ]);
    });
  });

  describe("throw semantics", () => {
    it("re-throws handler errors so the LootSystem callsite owns isolation", () => {
      const d = createDropConditionDispatcher();
      d.register("custom", () => {
        throw new Error("handler-side boom");
      });
      expect(() => d.evaluate(cond("custom"), ctx())).toThrow(
        /handler-side boom/,
      );
    });
  });
});

describe("createCustomKindDispatcher", () => {
  it("routes by params.id to the registered handler", () => {
    const sub = createCustomKindDispatcher();
    const seen: Array<{ params: unknown; ctx: LootDropContext }> = [];
    sub.register("boss_enraged", (params, c) => {
      seen.push({ params, ctx: c });
      return true;
    });

    expect(
      sub.evaluate(
        { id: "boss_enraged", rage: 90 },
        { mobType: "dragon", killerId: "p1" },
      ),
    ).toBe(true);
    expect(seen).toHaveLength(1);
    expect(seen[0].params).toEqual({ id: "boss_enraged", rage: 90 });
    expect(seen[0].ctx).toEqual({ mobType: "dragon", killerId: "p1" });
  });

  it("returns false when params.id is missing", () => {
    const sub = createCustomKindDispatcher();
    sub.register("any", () => true);
    expect(sub.evaluate({}, ctx())).toBe(false);
  });

  it("returns false when params.id is not a string", () => {
    const sub = createCustomKindDispatcher();
    sub.register("42", () => true);
    expect(sub.evaluate({ id: 42 }, ctx())).toBe(false);
  });

  it("returns false when id is unknown", () => {
    const sub = createCustomKindDispatcher();
    sub.register("known_id", () => true);
    expect(sub.evaluate({ id: "unknown_id" }, ctx())).toBe(false);
  });

  it("rejects empty id at registration", () => {
    const sub = createCustomKindDispatcher();
    expect(() => sub.register("", () => true)).toThrowError(
      /empty id is reserved/,
    );
  });

  it("last-write-wins + unregister + clear + sorted snapshot", () => {
    const sub = createCustomKindDispatcher();
    sub.register("a", () => false);
    sub.register("a", () => true);
    sub.register("c", () => true);
    sub.register("b", () => true);
    expect(sub.evaluate({ id: "a" }, ctx())).toBe(true);
    expect(sub.getRegisteredIds()).toEqual(["a", "b", "c"]);

    sub.unregister("a");
    expect(sub.has("a")).toBe(false);
    expect(sub.evaluate({ id: "a" }, ctx())).toBe(false);

    sub.clear();
    expect(sub.getRegisteredIds()).toEqual([]);
    expect(sub.evaluate({ id: "b" }, ctx())).toBe(false);
  });

  it("plugs into createDropConditionDispatcher via .register('custom', sub.evaluate)", () => {
    const sub = createCustomKindDispatcher();
    sub.register("boss_enraged", (params) => params.rage === 90);

    const top = createDropConditionDispatcher();
    top.register("custom", sub.evaluate);

    // Known id + matching params → true.
    expect(
      top.evaluate(
        { kind: "custom", params: { id: "boss_enraged", rage: 90 } },
        ctx(),
      ),
    ).toBe(true);
    // Same id but condition unmet → false.
    expect(
      top.evaluate(
        { kind: "custom", params: { id: "boss_enraged", rage: 10 } },
        ctx(),
      ),
    ).toBe(false);
    // Unknown id → false.
    expect(
      top.evaluate({ kind: "custom", params: { id: "unknown" } }, ctx()),
    ).toBe(false);
  });

  it("re-throws handler errors (isolation owned by LootSystem, not here)", () => {
    const sub = createCustomKindDispatcher();
    sub.register("boom", () => {
      throw new Error("handler-side boom");
    });
    expect(() => sub.evaluate({ id: "boom" }, ctx())).toThrow(
      /handler-side boom/,
    );
  });
});

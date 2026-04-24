/**
 * Tests for `isWidgetVisible` — the pure U8 visibility evaluator.
 *
 * Covers:
 *   - Default: no rule → visible.
 *   - Authored `visible: false` always wins.
 *   - Positive `contexts` gate.
 *   - Negative `hiddenIn` gate.
 *   - Expression gate with and without a DataContext.
 *   - Malformed expression fails closed.
 *   - Multiple gates combine with AND.
 */

import { describe, expect, it } from "vitest";

import type { WidgetInstance } from "./layout";
import { isWidgetVisible } from "./visibility";

function makeInstance(partial?: Partial<WidgetInstance>): WidgetInstance {
  return {
    instanceId: "x",
    widgetId: "hp-bar",
    position: {
      kind: "anchored",
      anchor: "top-left",
      offset: { x: 0, y: 0 },
    },
    props: {},
    visible: true,
    ...partial,
  } as WidgetInstance;
}

describe("isWidgetVisible", () => {
  it("returns true when no rule + visible flag true", () => {
    expect(
      isWidgetVisible({
        instance: makeInstance(),
        gameContext: "world",
      }),
    ).toBe(true);
  });

  it("returns false when authored visible=false, regardless of rules", () => {
    expect(
      isWidgetVisible({
        instance: makeInstance({
          visible: false,
          visibility: { contexts: ["world"] },
        }),
        gameContext: "world",
      }),
    ).toBe(false);
  });

  it("positive contexts — visible only in listed contexts", () => {
    const inst = makeInstance({
      visibility: { contexts: ["combat", "menu"] },
    });
    expect(isWidgetVisible({ instance: inst, gameContext: "combat" })).toBe(
      true,
    );
    expect(isWidgetVisible({ instance: inst, gameContext: "world" })).toBe(
      false,
    );
  });

  it("positive contexts with null gameContext → hidden", () => {
    const inst = makeInstance({ visibility: { contexts: ["combat"] } });
    expect(isWidgetVisible({ instance: inst, gameContext: null })).toBe(false);
  });

  it("hiddenIn — hides when current context is in the set", () => {
    const inst = makeInstance({ visibility: { hiddenIn: ["cutscene"] } });
    expect(isWidgetVisible({ instance: inst, gameContext: "cutscene" })).toBe(
      false,
    );
    expect(isWidgetVisible({ instance: inst, gameContext: "world" })).toBe(
      true,
    );
  });

  it("hiddenIn with null gameContext → treated as visible", () => {
    const inst = makeInstance({ visibility: { hiddenIn: ["cutscene"] } });
    expect(isWidgetVisible({ instance: inst, gameContext: null })).toBe(true);
  });

  it("expression — visible when truthy, hidden when falsy", () => {
    const inst = makeInstance({
      visibility: { expression: "$player.inCombat" },
    });
    expect(
      isWidgetVisible({
        instance: inst,
        gameContext: null,
        data: { player: { inCombat: true } },
      }),
    ).toBe(true);
    expect(
      isWidgetVisible({
        instance: inst,
        gameContext: null,
        data: { player: { inCombat: false } },
      }),
    ).toBe(false);
  });

  it("expression with no DataContext → hidden (fails closed)", () => {
    const inst = makeInstance({
      visibility: { expression: "$player.inCombat" },
    });
    expect(isWidgetVisible({ instance: inst, gameContext: null })).toBe(false);
  });

  it("malformed expression → hidden (fails closed)", () => {
    const inst = makeInstance({
      visibility: { expression: "not-a-valid-expr" },
    });
    expect(
      isWidgetVisible({
        instance: inst,
        gameContext: null,
        data: { player: { inCombat: true } },
      }),
    ).toBe(false);
  });

  it("AND across all gates — combat context AND truthy expression", () => {
    const inst = makeInstance({
      visibility: {
        contexts: ["combat"],
        expression: "$player.hasTarget",
      },
    });
    expect(
      isWidgetVisible({
        instance: inst,
        gameContext: "combat",
        data: { player: { hasTarget: true } },
      }),
    ).toBe(true);
    expect(
      isWidgetVisible({
        instance: inst,
        gameContext: "combat",
        data: { player: { hasTarget: false } },
      }),
    ).toBe(false);
    expect(
      isWidgetVisible({
        instance: inst,
        gameContext: "world",
        data: { player: { hasTarget: true } },
      }),
    ).toBe(false);
  });

  it("empty contexts array is treated as 'no rule' — doesn't gate", () => {
    const inst = makeInstance({ visibility: { contexts: [] } });
    expect(isWidgetVisible({ instance: inst, gameContext: "combat" })).toBe(
      true,
    );
    expect(isWidgetVisible({ instance: inst, gameContext: null })).toBe(true);
  });
});

/**
 * CursorTooltipWidget — definition + plugin onEnable
 * contribution test. Mirrors the established widget-test pattern.
 */

import { describe, expect, it, vi } from "vitest";
import defaultFactory, {
  type HyperscapeContext,
  calculateCursorTooltipPosition,
  cursorTooltipRegistration,
  cursorTooltipWidget,
} from "../../index.js";

describe("CursorTooltipWidget — definition", () => {
  it("declares a stable manifest id, category, and default size", () => {
    expect(cursorTooltipWidget.manifest.id).toBe(
      "com.hyperforge.hyperscape.cursor-tooltip",
    );
    expect(cursorTooltipWidget.manifest.category).toBe("overlay");
    expect(cursorTooltipWidget.manifest.defaultSize).toEqual({
      width: 24,
      height: 12,
    });
  });

  it("default props match the legacy hand-coded tooltip", () => {
    expect(cursorTooltipWidget.defaultProps).toMatchObject({
      visible: false,
      cursorOffsetPx: 4,
      estimatedWidthPx: 140,
      estimatedHeightPx: 60,
      minWidthPx: 140,
      maxWidthPx: 360,
      fontSize: 12,
      titleFontSize: 13,
      borderRadiusPx: 4,
      zIndex: 100_000,
    });
  });

  it("schema accepts a populated runtime payload", () => {
    const parsed = cursorTooltipWidget.propsSchema.safeParse({
      visible: true,
      x: 320,
      y: 480,
      title: "Iron Pickaxe",
      body: "Used to mine iron ore.\nLevel 5 mining required.",
      cursorOffsetPx: 8,
      estimatedWidthPx: 200,
      estimatedHeightPx: 80,
      minWidthPx: 160,
      maxWidthPx: 480,
      backgroundTopColor: "#101522",
      backgroundBottomColor: "#0a0e18",
      borderColor: "#3a3f4d",
      titleColor: "#ffd84d",
      bodyColor: "#e6e8ec",
      fontSize: 13,
      titleFontSize: 14,
      borderRadiusPx: 6,
      zIndex: 99_999,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects out-of-range cursorOffsetPx", () => {
    expect(
      cursorTooltipWidget.propsSchema.safeParse({ cursorOffsetPx: -1 }).success,
    ).toBe(false);
    expect(
      cursorTooltipWidget.propsSchema.safeParse({ cursorOffsetPx: 100 })
        .success,
    ).toBe(false);
  });

  it("pairs the widget with a non-null React component in the bundled registration", () => {
    expect(cursorTooltipRegistration.widget).toBe(cursorTooltipWidget);
    expect(typeof cursorTooltipRegistration.Component).toBe("function");
  });
});

describe("calculateCursorTooltipPosition", () => {
  const viewport = { width: 1000, height: 800 };

  it("places the tooltip down-right of the cursor when there's room", () => {
    const result = calculateCursorTooltipPosition(
      { x: 100, y: 100 },
      { width: 140, height: 60 },
      4,
      viewport,
    );
    expect(result).toEqual({ left: 104, top: 104 });
  });

  it("flips to the left when right edge would clip", () => {
    const result = calculateCursorTooltipPosition(
      { x: 950, y: 100 },
      { width: 140, height: 60 },
      4,
      viewport,
    );
    expect(result.left).toBe(950 - 140 - 4);
  });

  it("flips upward when bottom edge would clip", () => {
    const result = calculateCursorTooltipPosition(
      { x: 100, y: 780 },
      { width: 140, height: 60 },
      4,
      viewport,
    );
    expect(result.top).toBe(780 - 60 - 4);
  });

  it("clamps to viewport origin when both flips would go negative", () => {
    const result = calculateCursorTooltipPosition(
      { x: 0, y: 0 },
      { width: 140, height: 60 },
      4,
      viewport,
    );
    expect(result.left).toBeGreaterThanOrEqual(0);
    expect(result.top).toBeGreaterThanOrEqual(0);
  });
});

function makeStubWorld() {
  return {
    isServer: true,
    registered: [] as string[],
    unregistered: [] as string[],
    register(name: string, _ctor: unknown) {
      this.registered.push(name);
    },
    unregister(name: string) {
      this.unregistered.push(name);
    },
    getSystem(_name: string) {
      return null;
    },
    on() {},
    off() {},
    emit() {},
    entities: {
      items: new Map<string, unknown>(),
      players: new Map<string, unknown>(),
      get: (_id: string) => undefined,
      values: () => new Map().values(),
    },
    collision: {
      addFlags() {},
      removeFlags() {},
    },
    systemsByName: new Map<string, unknown>(),
  };
}

function makeStubScope() {
  return { register: vi.fn() };
}

describe("Hyperscape meta-plugin — cursor tooltip widget contribution", () => {
  it("onEnable calls ctx.widgets.register with the cursor tooltip registration", () => {
    const registered: unknown[] = [];
    const plugin = defaultFactory({
      pluginId: "com.hyperforge.hyperscape",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      scope: makeStubScope() as any,
    });

    const ctx: HyperscapeContext = {
      pluginId: "com.hyperforge.hyperscape",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      scope: makeStubScope() as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      world: makeStubWorld() as any,
      widgets: {
        register(contribution) {
          registered.push(contribution);
        },
      },
    };

    plugin.onEnable?.(ctx);
    expect(registered).toContain(cursorTooltipRegistration);
  });
});

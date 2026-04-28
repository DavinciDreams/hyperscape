/**
 * RangeSliderWidget — definition + plugin onEnable
 * contribution test. Mirrors the established widget-test pattern.
 */

import { describe, expect, it, vi } from "vitest";
import defaultFactory, {
  type HyperscapeContext,
  computeRangeFillPercent,
  rangeSliderRegistration,
  rangeSliderWidget,
} from "../../index.js";

describe("RangeSliderWidget — definition", () => {
  it("declares a stable manifest id, category, and default size", () => {
    expect(rangeSliderWidget.manifest.id).toBe(
      "com.hyperforge.hyperscape.range-slider",
    );
    expect(rangeSliderWidget.manifest.category).toBe("panel");
    expect(rangeSliderWidget.manifest.defaultSize).toEqual({
      width: 32,
      height: 6,
    });
  });

  it("default props match a sensible base", () => {
    expect(rangeSliderWidget.defaultProps).toMatchObject({
      value: 0,
      min: 0,
      max: 100,
      step: 1,
      disabled: false,
      label: "",
      description: "",
      showValue: true,
      valueSuffix: "",
      trackHeightPx: 6,
      thumbSizePx: 16,
    });
  });

  it("schema accepts a populated runtime payload", () => {
    const parsed = rangeSliderWidget.propsSchema.safeParse({
      value: 42,
      min: 0,
      max: 1,
      step: 0.01,
      disabled: false,
      label: "Master Volume",
      description: "Affects all in-game audio",
      showValue: true,
      valueSuffix: "%",
      trackHeightPx: 8,
      thumbSizePx: 20,
      trackColor: "#222",
      fillColor: "#0f0",
      thumbColor: "#fff",
      thumbBorderColor: "#000",
      labelColor: "#eee",
      descriptionColor: "#888",
      valueColor: "#ffd84d",
      labelFontSize: 14,
      descriptionFontSize: 12,
      valueFontSize: 14,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects negative step", () => {
    expect(rangeSliderWidget.propsSchema.safeParse({ step: -1 }).success).toBe(
      false,
    );
  });

  it("rejects out-of-range trackHeightPx", () => {
    expect(
      rangeSliderWidget.propsSchema.safeParse({ trackHeightPx: 1 }).success,
    ).toBe(false);
    expect(
      rangeSliderWidget.propsSchema.safeParse({ trackHeightPx: 100 }).success,
    ).toBe(false);
  });

  it("rejects out-of-range thumbSizePx", () => {
    expect(
      rangeSliderWidget.propsSchema.safeParse({ thumbSizePx: 4 }).success,
    ).toBe(false);
    expect(
      rangeSliderWidget.propsSchema.safeParse({ thumbSizePx: 100 }).success,
    ).toBe(false);
  });

  it("pairs the widget with a non-null React component in the bundled registration", () => {
    expect(rangeSliderRegistration.widget).toBe(rangeSliderWidget);
    expect(typeof rangeSliderRegistration.Component).toBe("function");
  });
});

describe("computeRangeFillPercent", () => {
  it("returns 0 for value at min", () => {
    expect(computeRangeFillPercent(0, 0, 100)).toBe(0);
  });

  it("returns 100 for value at max", () => {
    expect(computeRangeFillPercent(100, 0, 100)).toBe(100);
  });

  it("returns 50 for value at midpoint", () => {
    expect(computeRangeFillPercent(50, 0, 100)).toBe(50);
  });

  it("clamps to 0 below min", () => {
    expect(computeRangeFillPercent(-50, 0, 100)).toBe(0);
  });

  it("clamps to 100 above max", () => {
    expect(computeRangeFillPercent(200, 0, 100)).toBe(100);
  });

  it("handles fractional ranges", () => {
    expect(computeRangeFillPercent(0.25, 0, 1)).toBe(25);
    expect(computeRangeFillPercent(0.5, 0, 1)).toBe(50);
  });

  it("returns 0 when max <= min (degenerate range)", () => {
    expect(computeRangeFillPercent(50, 100, 100)).toBe(0);
    expect(computeRangeFillPercent(50, 100, 50)).toBe(0);
  });

  it("handles negative min", () => {
    expect(computeRangeFillPercent(0, -50, 50)).toBe(50);
    expect(computeRangeFillPercent(-25, -50, 50)).toBe(25);
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

describe("Hyperscape meta-plugin — range slider widget contribution", () => {
  it("onEnable calls ctx.widgets.register with the range slider registration", () => {
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
    expect(registered).toContain(rangeSliderRegistration);
  });
});

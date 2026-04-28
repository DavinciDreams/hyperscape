/**
 * SegmentedControlWidget — definition + plugin onEnable
 * contribution test. Mirrors the established widget-test pattern.
 */

import { describe, expect, it, vi } from "vitest";
import defaultFactory, {
  type HyperscapeContext,
  SEGMENTED_CONTROL_ORIENTATIONS,
  type SegmentedControlOrientation,
  nextEnabledIndex,
  segmentedControlRegistration,
  segmentedControlWidget,
} from "../../index.js";

describe("SegmentedControlWidget — definition", () => {
  it("declares a stable manifest id, category, and default size", () => {
    expect(segmentedControlWidget.manifest.id).toBe(
      "com.hyperforge.hyperscape.segmented-control",
    );
    expect(segmentedControlWidget.manifest.category).toBe("panel");
    expect(segmentedControlWidget.manifest.defaultSize).toEqual({
      width: 32,
      height: 6,
    });
  });

  it("default props match a sensible base", () => {
    expect(segmentedControlWidget.defaultProps).toMatchObject({
      options: [],
      value: "",
      orientation: "horizontal",
      paddingYPx: 6,
      paddingXPx: 12,
      fontSize: 12,
      disabledOpacity: 0.4,
    });
  });

  it("SEGMENTED_CONTROL_ORIENTATIONS covers row/column", () => {
    expect(SEGMENTED_CONTROL_ORIENTATIONS).toEqual(["horizontal", "vertical"]);
  });

  it("schema accepts a populated runtime payload", () => {
    const parsed = segmentedControlWidget.propsSchema.safeParse({
      options: [
        { id: "stab", label: "Stab", icon: "🗡️" },
        { id: "slash", label: "Slash" },
        { id: "crush", label: "Crush", disabled: true },
      ],
      value: "stab",
      orientation: "horizontal",
      ariaLabel: "Attack style",
      backgroundColor: "#222",
      borderColor: "#444",
      borderRadiusPx: 8,
      textColor: "#aaa",
      activeBackgroundColor: "rgba(255,216,77,0.2)",
      activeTextColor: "#ffd84d",
      hoverBackgroundColor: "rgba(255,255,255,0.05)",
      paddingYPx: 8,
      paddingXPx: 16,
      fontSize: 13,
      disabledOpacity: 0.3,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects unknown orientation", () => {
    expect(
      segmentedControlWidget.propsSchema.safeParse({
        orientation: "diagonal" as unknown as SegmentedControlOrientation,
      }).success,
    ).toBe(false);
  });

  it("rejects empty option id or label", () => {
    expect(
      segmentedControlWidget.propsSchema.safeParse({
        options: [{ id: "", label: "X" }],
      }).success,
    ).toBe(false);
    expect(
      segmentedControlWidget.propsSchema.safeParse({
        options: [{ id: "x", label: "" }],
      }).success,
    ).toBe(false);
  });

  it("rejects out-of-range disabledOpacity", () => {
    expect(
      segmentedControlWidget.propsSchema.safeParse({ disabledOpacity: -0.1 })
        .success,
    ).toBe(false);
    expect(
      segmentedControlWidget.propsSchema.safeParse({ disabledOpacity: 1.5 })
        .success,
    ).toBe(false);
  });

  it("pairs the widget with a non-null React component in the bundled registration", () => {
    expect(segmentedControlRegistration.widget).toBe(segmentedControlWidget);
    expect(typeof segmentedControlRegistration.Component).toBe("function");
  });
});

describe("nextEnabledIndex", () => {
  it("cycles forward through enabled options", () => {
    const opts = [
      { disabled: false },
      { disabled: false },
      { disabled: false },
    ];
    expect(nextEnabledIndex(opts, 0, 1)).toBe(1);
    expect(nextEnabledIndex(opts, 1, 1)).toBe(2);
    expect(nextEnabledIndex(opts, 2, 1)).toBe(0); // wraps
  });

  it("cycles backward through enabled options", () => {
    const opts = [
      { disabled: false },
      { disabled: false },
      { disabled: false },
    ];
    expect(nextEnabledIndex(opts, 1, -1)).toBe(0);
    expect(nextEnabledIndex(opts, 0, -1)).toBe(2); // wraps
  });

  it("skips disabled entries", () => {
    const opts = [{ disabled: false }, { disabled: true }, { disabled: false }];
    expect(nextEnabledIndex(opts, 0, 1)).toBe(2);
    expect(nextEnabledIndex(opts, 2, -1)).toBe(0);
  });

  it("returns input when no enabled options exist", () => {
    const opts = [{ disabled: true }, { disabled: true }];
    expect(nextEnabledIndex(opts, 0, 1)).toBe(0);
  });

  it("returns input when array is empty", () => {
    expect(nextEnabledIndex([], 5, 1)).toBe(5);
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

describe("Hyperscape meta-plugin — segmented control widget contribution", () => {
  it("onEnable calls ctx.widgets.register with the segmented control registration", () => {
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
    expect(registered).toContain(segmentedControlRegistration);
  });
});

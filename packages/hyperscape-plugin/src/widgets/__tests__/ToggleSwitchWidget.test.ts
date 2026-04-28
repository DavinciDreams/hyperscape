/**
 * ToggleSwitchWidget — definition + plugin onEnable
 * contribution test. Mirrors the established widget-test pattern.
 */

import { describe, expect, it, vi } from "vitest";
import defaultFactory, {
  type HyperscapeContext,
  toggleSwitchRegistration,
  toggleSwitchWidget,
} from "../../index.js";

describe("ToggleSwitchWidget — definition", () => {
  it("declares a stable manifest id, category, and default size", () => {
    expect(toggleSwitchWidget.manifest.id).toBe(
      "com.hyperforge.hyperscape.toggle-switch",
    );
    expect(toggleSwitchWidget.manifest.category).toBe("panel");
    expect(toggleSwitchWidget.manifest.defaultSize).toEqual({
      width: 24,
      height: 6,
    });
  });

  it("default props match a sensible base", () => {
    expect(toggleSwitchWidget.defaultProps).toMatchObject({
      checked: false,
      disabled: false,
      label: "",
      description: "",
      orientation: "row",
      trackWidthPx: 36,
      trackHeightPx: 20,
      thumbSizePx: 0,
      thumbInsetPx: 2,
      labelFontSize: 13,
      descriptionFontSize: 11,
    });
  });

  it("schema accepts a populated runtime payload", () => {
    const parsed = toggleSwitchWidget.propsSchema.safeParse({
      checked: true,
      disabled: false,
      label: "Reduced Motion",
      description: "Reduce animations and transitions",
      orientation: "stacked",
      trackWidthPx: 48,
      trackHeightPx: 24,
      thumbSizePx: 18,
      thumbInsetPx: 3,
      offTrackColor: "#222",
      onTrackColor: "#0f0",
      trackBorderColor: "#444",
      thumbColor: "#fff",
      labelColor: "#eee",
      descriptionColor: "#888",
      labelFontSize: 14,
      descriptionFontSize: 12,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects unknown orientation", () => {
    expect(
      toggleSwitchWidget.propsSchema.safeParse({
        orientation: "diagonal",
      }).success,
    ).toBe(false);
  });

  it("rejects out-of-range trackWidthPx", () => {
    expect(
      toggleSwitchWidget.propsSchema.safeParse({ trackWidthPx: 10 }).success,
    ).toBe(false);
    expect(
      toggleSwitchWidget.propsSchema.safeParse({ trackWidthPx: 500 }).success,
    ).toBe(false);
  });

  it("rejects out-of-range trackHeightPx", () => {
    expect(
      toggleSwitchWidget.propsSchema.safeParse({ trackHeightPx: 4 }).success,
    ).toBe(false);
    expect(
      toggleSwitchWidget.propsSchema.safeParse({ trackHeightPx: 200 }).success,
    ).toBe(false);
  });

  it("rejects out-of-range thumbInsetPx", () => {
    expect(
      toggleSwitchWidget.propsSchema.safeParse({ thumbInsetPx: -1 }).success,
    ).toBe(false);
    expect(
      toggleSwitchWidget.propsSchema.safeParse({ thumbInsetPx: 100 }).success,
    ).toBe(false);
  });

  it("pairs the widget with a non-null React component in the bundled registration", () => {
    expect(toggleSwitchRegistration.widget).toBe(toggleSwitchWidget);
    expect(typeof toggleSwitchRegistration.Component).toBe("function");
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

describe("Hyperscape meta-plugin — toggle switch widget contribution", () => {
  it("onEnable calls ctx.widgets.register with the toggle switch registration", () => {
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
    expect(registered).toContain(toggleSwitchRegistration);
  });
});

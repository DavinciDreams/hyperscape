/**
 * EmptyStateWidget — definition + plugin onEnable
 * contribution test. Mirrors the established widget-test pattern.
 */

import { describe, expect, it, vi } from "vitest";
import defaultFactory, {
  type HyperscapeContext,
  emptyStateRegistration,
  emptyStateWidget,
} from "../../index.js";

describe("EmptyStateWidget — definition", () => {
  it("declares a stable manifest id, category, and default size", () => {
    expect(emptyStateWidget.manifest.id).toBe(
      "com.hyperforge.hyperscape.empty-state",
    );
    expect(emptyStateWidget.manifest.category).toBe("panel");
    expect(emptyStateWidget.manifest.defaultSize).toEqual({
      width: 32,
      height: 24,
    });
  });

  it("default props match a sensible base", () => {
    expect(emptyStateWidget.defaultProps).toMatchObject({
      icon: "",
      title: "Nothing here yet",
      body: "",
      actionLabel: "",
      primaryAction: true,
      borderRadiusPx: 8,
      paddingYPx: 32,
      paddingXPx: 24,
      iconFontSize: 48,
      titleFontSize: 15,
      bodyFontSize: 13,
    });
  });

  it("schema accepts a populated runtime payload", () => {
    const parsed = emptyStateWidget.propsSchema.safeParse({
      icon: "📦",
      title: "Your inventory is empty",
      body: "Pick up items from the world or buy them at a store.",
      actionLabel: "Open store",
      primaryAction: true,
      backgroundColor: "rgba(20,24,36,0.5)",
      borderColor: "#3a3f4d",
      borderRadiusPx: 12,
      paddingYPx: 48,
      paddingXPx: 32,
      iconFontSize: 64,
      titleColor: "#fff",
      bodyColor: "#aaa",
      titleFontSize: 16,
      bodyFontSize: 14,
      actionPrimaryBackgroundColor: "#ffd84d",
      actionPrimaryHoverColor: "#ffe278",
      actionPrimaryTextColor: "#0f1119",
      actionSecondaryBorderColor: "#3a3f4d",
      actionSecondaryHoverBackground: "rgba(255,255,255,0.04)",
      actionSecondaryTextColor: "#e6e8ec",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects out-of-range paddingYPx", () => {
    expect(
      emptyStateWidget.propsSchema.safeParse({ paddingYPx: -1 }).success,
    ).toBe(false);
    expect(
      emptyStateWidget.propsSchema.safeParse({ paddingYPx: 256 }).success,
    ).toBe(false);
  });

  it("rejects out-of-range iconFontSize", () => {
    expect(
      emptyStateWidget.propsSchema.safeParse({ iconFontSize: 4 }).success,
    ).toBe(false);
    expect(
      emptyStateWidget.propsSchema.safeParse({ iconFontSize: 200 }).success,
    ).toBe(false);
  });

  it("rejects out-of-range titleFontSize", () => {
    expect(
      emptyStateWidget.propsSchema.safeParse({ titleFontSize: 4 }).success,
    ).toBe(false);
    expect(
      emptyStateWidget.propsSchema.safeParse({ titleFontSize: 100 }).success,
    ).toBe(false);
  });

  it("pairs the widget with a non-null React component in the bundled registration", () => {
    expect(emptyStateRegistration.widget).toBe(emptyStateWidget);
    expect(typeof emptyStateRegistration.Component).toBe("function");
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

describe("Hyperscape meta-plugin — empty state widget contribution", () => {
  it("onEnable calls ctx.widgets.register with the empty state registration", () => {
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
    expect(registered).toContain(emptyStateRegistration);
  });
});

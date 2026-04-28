/**
 * ContextMenuWidget — definition + plugin onEnable
 * contribution test. Mirrors the established widget-test pattern.
 */

import { describe, expect, it, vi } from "vitest";
import defaultFactory, {
  type HyperscapeContext,
  contextMenuRegistration,
  contextMenuWidget,
} from "../../index.js";

describe("ContextMenuWidget — definition", () => {
  it("declares a stable manifest id, category, and default size", () => {
    expect(contextMenuWidget.manifest.id).toBe(
      "com.hyperforge.hyperscape.context-menu",
    );
    expect(contextMenuWidget.manifest.category).toBe("menu");
    expect(contextMenuWidget.manifest.defaultSize).toEqual({
      width: 24,
      height: 32,
    });
  });

  it("default props match a sensible base", () => {
    expect(contextMenuWidget.defaultProps).toMatchObject({
      visible: false,
      title: "",
      items: [],
      minWidthPx: 160,
      maxHeightPx: 0,
      fontSize: 12,
    });
  });

  it("schema accepts a populated runtime payload", () => {
    const parsed = contextMenuWidget.propsSchema.safeParse({
      visible: true,
      x: 320,
      y: 480,
      title: "Lobster",
      items: [
        { id: "offer-1", label: "Offer 1", accent: true },
        { id: "offer-5", label: "Offer-5" },
        { id: "examine", label: "Examine" },
        { id: "value", label: "Value", disabled: true },
      ],
      minWidthPx: 200,
      maxHeightPx: 400,
      backgroundColor: "#101522",
      borderColor: "#222",
      borderRadiusPx: 8,
      headerBackgroundColor: "#1a2030",
      titleColor: "#ffd84d",
      itemTextColor: "#eee",
      accentTextColor: "#ff0",
      hoverBackgroundColor: "rgba(255,255,255,0.1)",
      disabledTextColor: "#444",
      fontSize: 14,
      zIndex: 3000,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects empty item id or label", () => {
    expect(
      contextMenuWidget.propsSchema.safeParse({
        items: [{ id: "", label: "X" }],
      }).success,
    ).toBe(false);
    expect(
      contextMenuWidget.propsSchema.safeParse({
        items: [{ id: "x", label: "" }],
      }).success,
    ).toBe(false);
  });

  it("rejects out-of-range minWidthPx", () => {
    expect(
      contextMenuWidget.propsSchema.safeParse({ minWidthPx: 50 }).success,
    ).toBe(false);
    expect(
      contextMenuWidget.propsSchema.safeParse({ minWidthPx: 1_000 }).success,
    ).toBe(false);
  });

  it("rejects negative maxHeightPx", () => {
    expect(
      contextMenuWidget.propsSchema.safeParse({ maxHeightPx: -1 }).success,
    ).toBe(false);
  });

  it("pairs the widget with a non-null React component in the bundled registration", () => {
    expect(contextMenuRegistration.widget).toBe(contextMenuWidget);
    expect(typeof contextMenuRegistration.Component).toBe("function");
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

describe("Hyperscape meta-plugin — context menu widget contribution", () => {
  it("onEnable calls ctx.widgets.register with the context menu registration", () => {
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
    expect(registered).toContain(contextMenuRegistration);
  });
});

/**
 * FloatingXPDropsWidget — definition + plugin onEnable
 * contribution test. Mirrors the established widget-test pattern.
 */

import { describe, expect, it, vi } from "vitest";
import defaultFactory, {
  type HyperscapeContext,
  floatingXPDropsRegistration,
  floatingXPDropsWidget,
} from "../../index.js";

describe("FloatingXPDropsWidget — definition", () => {
  it("declares a stable manifest id, category, and default size", () => {
    expect(floatingXPDropsWidget.manifest.id).toBe(
      "com.hyperforge.hyperscape.floating-xp-drops",
    );
    expect(floatingXPDropsWidget.manifest.category).toBe("hud");
    expect(floatingXPDropsWidget.manifest.defaultSize).toEqual({
      width: 24,
      height: 16,
    });
  });

  it("default props match the legacy floating-xp element", () => {
    expect(floatingXPDropsWidget.defaultProps).toMatchObject({
      drops: [],
      animationMs: 1_500,
      accentColor: "#ffd84d",
      fontSize: 20,
      iconFontSize: 18,
      fontWeight: 700,
    });
  });

  it("schema accepts a populated drop list", () => {
    const parsed = floatingXPDropsWidget.propsSchema.safeParse({
      drops: [
        { id: "drop-1", totalAmount: 125, icons: ["⚔️", "🛡️"] },
        { id: "drop-2", totalAmount: 50, icons: ["🪓"] },
      ],
      topOffsetCss: "calc(72px + env(safe-area-inset-top))",
      zIndex: 950,
      animationMs: 2_000,
      accentColor: "#fff",
      fontSize: 24,
      iconFontSize: 22,
      fontWeight: "bold",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects negative totalAmount", () => {
    expect(
      floatingXPDropsWidget.propsSchema.safeParse({
        drops: [{ id: "x", totalAmount: -1, icons: ["⭐"] }],
      }).success,
    ).toBe(false);
  });

  it("rejects empty id on a drop", () => {
    expect(
      floatingXPDropsWidget.propsSchema.safeParse({
        drops: [{ id: "", totalAmount: 1, icons: ["⭐"] }],
      }).success,
    ).toBe(false);
  });

  it("rejects out-of-range animationMs", () => {
    expect(
      floatingXPDropsWidget.propsSchema.safeParse({ animationMs: 50 }).success,
    ).toBe(false);
    expect(
      floatingXPDropsWidget.propsSchema.safeParse({ animationMs: 20_000 })
        .success,
    ).toBe(false);
  });

  it("pairs the widget with a non-null React component in the bundled registration", () => {
    expect(floatingXPDropsRegistration.widget).toBe(floatingXPDropsWidget);
    expect(typeof floatingXPDropsRegistration.Component).toBe("function");
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

describe("Hyperscape meta-plugin — floating xp drops widget contribution", () => {
  it("onEnable calls ctx.widgets.register with the floating xp drops registration", () => {
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
    expect(registered).toContain(floatingXPDropsRegistration);
  });
});

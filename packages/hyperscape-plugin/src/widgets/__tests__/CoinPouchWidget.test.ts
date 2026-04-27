/**
 * CoinPouchWidget — definition + plugin onEnable
 * contribution test. Mirrors the established widget-test pattern.
 */

import { describe, expect, it, vi } from "vitest";
import defaultFactory, {
  type HyperscapeContext,
  coinPouchRegistration,
  coinPouchWidget,
} from "../../index.js";

describe("CoinPouchWidget — definition", () => {
  it("declares a stable manifest id, category, and default size", () => {
    expect(coinPouchWidget.manifest.id).toBe(
      "com.hyperforge.hyperscape.coin-pouch",
    );
    expect(coinPouchWidget.manifest.category).toBe("panel");
    expect(coinPouchWidget.manifest.defaultSize).toEqual({
      width: 32,
      height: 4,
    });
  });

  it("default props match the legacy hand-coded pouch", () => {
    expect(coinPouchWidget.defaultProps).toMatchObject({
      coins: 0,
      label: "Coins",
      icon: "💰",
      ariaLabelTemplate: "Money pouch: {count} coins. Press Enter to withdraw.",
      fontSize: 12,
      iconFontSize: 16,
    });
  });

  it("schema accepts a populated runtime payload", () => {
    const parsed = coinPouchWidget.propsSchema.safeParse({
      coins: 12_345,
      label: "GP",
      icon: "🪙",
      ariaLabelTemplate: "Pouch holds {count}",
      backgroundTopColor: "#222",
      backgroundBottomColor: "#111",
      borderColor: "#444",
      labelTextColor: "#aaa",
      amountTextColor: "#ffd84d",
      focusRingColor: "#0ff",
      fontSize: 14,
      iconFontSize: 20,
      paddingYPx: 6,
      paddingXPx: 10,
      borderRadiusPx: 6,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects negative coin balance", () => {
    expect(coinPouchWidget.propsSchema.safeParse({ coins: -1 }).success).toBe(
      false,
    );
  });

  it("rejects empty icon", () => {
    expect(coinPouchWidget.propsSchema.safeParse({ icon: "" }).success).toBe(
      false,
    );
  });

  it("rejects out-of-range fontSize", () => {
    expect(
      coinPouchWidget.propsSchema.safeParse({ fontSize: 100 }).success,
    ).toBe(false);
    expect(coinPouchWidget.propsSchema.safeParse({ fontSize: 0 }).success).toBe(
      false,
    );
  });

  it("rejects out-of-range paddingXPx", () => {
    expect(
      coinPouchWidget.propsSchema.safeParse({ paddingXPx: 100 }).success,
    ).toBe(false);
  });

  it("pairs the widget with a non-null React component in the bundled registration", () => {
    expect(coinPouchRegistration.widget).toBe(coinPouchWidget);
    expect(typeof coinPouchRegistration.Component).toBe("function");
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

describe("Hyperscape meta-plugin — coin pouch widget contribution", () => {
  it("onEnable calls ctx.widgets.register with the coin pouch registration", () => {
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
    expect(registered).toContain(coinPouchRegistration);
  });
});

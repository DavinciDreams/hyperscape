/**
 * QuantityPromptWidget — definition + plugin onEnable
 * contribution test. Mirrors the established widget-test pattern.
 */

import { describe, expect, it, vi } from "vitest";
import defaultFactory, {
  type HyperscapeContext,
  parseQuantityInput,
  quantityPromptRegistration,
  quantityPromptWidget,
} from "../../index.js";

describe("QuantityPromptWidget — definition", () => {
  it("declares a stable manifest id, category, and default size", () => {
    expect(quantityPromptWidget.manifest.id).toBe(
      "com.hyperforge.hyperscape.quantity-prompt",
    );
    expect(quantityPromptWidget.manifest.category).toBe("modal");
    expect(quantityPromptWidget.manifest.defaultSize).toEqual({
      width: 32,
      height: 24,
    });
  });

  it("default props match the legacy hand-coded prompt", () => {
    expect(quantityPromptWidget.defaultProps).toMatchObject({
      visible: false,
      title: "How many would you like to offer?",
      itemName: "",
      maxQuantity: 0,
      placeholder: "e.g. 10, 1k, 1.5m",
      confirmLabel: "Confirm",
      cancelLabel: "Cancel",
      widthPx: 280,
    });
  });

  it("schema accepts a populated runtime payload", () => {
    const parsed = quantityPromptWidget.propsSchema.safeParse({
      visible: true,
      title: "Offer X",
      itemName: "Lobster",
      maxQuantity: 1_234,
      placeholder: "qty",
      confirmLabel: "Offer",
      cancelLabel: "Nope",
      widthPx: 320,
      backdropColor: "rgba(0,0,0,0.5)",
      panelBackgroundColor: "#101522",
      panelBorderColor: "#222",
      headerBackgroundColor: "#1a2030",
      titleColor: "#ffd84d",
      secondaryTextColor: "#888",
      textColor: "#eee",
      inputBackgroundColor: "#111",
      inputBorderColor: "#444",
      confirmAccentColor: "#0f0",
      cancelAccentColor: "#f00",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects negative maxQuantity", () => {
    expect(
      quantityPromptWidget.propsSchema.safeParse({ maxQuantity: -1 }).success,
    ).toBe(false);
  });

  it("rejects out-of-range widthPx", () => {
    expect(
      quantityPromptWidget.propsSchema.safeParse({ widthPx: 100 }).success,
    ).toBe(false);
    expect(
      quantityPromptWidget.propsSchema.safeParse({ widthPx: 2_000 }).success,
    ).toBe(false);
  });

  it("pairs the widget with a non-null React component in the bundled registration", () => {
    expect(quantityPromptRegistration.widget).toBe(quantityPromptWidget);
    expect(typeof quantityPromptRegistration.Component).toBe("function");
  });
});

describe("parseQuantityInput", () => {
  it("parses plain integers", () => {
    expect(parseQuantityInput("5")).toBe(5);
    expect(parseQuantityInput("100")).toBe(100);
    expect(parseQuantityInput(" 42 ")).toBe(42);
  });

  it("parses K suffix as thousands", () => {
    expect(parseQuantityInput("1k")).toBe(1_000);
    expect(parseQuantityInput("2.5K")).toBe(2_500);
  });

  it("parses M suffix as millions", () => {
    expect(parseQuantityInput("1m")).toBe(1_000_000);
    expect(parseQuantityInput("2.5m")).toBe(2_500_000);
  });

  it("returns 0 for unparseable input", () => {
    expect(parseQuantityInput("")).toBe(0);
    expect(parseQuantityInput("abc")).toBe(0);
    expect(parseQuantityInput("-5")).toBe(0);
    expect(parseQuantityInput("1g")).toBe(0);
  });

  it("floors fractional parts after suffix multiplication", () => {
    expect(parseQuantityInput("1.5k")).toBe(1_500);
    expect(parseQuantityInput("2.7")).toBe(2);
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

describe("Hyperscape meta-plugin — quantity prompt widget contribution", () => {
  it("onEnable calls ctx.widgets.register with the quantity prompt registration", () => {
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
    expect(registered).toContain(quantityPromptRegistration);
  });
});

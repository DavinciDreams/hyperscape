/**
 * SelectOptionWidget — definition + plugin onEnable
 * contribution test. Mirrors the established widget-test pattern.
 */

import { describe, expect, it, vi } from "vitest";
import defaultFactory, {
  type HyperscapeContext,
  selectOptionRegistration,
  selectOptionWidget,
} from "../../index.js";

describe("SelectOptionWidget — definition", () => {
  it("declares a stable manifest id, category, and default size", () => {
    expect(selectOptionWidget.manifest.id).toBe(
      "com.hyperforge.hyperscape.select-option",
    );
    expect(selectOptionWidget.manifest.category).toBe("panel");
    expect(selectOptionWidget.manifest.defaultSize).toEqual({
      width: 16,
      height: 4,
    });
  });

  it("default props match the legacy hand-coded select", () => {
    expect(selectOptionWidget.defaultProps).toMatchObject({
      options: [],
      value: "",
      fontSize: 14,
      paddingYPx: 4,
      paddingXPx: 8,
      borderRadiusPx: 4,
    });
  });

  it("schema accepts a populated runtime payload", () => {
    const parsed = selectOptionWidget.propsSchema.safeParse({
      options: [
        { label: "Low", value: "low" },
        { label: "Medium", value: "medium" },
        { label: "High", value: "high" },
      ],
      value: "medium",
      id: "quality-select",
      backgroundColor: "#222",
      textColor: "#eee",
      borderColor: "#444",
      fontSize: 16,
      paddingYPx: 6,
      paddingXPx: 10,
      borderRadiusPx: 6,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects empty option label", () => {
    expect(
      selectOptionWidget.propsSchema.safeParse({
        options: [{ label: "", value: "x" }],
      }).success,
    ).toBe(false);
  });

  it("rejects empty option value", () => {
    expect(
      selectOptionWidget.propsSchema.safeParse({
        options: [{ label: "X", value: "" }],
      }).success,
    ).toBe(false);
  });

  it("rejects out-of-range fontSize", () => {
    expect(
      selectOptionWidget.propsSchema.safeParse({ fontSize: 100 }).success,
    ).toBe(false);
    expect(
      selectOptionWidget.propsSchema.safeParse({ fontSize: 0 }).success,
    ).toBe(false);
  });

  it("rejects out-of-range borderRadiusPx", () => {
    expect(
      selectOptionWidget.propsSchema.safeParse({ borderRadiusPx: 100 }).success,
    ).toBe(false);
  });

  it("pairs the widget with a non-null React component in the bundled registration", () => {
    expect(selectOptionRegistration.widget).toBe(selectOptionWidget);
    expect(typeof selectOptionRegistration.Component).toBe("function");
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

describe("Hyperscape meta-plugin — select option widget contribution", () => {
  it("onEnable calls ctx.widgets.register with the select option registration", () => {
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
    expect(registered).toContain(selectOptionRegistration);
  });
});

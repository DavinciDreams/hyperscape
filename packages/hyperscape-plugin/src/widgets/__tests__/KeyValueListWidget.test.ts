/**
 * KeyValueListWidget — definition + plugin onEnable
 * contribution test. Mirrors the established widget-test pattern.
 */

import { describe, expect, it, vi } from "vitest";
import defaultFactory, {
  type HyperscapeContext,
  keyValueListRegistration,
  keyValueListWidget,
} from "../../index.js";

describe("KeyValueListWidget — definition", () => {
  it("declares a stable manifest id, category, and default size", () => {
    expect(keyValueListWidget.manifest.id).toBe(
      "com.hyperforge.hyperscape.key-value-list",
    );
    expect(keyValueListWidget.manifest.category).toBe("panel");
    expect(keyValueListWidget.manifest.defaultSize).toEqual({
      width: 32,
      height: 24,
    });
  });

  it("default props match a sensible base", () => {
    expect(keyValueListWidget.defaultProps).toMatchObject({
      title: "",
      rows: [],
      columnGapPx: 16,
      rowGapPx: 4,
      monospace: false,
      divided: false,
      paddingPx: 0,
      titleFontSize: 13,
      fontSize: 12,
    });
  });

  it("schema accepts a populated runtime payload", () => {
    const parsed = keyValueListWidget.propsSchema.safeParse({
      title: "Combat",
      rows: [
        { label: "Attack", value: "70" },
        { label: "Strength", value: "75", color: "#0f0" },
        { label: "Defense", value: "60", bold: true },
      ],
      columnGapPx: 24,
      rowGapPx: 6,
      monospace: true,
      divided: true,
      backgroundColor: "#101522",
      borderColor: "#222",
      borderRadiusPx: 8,
      paddingPx: 12,
      titleColor: "#ffd84d",
      labelColor: "#aaa",
      valueColor: "#fff",
      dividerColor: "#333",
      titleFontSize: 14,
      fontSize: 13,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a row with empty label", () => {
    expect(
      keyValueListWidget.propsSchema.safeParse({
        rows: [{ label: "", value: "x" }],
      }).success,
    ).toBe(false);
  });

  it("rejects out-of-range columnGapPx", () => {
    expect(
      keyValueListWidget.propsSchema.safeParse({ columnGapPx: -1 }).success,
    ).toBe(false);
    expect(
      keyValueListWidget.propsSchema.safeParse({ columnGapPx: 100 }).success,
    ).toBe(false);
  });

  it("rejects out-of-range fontSize and titleFontSize", () => {
    expect(
      keyValueListWidget.propsSchema.safeParse({ fontSize: 0 }).success,
    ).toBe(false);
    expect(
      keyValueListWidget.propsSchema.safeParse({ titleFontSize: 100 }).success,
    ).toBe(false);
  });

  it("pairs the widget with a non-null React component in the bundled registration", () => {
    expect(keyValueListRegistration.widget).toBe(keyValueListWidget);
    expect(typeof keyValueListRegistration.Component).toBe("function");
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

describe("Hyperscape meta-plugin — key-value list widget contribution", () => {
  it("onEnable calls ctx.widgets.register with the key-value list registration", () => {
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
    expect(registered).toContain(keyValueListRegistration);
  });
});

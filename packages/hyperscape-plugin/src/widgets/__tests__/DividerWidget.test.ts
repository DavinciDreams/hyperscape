/**
 * DividerWidget — definition + plugin onEnable
 * contribution test. Mirrors the established widget-test pattern.
 */

import { describe, expect, it, vi } from "vitest";
import defaultFactory, {
  type HyperscapeContext,
  DIVIDER_ORIENTATIONS,
  DIVIDER_STYLES,
  type DividerOrientation,
  type DividerStyle,
  dividerRegistration,
  dividerWidget,
} from "../../index.js";

describe("DividerWidget — definition", () => {
  it("declares a stable manifest id, category, and default size", () => {
    expect(dividerWidget.manifest.id).toBe("com.hyperforge.hyperscape.divider");
    expect(dividerWidget.manifest.category).toBe("panel");
    expect(dividerWidget.manifest.defaultSize).toEqual({
      width: 32,
      height: 2,
    });
  });

  it("default props match a sensible base", () => {
    expect(dividerWidget.defaultProps).toMatchObject({
      orientation: "horizontal",
      label: "",
      lineStyle: "solid",
      thicknessPx: 1,
      marginYPx: 8,
      marginXPx: 0,
      labelFontSize: 11,
      labelUppercase: true,
      labelGapPx: 12,
    });
  });

  it("DIVIDER_ORIENTATIONS covers horizontal/vertical", () => {
    expect(DIVIDER_ORIENTATIONS).toEqual(["horizontal", "vertical"]);
  });

  it("DIVIDER_STYLES covers solid/dashed/dotted", () => {
    expect(DIVIDER_STYLES).toEqual(["solid", "dashed", "dotted"]);
  });

  it("schema accepts every orientation and style", () => {
    for (const orientation of DIVIDER_ORIENTATIONS) {
      expect(dividerWidget.propsSchema.safeParse({ orientation }).success).toBe(
        true,
      );
    }
    for (const lineStyle of DIVIDER_STYLES) {
      expect(dividerWidget.propsSchema.safeParse({ lineStyle }).success).toBe(
        true,
      );
    }
  });

  it("rejects unknown orientation", () => {
    expect(
      dividerWidget.propsSchema.safeParse({
        orientation: "diagonal" as unknown as DividerOrientation,
      }).success,
    ).toBe(false);
  });

  it("rejects unknown lineStyle", () => {
    expect(
      dividerWidget.propsSchema.safeParse({
        lineStyle: "double" as unknown as DividerStyle,
      }).success,
    ).toBe(false);
  });

  it("schema accepts a populated runtime payload", () => {
    const parsed = dividerWidget.propsSchema.safeParse({
      orientation: "horizontal",
      label: "OR",
      lineStyle: "dashed",
      lineColor: "#444",
      thicknessPx: 2,
      marginYPx: 16,
      marginXPx: 4,
      labelColor: "#aaa",
      labelFontSize: 12,
      labelLetterSpacingPx: 0.8,
      labelUppercase: true,
      labelGapPx: 16,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects out-of-range thicknessPx", () => {
    expect(
      dividerWidget.propsSchema.safeParse({ thicknessPx: 0 }).success,
    ).toBe(false);
    expect(
      dividerWidget.propsSchema.safeParse({ thicknessPx: 20 }).success,
    ).toBe(false);
  });

  it("rejects out-of-range marginYPx", () => {
    expect(dividerWidget.propsSchema.safeParse({ marginYPx: -1 }).success).toBe(
      false,
    );
    expect(
      dividerWidget.propsSchema.safeParse({ marginYPx: 100 }).success,
    ).toBe(false);
  });

  it("rejects out-of-range labelLetterSpacingPx", () => {
    expect(
      dividerWidget.propsSchema.safeParse({ labelLetterSpacingPx: -10 })
        .success,
    ).toBe(false);
    expect(
      dividerWidget.propsSchema.safeParse({ labelLetterSpacingPx: 20 }).success,
    ).toBe(false);
  });

  it("pairs the widget with a non-null React component in the bundled registration", () => {
    expect(dividerRegistration.widget).toBe(dividerWidget);
    expect(typeof dividerRegistration.Component).toBe("function");
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

describe("Hyperscape meta-plugin — divider widget contribution", () => {
  it("onEnable calls ctx.widgets.register with the divider registration", () => {
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
    expect(registered).toContain(dividerRegistration);
  });
});

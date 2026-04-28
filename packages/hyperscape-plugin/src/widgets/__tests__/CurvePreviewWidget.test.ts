/**
 * CurvePreviewWidget — definition + plugin onEnable
 * contribution test. Mirrors the established widget-test pattern.
 */

import { describe, expect, it, vi } from "vitest";
import defaultFactory, {
  type HyperscapeContext,
  curvePreviewRegistration,
  curvePreviewWidget,
} from "../../index.js";

describe("CurvePreviewWidget — definition", () => {
  it("declares a stable manifest id, category, and default size", () => {
    expect(curvePreviewWidget.manifest.id).toBe(
      "com.hyperforge.hyperscape.curve-preview",
    );
    expect(curvePreviewWidget.manifest.category).toBe("panel");
    expect(curvePreviewWidget.manifest.defaultSize).toEqual({
      width: 32,
      height: 16,
    });
  });

  it("default props match the legacy hand-coded preview", () => {
    expect(curvePreviewWidget.defaultProps).toMatchObject({
      samples: [],
      yMin: 0,
      yMax: 1,
      widthPx: 200,
      heightPx: 100,
      lineWidth: 2,
      gridDivisions: 4,
      borderRadiusPx: 4,
    });
  });

  it("schema accepts a populated runtime payload", () => {
    const parsed = curvePreviewWidget.propsSchema.safeParse({
      samples: [0, 0.25, 0.5, 0.75, 1],
      yMin: 0,
      yMax: 1,
      widthPx: 320,
      heightPx: 120,
      backgroundColor: "#0a0a0a",
      gridColor: "rgba(255,255,255,0.05)",
      lineColor: "#0f0",
      lineWidth: 3,
      gridDivisions: 8,
      borderColor: "#222",
      borderRadiusPx: 8,
    });
    expect(parsed.success).toBe(true);
  });

  it("schema accepts negative yMin and large yMax", () => {
    const parsed = curvePreviewWidget.propsSchema.safeParse({
      samples: [-5, 0, 5],
      yMin: -10,
      yMax: 10,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects out-of-range widthPx", () => {
    expect(
      curvePreviewWidget.propsSchema.safeParse({ widthPx: 10 }).success,
    ).toBe(false);
    expect(
      curvePreviewWidget.propsSchema.safeParse({ widthPx: 4_000 }).success,
    ).toBe(false);
  });

  it("rejects out-of-range gridDivisions", () => {
    expect(
      curvePreviewWidget.propsSchema.safeParse({ gridDivisions: -1 }).success,
    ).toBe(false);
    expect(
      curvePreviewWidget.propsSchema.safeParse({ gridDivisions: 32 }).success,
    ).toBe(false);
  });

  it("rejects out-of-range lineWidth", () => {
    expect(
      curvePreviewWidget.propsSchema.safeParse({ lineWidth: 0 }).success,
    ).toBe(false);
    expect(
      curvePreviewWidget.propsSchema.safeParse({ lineWidth: 12 }).success,
    ).toBe(false);
  });

  it("pairs the widget with a non-null React component in the bundled registration", () => {
    expect(curvePreviewRegistration.widget).toBe(curvePreviewWidget);
    expect(typeof curvePreviewRegistration.Component).toBe("function");
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

describe("Hyperscape meta-plugin — curve preview widget contribution", () => {
  it("onEnable calls ctx.widgets.register with the curve preview registration", () => {
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
    expect(registered).toContain(curvePreviewRegistration);
  });
});

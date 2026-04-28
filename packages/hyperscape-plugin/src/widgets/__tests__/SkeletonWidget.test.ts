/**
 * SkeletonWidget — definition + plugin onEnable
 * contribution test. Mirrors the established widget-test pattern.
 */

import { describe, expect, it, vi } from "vitest";
import defaultFactory, {
  type HyperscapeContext,
  SKELETON_ANIMATIONS,
  SKELETON_SHAPES,
  type SkeletonAnimation,
  type SkeletonShape,
  skeletonRegistration,
  skeletonWidget,
} from "../../index.js";

describe("SkeletonWidget — definition", () => {
  it("declares a stable manifest id, category, and default size", () => {
    expect(skeletonWidget.manifest.id).toBe(
      "com.hyperforge.hyperscape.skeleton",
    );
    expect(skeletonWidget.manifest.category).toBe("panel");
    expect(skeletonWidget.manifest.defaultSize).toEqual({
      width: 24,
      height: 4,
    });
  });

  it("default props match a sensible base", () => {
    expect(skeletonWidget.defaultProps).toMatchObject({
      width: 120,
      height: 16,
      shape: "rect",
      animation: "pulse",
      animationDurationMs: 1_500,
      pulseMinOpacity: 0.5,
      pulseMaxOpacity: 1,
      roundedRadiusPx: 8,
    });
  });

  it("SKELETON_ANIMATIONS covers pulse/shimmer/none", () => {
    expect(SKELETON_ANIMATIONS).toEqual(["pulse", "shimmer", "none"]);
  });

  it("SKELETON_SHAPES covers rect/circle/rounded", () => {
    expect(SKELETON_SHAPES).toEqual(["rect", "circle", "rounded"]);
  });

  it("schema accepts every animation and shape", () => {
    for (const animation of SKELETON_ANIMATIONS) {
      expect(skeletonWidget.propsSchema.safeParse({ animation }).success).toBe(
        true,
      );
    }
    for (const shape of SKELETON_SHAPES) {
      expect(skeletonWidget.propsSchema.safeParse({ shape }).success).toBe(
        true,
      );
    }
  });

  it("rejects unknown animation", () => {
    expect(
      skeletonWidget.propsSchema.safeParse({
        animation: "spin" as unknown as SkeletonAnimation,
      }).success,
    ).toBe(false);
  });

  it("rejects unknown shape", () => {
    expect(
      skeletonWidget.propsSchema.safeParse({
        shape: "trapezoid" as unknown as SkeletonShape,
      }).success,
    ).toBe(false);
  });

  it("schema accepts a CSS string for width/height", () => {
    expect(
      skeletonWidget.propsSchema.safeParse({ width: "100%" }).success,
    ).toBe(true);
    expect(
      skeletonWidget.propsSchema.safeParse({ height: "12em" }).success,
    ).toBe(true);
  });

  it("schema accepts numeric width/height", () => {
    expect(
      skeletonWidget.propsSchema.safeParse({ width: 240, height: 32 }).success,
    ).toBe(true);
  });

  it("rejects out-of-range animationDurationMs", () => {
    expect(
      skeletonWidget.propsSchema.safeParse({ animationDurationMs: 50 }).success,
    ).toBe(false);
    expect(
      skeletonWidget.propsSchema.safeParse({ animationDurationMs: 50_000 })
        .success,
    ).toBe(false);
  });

  it("rejects out-of-range opacity values", () => {
    expect(
      skeletonWidget.propsSchema.safeParse({ pulseMinOpacity: -0.1 }).success,
    ).toBe(false);
    expect(
      skeletonWidget.propsSchema.safeParse({ pulseMaxOpacity: 1.5 }).success,
    ).toBe(false);
  });

  it("schema accepts a populated runtime payload", () => {
    const parsed = skeletonWidget.propsSchema.safeParse({
      width: "100%",
      height: 24,
      shape: "rounded",
      animation: "shimmer",
      animationDurationMs: 1_200,
      backgroundColor: "#222",
      shimmerColor: "rgba(255,255,255,0.08)",
      pulseMinOpacity: 0.6,
      pulseMaxOpacity: 0.95,
      roundedRadiusPx: 12,
    });
    expect(parsed.success).toBe(true);
  });

  it("pairs the widget with a non-null React component in the bundled registration", () => {
    expect(skeletonRegistration.widget).toBe(skeletonWidget);
    expect(typeof skeletonRegistration.Component).toBe("function");
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

describe("Hyperscape meta-plugin — skeleton widget contribution", () => {
  it("onEnable calls ctx.widgets.register with the skeleton registration", () => {
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
    expect(registered).toContain(skeletonRegistration);
  });
});

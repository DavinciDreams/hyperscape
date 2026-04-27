/**
 * MinimapCompassWidget — definition + plugin onEnable contribution
 * test. Mirrors the established widget-test pattern.
 */

import { describe, expect, it, vi } from "vitest";
import defaultFactory, {
  type HyperscapeContext,
  COMPASS_SIZES,
  minimapCompassRegistration,
  minimapCompassWidget,
  type CompassSize,
} from "../../index.js";

describe("MinimapCompassWidget — definition", () => {
  it("declares a stable manifest id, category, and default size", () => {
    expect(minimapCompassWidget.manifest.id).toBe(
      "com.hyperforge.hyperscape.minimap-compass",
    );
    expect(minimapCompassWidget.manifest.category).toBe("hud");
    expect(minimapCompassWidget.manifest.defaultSize).toEqual({
      width: 4,
      height: 4,
    });
  });

  it("default props match the legacy hand-coded compass", () => {
    expect(minimapCompassWidget.defaultProps).toMatchObject({
      yawDeg: 0,
      isCollapsed: false,
      size: "normal",
    });
  });

  it("COMPASS_SIZES is the canonical size-preset set", () => {
    expect(COMPASS_SIZES).toEqual(["compact", "small", "normal"]);
  });

  it("schema accepts every size preset", () => {
    for (const size of COMPASS_SIZES) {
      const parsed = minimapCompassWidget.propsSchema.safeParse({
        size,
        yawDeg: 90,
      });
      expect(parsed.success).toBe(true);
    }
  });

  it("rejects unknown size preset", () => {
    const parsed = minimapCompassWidget.propsSchema.safeParse({
      size: "huge" as unknown as CompassSize,
    });
    expect(parsed.success).toBe(false);
  });

  it("schema accepts arbitrary yaw values (no clamp)", () => {
    expect(
      minimapCompassWidget.propsSchema.safeParse({ yawDeg: -180 }).success,
    ).toBe(true);
    expect(
      minimapCompassWidget.propsSchema.safeParse({ yawDeg: 720 }).success,
    ).toBe(true);
  });

  it("pairs the widget with a non-null React component in the bundled registration", () => {
    expect(minimapCompassRegistration.widget).toBe(minimapCompassWidget);
    expect(typeof minimapCompassRegistration.Component).toBe("function");
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

describe("Hyperscape meta-plugin — minimap compass widget contribution", () => {
  it("onEnable calls ctx.widgets.register with the compass registration", () => {
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
    expect(registered).toContain(minimapCompassRegistration);
  });
});

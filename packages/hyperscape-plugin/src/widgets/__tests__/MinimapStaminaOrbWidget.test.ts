/**
 * MinimapStaminaOrbWidget — definition + plugin onEnable
 * contribution test. Mirrors the established widget-test pattern.
 */

import { describe, expect, it, vi } from "vitest";
import defaultFactory, {
  type HyperscapeContext,
  minimapStaminaOrbRegistration,
  minimapStaminaOrbWidget,
} from "../../index.js";

describe("MinimapStaminaOrbWidget — definition", () => {
  it("declares a stable manifest id, category, and default size", () => {
    expect(minimapStaminaOrbWidget.manifest.id).toBe(
      "com.hyperforge.hyperscape.minimap-stamina-orb",
    );
    expect(minimapStaminaOrbWidget.manifest.category).toBe("hud");
    expect(minimapStaminaOrbWidget.manifest.defaultSize).toEqual({
      width: 4,
      height: 4,
    });
  });

  it("default props match the legacy hand-coded orb", () => {
    expect(minimapStaminaOrbWidget.defaultProps).toMatchObject({
      stamina: 100,
      runMode: true,
      size: 44,
    });
  });

  it("schema accepts custom stamina + runMode + theming", () => {
    const parsed = minimapStaminaOrbWidget.propsSchema.safeParse({
      stamina: 67,
      runMode: false,
      size: 60,
      runFillStartColor: "#fff",
      runFillMidColor: "#aaa",
      runFillEndColor: "#000",
      runBorderColor: "#333",
      runGlowColor: "#444",
      walkFillStartColor: "#999",
      walkFillMidColor: "#888",
      walkFillEndColor: "#777",
      walkBorderColor: "#666",
      walkGlowColor: "#555",
      iconColor: "#222",
    });
    expect(parsed.success).toBe(true);
  });

  it("clamps stamina to [0, 100] in the runtime — but rejects out-of-range schema input", () => {
    expect(
      minimapStaminaOrbWidget.propsSchema.safeParse({ stamina: 150 }).success,
    ).toBe(false);
    expect(
      minimapStaminaOrbWidget.propsSchema.safeParse({ stamina: -5 }).success,
    ).toBe(false);
  });

  it("rejects out-of-range size", () => {
    expect(
      minimapStaminaOrbWidget.propsSchema.safeParse({ size: 4 }).success,
    ).toBe(false);
    expect(
      minimapStaminaOrbWidget.propsSchema.safeParse({ size: 1000 }).success,
    ).toBe(false);
  });

  it("pairs the widget with a non-null React component in the bundled registration", () => {
    expect(minimapStaminaOrbRegistration.widget).toBe(minimapStaminaOrbWidget);
    expect(typeof minimapStaminaOrbRegistration.Component).toBe("function");
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

describe("Hyperscape meta-plugin — minimap stamina orb widget contribution", () => {
  it("onEnable calls ctx.widgets.register with the stamina orb registration", () => {
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
    expect(registered).toContain(minimapStaminaOrbRegistration);
  });
});

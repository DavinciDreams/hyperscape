/**
 * MinimapHomeTeleportOrbWidget — definition + plugin onEnable
 * contribution test. Mirrors the established widget-test pattern.
 */

import { describe, expect, it, vi } from "vitest";
import defaultFactory, {
  type HyperscapeContext,
  HOME_TELEPORT_STATUSES,
  minimapHomeTeleportOrbRegistration,
  minimapHomeTeleportOrbWidget,
} from "../../index.js";

describe("MinimapHomeTeleportOrbWidget — definition", () => {
  it("declares a stable manifest id, category, and default size", () => {
    expect(minimapHomeTeleportOrbWidget.manifest.id).toBe(
      "com.hyperforge.hyperscape.minimap-home-teleport-orb",
    );
    expect(minimapHomeTeleportOrbWidget.manifest.category).toBe("hud");
    expect(minimapHomeTeleportOrbWidget.manifest.defaultSize).toEqual({
      width: 4,
      height: 4,
    });
  });

  it("default props match the legacy hand-coded orb", () => {
    expect(minimapHomeTeleportOrbWidget.defaultProps).toMatchObject({
      status: "ready",
      castProgressPct: 0,
      cooldownRemainingMs: 0,
      cooldownTotalMs: 60_000,
      size: 44,
    });
  });

  it("re-uses HomeTeleportStatus enum from the button widget", () => {
    expect(HOME_TELEPORT_STATUSES).toEqual(["ready", "casting", "cooldown"]);
    for (const status of HOME_TELEPORT_STATUSES) {
      const parsed = minimapHomeTeleportOrbWidget.propsSchema.safeParse({
        status,
      });
      expect(parsed.success).toBe(true);
    }
  });

  it("rejects out-of-range size", () => {
    expect(
      minimapHomeTeleportOrbWidget.propsSchema.safeParse({ size: 8 }).success,
    ).toBe(false);
    expect(
      minimapHomeTeleportOrbWidget.propsSchema.safeParse({ size: 1000 })
        .success,
    ).toBe(false);
  });

  it("rejects out-of-range castProgressPct", () => {
    expect(
      minimapHomeTeleportOrbWidget.propsSchema.safeParse({
        castProgressPct: 150,
      }).success,
    ).toBe(false);
    expect(
      minimapHomeTeleportOrbWidget.propsSchema.safeParse({
        castProgressPct: -5,
      }).success,
    ).toBe(false);
  });

  it("rejects zero cooldownTotalMs", () => {
    expect(
      minimapHomeTeleportOrbWidget.propsSchema.safeParse({
        cooldownTotalMs: 0,
      }).success,
    ).toBe(false);
  });

  it("pairs the widget with a non-null React component in the bundled registration", () => {
    expect(minimapHomeTeleportOrbRegistration.widget).toBe(
      minimapHomeTeleportOrbWidget,
    );
    expect(typeof minimapHomeTeleportOrbRegistration.Component).toBe(
      "function",
    );
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

describe("Hyperscape meta-plugin — minimap home teleport orb widget contribution", () => {
  it("onEnable calls ctx.widgets.register with the orb registration", () => {
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
    expect(registered).toContain(minimapHomeTeleportOrbRegistration);
  });
});

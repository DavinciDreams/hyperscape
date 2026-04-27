/**
 * HomeTeleportButtonWidget — definition + plugin onEnable
 * contribution test. Mirrors the established widget-test pattern.
 */

import { describe, expect, it, vi } from "vitest";
import defaultFactory, {
  type HyperscapeContext,
  HOME_TELEPORT_STATUSES,
  homeTeleportButtonRegistration,
  homeTeleportButtonWidget,
  type HomeTeleportStatus,
} from "../../index.js";

describe("HomeTeleportButtonWidget — definition", () => {
  it("declares a stable manifest id, category, and default size", () => {
    expect(homeTeleportButtonWidget.manifest.id).toBe(
      "com.hyperforge.hyperscape.home-teleport-button",
    );
    expect(homeTeleportButtonWidget.manifest.category).toBe("hud");
    expect(homeTeleportButtonWidget.manifest.defaultSize).toEqual({
      width: 6,
      height: 6,
    });
  });

  it("default props match the legacy hand-coded button", () => {
    expect(homeTeleportButtonWidget.defaultProps).toMatchObject({
      status: "ready",
      castProgressPct: 0,
      cooldownRemainingMs: 0,
      cooldownTotalMs: 60_000,
      mobile: false,
      icon: "🏠",
      readyLabel: "Home",
      castingLabel: "Cancel",
    });
  });

  it("HOME_TELEPORT_STATUSES is the canonical state set", () => {
    expect(HOME_TELEPORT_STATUSES).toEqual(["ready", "casting", "cooldown"]);
  });

  it("schema accepts every status value", () => {
    for (const status of HOME_TELEPORT_STATUSES) {
      const parsed = homeTeleportButtonWidget.propsSchema.safeParse({
        status,
      });
      expect(parsed.success).toBe(true);
    }
  });

  it("rejects unknown status", () => {
    const parsed = homeTeleportButtonWidget.propsSchema.safeParse({
      status: "ascending" as unknown as HomeTeleportStatus,
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects out-of-range castProgressPct", () => {
    expect(
      homeTeleportButtonWidget.propsSchema.safeParse({ castProgressPct: 150 })
        .success,
    ).toBe(false);
    expect(
      homeTeleportButtonWidget.propsSchema.safeParse({ castProgressPct: -1 })
        .success,
    ).toBe(false);
  });

  it("rejects zero or negative cooldownTotalMs", () => {
    expect(
      homeTeleportButtonWidget.propsSchema.safeParse({ cooldownTotalMs: 0 })
        .success,
    ).toBe(false);
  });

  it("pairs the widget with a non-null React component in the bundled registration", () => {
    expect(homeTeleportButtonRegistration.widget).toBe(
      homeTeleportButtonWidget,
    );
    expect(typeof homeTeleportButtonRegistration.Component).toBe("function");
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

describe("Hyperscape meta-plugin — home teleport button widget contribution", () => {
  it("onEnable calls ctx.widgets.register with the home teleport button registration", () => {
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
    expect(registered).toContain(homeTeleportButtonRegistration);
  });
});

/**
 * DeathScreenWidget — definition + plugin onEnable contribution
 * test. Mirrors KickedOverlayWidget.test.ts +
 * DisconnectedOverlayWidget.test.ts pattern.
 */

import { describe, expect, it, vi } from "vitest";
import defaultFactory, {
  type HyperscapeContext,
  deathScreenRegistration,
  deathScreenWidget,
} from "../../index.js";

describe("DeathScreenWidget — definition", () => {
  it("declares a stable manifest id, category, and default size", () => {
    expect(deathScreenWidget.manifest.id).toBe(
      "com.hyperforge.hyperscape.death-screen",
    );
    expect(deathScreenWidget.manifest.category).toBe("overlay");
    expect(deathScreenWidget.manifest.defaultSize).toEqual({
      width: 96,
      height: 24,
    });
  });

  it("default props match the legacy hand-coded death screen", () => {
    expect(deathScreenWidget.defaultProps).toMatchObject({
      killedBy: "Unknown",
      respawnTime: 0,
      title: "Oh dear, you are dead!",
      respawnTimeoutMs: 10_000,
    });
  });

  it("schema accepts custom kill info + theme colors", () => {
    const parsed = deathScreenWidget.propsSchema.safeParse({
      killedBy: "Goblin",
      respawnTime: Date.now() + 60_000,
      title: "You died.",
      bodyText: "Custom body.",
      respawnTimeoutMs: 5_000,
      backdropColor: "rgba(0,0,0,0.8)",
      panelBackgroundColor: "#000",
      dangerColor: "#f00",
      warningColor: "#fa0",
      textColor: "#fff",
      mutedTextColor: "#888",
      buttonColor: "#0af",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects out-of-range respawnTimeoutMs", () => {
    expect(
      deathScreenWidget.propsSchema.safeParse({ respawnTimeoutMs: 100 })
        .success,
    ).toBe(false);
    expect(
      deathScreenWidget.propsSchema.safeParse({ respawnTimeoutMs: 100_000 })
        .success,
    ).toBe(false);
  });

  it("rejects negative respawnTime", () => {
    expect(
      deathScreenWidget.propsSchema.safeParse({ respawnTime: -1 }).success,
    ).toBe(false);
  });

  it("pairs the widget with a non-null React component in the bundled registration", () => {
    expect(deathScreenRegistration.widget).toBe(deathScreenWidget);
    expect(typeof deathScreenRegistration.Component).toBe("function");
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

describe("Hyperscape meta-plugin — death screen widget contribution", () => {
  it("onEnable calls ctx.widgets.register with the death screen registration", () => {
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
    expect(registered).toContain(deathScreenRegistration);
  });
});

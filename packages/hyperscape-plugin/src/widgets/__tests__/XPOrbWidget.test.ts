/**
 * XPOrbWidget — definition + plugin onEnable contribution test.
 *
 * Phase D6.c.1 / Session 4 of PLAN_NEXT_SESSIONS. Mirrors the
 * shooter-demo's CrosshairWidget test pattern: prove that the
 * widget definition is well-formed, and that the meta-plugin's
 * onEnable hands the registration to a host-provided
 * `ctx.widgets.register(...)` adapter.
 *
 * Pattern: invoke `plugin.onEnable(ctx)` directly with a stub world
 * and a recording widget registry. Same approach the existing
 * `onEnable.test.ts` uses to avoid the framework's
 * `startPluginSessionFromModules` async lifecycle.
 */

import { describe, expect, it, vi } from "vitest";
import defaultFactory, {
  type HyperscapeContext,
  xpOrbRegistration,
  xpOrbWidget,
} from "../../index.js";

describe("XPOrbWidget — definition", () => {
  it("declares a stable manifest id, category, and default size", () => {
    expect(xpOrbWidget.manifest.id).toBe("com.hyperforge.hyperscape.xp-orb");
    expect(xpOrbWidget.manifest.category).toBe("hud");
    expect(xpOrbWidget.manifest.defaultSize).toEqual({ width: 4, height: 2 });
  });

  it("validates default props through its Zod schema", () => {
    expect(xpOrbWidget.defaultProps).toMatchObject({
      durationMs: 2_000,
      maxEntries: 5,
      color: "#ffd84d",
      drops: [],
    });
    const parsed = xpOrbWidget.propsSchema.safeParse({
      durationMs: 1_000,
      maxEntries: 3,
      color: "#abcdef",
      drops: [{ id: "x", skill: "magic", amount: 7, receivedAt: Date.now() }],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects out-of-range durationMs in the props schema", () => {
    const parsed = xpOrbWidget.propsSchema.safeParse({
      durationMs: 100, // below min 500
      maxEntries: 1,
      color: "#000",
      drops: [],
    });
    expect(parsed.success).toBe(false);
  });

  it("pairs the widget with a non-null React component in the bundled registration", () => {
    expect(xpOrbRegistration.widget).toBe(xpOrbWidget);
    expect(typeof xpOrbRegistration.Component).toBe("function");
  });
});

/**
 * Stub world with the minimum surface the meta-plugin's onEnable
 * touches. Mirrors `FakeWorld` in `__tests__/onEnable.test.ts` —
 * keep these in sync if onEnable starts calling new world methods.
 */
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

describe("Hyperscape meta-plugin — XP orb widget contribution", () => {
  it("onEnable calls ctx.widgets.register when the host provides a registry", () => {
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

    // Assert the XP orb registration landed in the host's widget tracker.
    expect(registered).toContain(xpOrbRegistration);
  });

  it("onEnable does NOT crash when ctx.widgets is undefined (server context)", () => {
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
      // widgets intentionally omitted
    };

    // No throw = pass. The plugin's optional-chain on `ctx.widgets`
    // turns the widget registration into a silent no-op.
    expect(() => plugin.onEnable?.(ctx)).not.toThrow();
  });
});

/**
 * LevelUpToastWidget — definition + plugin onEnable contribution test.
 *
 * Phase D6.c.A / Session 5. Mirrors the XPOrbWidget test pattern:
 * prove the widget definition is well-formed, and the meta-plugin's
 * onEnable contributes BOTH the XP orb AND the level-up toast when
 * a host provides a widget registry.
 */

import { describe, expect, it, vi } from "vitest";
import defaultFactory, {
  type HyperscapeContext,
  levelUpToastRegistration,
  levelUpToastWidget,
  xpOrbRegistration,
} from "../../index.js";

describe("LevelUpToastWidget — definition", () => {
  it("declares a stable manifest id, category, and default size", () => {
    expect(levelUpToastWidget.manifest.id).toBe(
      "com.hyperforge.hyperscape.level-up-toast",
    );
    expect(levelUpToastWidget.manifest.category).toBe("hud");
    expect(levelUpToastWidget.manifest.defaultSize).toEqual({
      width: 6,
      height: 2,
    });
  });

  it("validates default props through its Zod schema", () => {
    expect(levelUpToastWidget.defaultProps).toMatchObject({
      durationMs: 4_000,
      maxEntries: 3,
      color: "#ffe066",
      events: [],
    });
    const parsed = levelUpToastWidget.propsSchema.safeParse({
      durationMs: 5_000,
      maxEntries: 2,
      color: "#abcdef",
      events: [
        { id: "x", skill: "magic", newLevel: 42, receivedAt: Date.now() },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects out-of-range durationMs in the props schema", () => {
    const parsed = levelUpToastWidget.propsSchema.safeParse({
      durationMs: 500, // below min 1000
      maxEntries: 1,
      color: "#000",
      events: [],
    });
    expect(parsed.success).toBe(false);
  });

  it("pairs the widget with a non-null React component in the bundled registration", () => {
    expect(levelUpToastRegistration.widget).toBe(levelUpToastWidget);
    expect(typeof levelUpToastRegistration.Component).toBe("function");
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

describe("Hyperscape meta-plugin — multi-widget contribution", () => {
  it("onEnable registers BOTH the XP orb and the level-up toast", () => {
    const registered: unknown[] = [];
    const plugin = defaultFactory({
      pluginId: "com.hyperforge.hyperscape",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      scope: { register: vi.fn() } as any,
    });

    const ctx: HyperscapeContext = {
      pluginId: "com.hyperforge.hyperscape",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      scope: { register: vi.fn() } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      world: makeStubWorld() as any,
      widgets: {
        register(contribution) {
          registered.push(contribution);
        },
      },
    };

    plugin.onEnable?.(ctx);

    // Both registrations made it through the widget contribution
    // adapter — the meta-plugin contributes a multi-widget set.
    // Length is `>= 2` rather than exact-2 so future widget
    // additions don't churn this test (each widget should add its
    // own positive `expect.toContain` assertion in its own test
    // file rather than tightening this one).
    expect(registered).toContain(xpOrbRegistration);
    expect(registered).toContain(levelUpToastRegistration);
    expect(registered.length).toBeGreaterThanOrEqual(2);
  });
});

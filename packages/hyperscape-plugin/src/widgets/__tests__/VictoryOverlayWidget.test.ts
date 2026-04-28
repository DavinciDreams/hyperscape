/**
 * VictoryOverlayWidget — definition + plugin onEnable
 * contribution test. Mirrors the established widget-test pattern.
 */

import { describe, expect, it, vi } from "vitest";
import defaultFactory, {
  type HyperscapeContext,
  victoryOverlayRegistration,
  victoryOverlayWidget,
} from "../../index.js";

describe("VictoryOverlayWidget — definition", () => {
  it("declares a stable manifest id, category, and default size", () => {
    expect(victoryOverlayWidget.manifest.id).toBe(
      "com.hyperforge.hyperscape.victory-overlay",
    );
    expect(victoryOverlayWidget.manifest.category).toBe("overlay");
    expect(victoryOverlayWidget.manifest.defaultSize).toEqual({
      width: 96,
      height: 32,
    });
  });

  it("default props match the legacy hand-coded overlay", () => {
    expect(victoryOverlayWidget.defaultProps).toMatchObject({
      visible: false,
      winnerName: "",
      winsLabel: "WINS!",
      reasonLine: "",
      animationToken: "",
      animationMs: 600,
    });
  });

  it("schema accepts a populated runtime payload", () => {
    const parsed = victoryOverlayWidget.propsSchema.safeParse({
      visible: true,
      winnerName: "Eldorin",
      winsLabel: "TRIUMPHS!",
      reasonLine: "Knockout — HP reached zero.",
      animationToken: "duel-42",
      animationMs: 800,
      winnerColor: "#ffd84d",
      winsLabelColor: "#ff5555",
      reasonLineColor: "#fff",
      winnerGlowColor: "rgba(255, 216, 77, 0.8)",
      winsLabelGlowColor: "rgba(255, 85, 85, 0.8)",
      zIndex: 100,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects out-of-range animationMs", () => {
    expect(
      victoryOverlayWidget.propsSchema.safeParse({ animationMs: 50 }).success,
    ).toBe(false);
    expect(
      victoryOverlayWidget.propsSchema.safeParse({ animationMs: 10_000 })
        .success,
    ).toBe(false);
  });

  it("pairs the widget with a non-null React component in the bundled registration", () => {
    expect(victoryOverlayRegistration.widget).toBe(victoryOverlayWidget);
    expect(typeof victoryOverlayRegistration.Component).toBe("function");
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

describe("Hyperscape meta-plugin — victory overlay widget contribution", () => {
  it("onEnable calls ctx.widgets.register with the victory overlay registration", () => {
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
    expect(registered).toContain(victoryOverlayRegistration);
  });
});

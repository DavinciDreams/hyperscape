/**
 * BuffBarWidget — definition + plugin onEnable
 * contribution test. Mirrors the established widget-test pattern.
 */

import { describe, expect, it, vi } from "vitest";
import defaultFactory, {
  type HyperscapeContext,
  BUFF_KINDS,
  BUFF_BAR_ORIENTATIONS,
  type BuffKind,
  type BuffBarOrientation,
  buffBarRegistration,
  buffBarWidget,
} from "../../index.js";

describe("BuffBarWidget — definition", () => {
  it("declares a stable manifest id, category, and default size", () => {
    expect(buffBarWidget.manifest.id).toBe(
      "com.hyperforge.hyperscape.buff-bar",
    );
    expect(buffBarWidget.manifest.category).toBe("hud");
    expect(buffBarWidget.manifest.defaultSize).toEqual({
      width: 36,
      height: 6,
    });
  });

  it("default props match the legacy hand-coded bar", () => {
    expect(buffBarWidget.defaultProps).toMatchObject({
      buffs: [],
      orientation: "horizontal",
      iconSizePx: 32,
      gapPx: 4,
      showTimers: true,
      expiringThresholdSec: 5,
      reducedMotion: false,
      ringStrokeWidth: 3,
      pulseDurationMs: 800,
    });
  });

  it("BUFF_KINDS is the canonical type set", () => {
    expect(BUFF_KINDS).toEqual(["buff", "debuff"]);
  });

  it("BUFF_BAR_ORIENTATIONS covers row/column", () => {
    expect(BUFF_BAR_ORIENTATIONS).toEqual(["horizontal", "vertical"]);
  });

  it("schema accepts a populated runtime payload", () => {
    const parsed = buffBarWidget.propsSchema.safeParse({
      buffs: [
        {
          id: "haste",
          name: "Haste",
          icon: "⚡",
          duration: 30,
          remaining: 25,
          type: "buff",
          stacks: 1,
        },
        {
          id: "poison",
          name: "Poison",
          icon: "https://example.com/poison.png",
          duration: 60,
          remaining: 4,
          type: "debuff",
          stacks: 3,
          description: "Take damage over time",
        },
      ],
      orientation: "vertical",
      iconSizePx: 40,
      gapPx: 6,
      showTimers: true,
      expiringThresholdSec: 3,
      reducedMotion: true,
      buffRingColor: "#0f0",
      debuffRingColor: "#f00",
      trackColor: "#222",
      trackStrokeColor: "#444",
      iconBackgroundColor: "#111",
      timerTextColor: "#fff",
      timerExpiringColor: "#f00",
      stackBackgroundColor: "#ffd84d",
      stackTextColor: "#000",
      separatorColor: "#333",
      ringStrokeWidth: 4,
      pulseDurationMs: 600,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects unknown buff type", () => {
    expect(
      buffBarWidget.propsSchema.safeParse({
        buffs: [
          {
            id: "x",
            name: "X",
            icon: "?",
            duration: 1,
            remaining: 1,
            type: "neutral" as unknown as BuffKind,
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects unknown orientation", () => {
    expect(
      buffBarWidget.propsSchema.safeParse({
        orientation: "diagonal" as unknown as BuffBarOrientation,
      }).success,
    ).toBe(false);
  });

  it("rejects empty icon", () => {
    expect(
      buffBarWidget.propsSchema.safeParse({
        buffs: [{ id: "x", name: "X", icon: "", duration: 1, remaining: 1 }],
      }).success,
    ).toBe(false);
  });

  it("rejects out-of-range iconSizePx", () => {
    expect(buffBarWidget.propsSchema.safeParse({ iconSizePx: 4 }).success).toBe(
      false,
    );
    expect(
      buffBarWidget.propsSchema.safeParse({ iconSizePx: 256 }).success,
    ).toBe(false);
  });

  it("pairs the widget with a non-null React component in the bundled registration", () => {
    expect(buffBarRegistration.widget).toBe(buffBarWidget);
    expect(typeof buffBarRegistration.Component).toBe("function");
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

describe("Hyperscape meta-plugin — buff bar widget contribution", () => {
  it("onEnable calls ctx.widgets.register with the buff bar registration", () => {
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
    expect(registered).toContain(buffBarRegistration);
  });
});

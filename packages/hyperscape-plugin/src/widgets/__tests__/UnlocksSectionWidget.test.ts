/**
 * UnlocksSectionWidget — definition + plugin onEnable
 * contribution test. Mirrors the established widget-test pattern.
 */

import { describe, expect, it, vi } from "vitest";
import defaultFactory, {
  type HyperscapeContext,
  DEFAULT_UNLOCK_TYPE_ICONS,
  UNLOCK_TYPES,
  unlocksSectionRegistration,
  unlocksSectionWidget,
} from "../../index.js";

describe("UnlocksSectionWidget — definition", () => {
  it("declares a stable manifest id, category, and default size", () => {
    expect(unlocksSectionWidget.manifest.id).toBe(
      "com.hyperforge.hyperscape.unlocks-section",
    );
    expect(unlocksSectionWidget.manifest.category).toBe("panel");
    expect(unlocksSectionWidget.manifest.defaultSize).toEqual({
      width: 32,
      height: 24,
    });
  });

  it("default props match the legacy hand-coded section", () => {
    expect(unlocksSectionWidget.defaultProps).toMatchObject({
      unlocks: [],
      title: "New Unlocks",
      fontSize: 14,
      titleFontSize: 11,
      spacingPx: 8,
    });
  });

  it("UNLOCK_TYPES is the canonical set", () => {
    expect(UNLOCK_TYPES).toEqual([
      "item",
      "ability",
      "area",
      "quest",
      "activity",
    ]);
  });

  it("DEFAULT_UNLOCK_TYPE_ICONS has an entry for every type", () => {
    for (const type of UNLOCK_TYPES) {
      expect(DEFAULT_UNLOCK_TYPE_ICONS[type]).toBeTruthy();
    }
  });

  it("schema accepts a populated unlocks list", () => {
    const parsed = unlocksSectionWidget.propsSchema.safeParse({
      unlocks: [
        { type: "item", description: "Bronze axe", level: 1 },
        { type: "area", description: "Forest", level: 5 },
      ],
      title: "Level 5 Rewards",
      accentColor: "#fff",
      textColor: "#eee",
      rowBackgroundColor: "#222",
      rowBorderColor: "#0ff",
      iconByType: { item: "🎁" },
      fontSize: 16,
      titleFontSize: 12,
      spacingPx: 12,
      rowBorderRadiusPx: 8,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects unknown unlock type", () => {
    expect(
      unlocksSectionWidget.propsSchema.safeParse({
        unlocks: [
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          { type: "secret" as any, description: "x", level: 0 },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects empty description", () => {
    expect(
      unlocksSectionWidget.propsSchema.safeParse({
        unlocks: [{ type: "item", description: "", level: 0 }],
      }).success,
    ).toBe(false);
  });

  it("rejects out-of-range fontSize", () => {
    expect(
      unlocksSectionWidget.propsSchema.safeParse({ fontSize: 100 }).success,
    ).toBe(false);
    expect(
      unlocksSectionWidget.propsSchema.safeParse({ fontSize: 0 }).success,
    ).toBe(false);
  });

  it("pairs the widget with a non-null React component in the bundled registration", () => {
    expect(unlocksSectionRegistration.widget).toBe(unlocksSectionWidget);
    expect(typeof unlocksSectionRegistration.Component).toBe("function");
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

describe("Hyperscape meta-plugin — unlocks section widget contribution", () => {
  it("onEnable calls ctx.widgets.register with the unlocks section registration", () => {
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
    expect(registered).toContain(unlocksSectionRegistration);
  });
});

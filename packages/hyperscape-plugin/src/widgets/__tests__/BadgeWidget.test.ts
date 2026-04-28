/**
 * BadgeWidget — definition + plugin onEnable
 * contribution test. Mirrors the established widget-test pattern.
 */

import { describe, expect, it, vi } from "vitest";
import defaultFactory, {
  type HyperscapeContext,
  BADGE_VARIANTS,
  DEFAULT_BADGE_VARIANT_COLORS,
  type BadgeVariant,
  badgeRegistration,
  badgeWidget,
} from "../../index.js";

describe("BadgeWidget — definition", () => {
  it("declares a stable manifest id, category, and default size", () => {
    expect(badgeWidget.manifest.id).toBe("com.hyperforge.hyperscape.badge");
    expect(badgeWidget.manifest.category).toBe("panel");
    expect(badgeWidget.manifest.defaultSize).toEqual({
      width: 8,
      height: 4,
    });
  });

  it("default props match a sensible base", () => {
    expect(badgeWidget.defaultProps).toMatchObject({
      label: "",
      variant: "neutral",
      icon: "",
      outlined: false,
      pill: false,
      fontSize: 11,
      paddingYPx: 2,
      paddingXPx: 8,
      borderRadiusPx: 4,
      uppercase: false,
    });
  });

  it("BADGE_VARIANTS covers the canonical 6 severity levels", () => {
    expect(BADGE_VARIANTS).toEqual([
      "neutral",
      "success",
      "warning",
      "danger",
      "info",
      "accent",
    ]);
  });

  it("DEFAULT_BADGE_VARIANT_COLORS has an entry per variant", () => {
    for (const variant of BADGE_VARIANTS) {
      const colors = DEFAULT_BADGE_VARIANT_COLORS[variant];
      expect(colors.background).toBeTruthy();
      expect(colors.text).toBeTruthy();
      expect(colors.border).toBeTruthy();
    }
  });

  it("schema accepts every variant", () => {
    for (const variant of BADGE_VARIANTS) {
      expect(badgeWidget.propsSchema.safeParse({ variant }).success).toBe(true);
    }
  });

  it("schema accepts a populated runtime payload", () => {
    const parsed = badgeWidget.propsSchema.safeParse({
      label: "Online",
      variant: "success",
      icon: "🟢",
      outlined: true,
      pill: true,
      backgroundColor: "#222",
      borderColor: "#0f0",
      textColor: "#fff",
      fontSize: 12,
      paddingYPx: 4,
      paddingXPx: 10,
      borderRadiusPx: 6,
      letterSpacingPx: 0.6,
      uppercase: true,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects unknown variant", () => {
    expect(
      badgeWidget.propsSchema.safeParse({
        variant: "fatal" as unknown as BadgeVariant,
      }).success,
    ).toBe(false);
  });

  it("rejects out-of-range fontSize", () => {
    expect(badgeWidget.propsSchema.safeParse({ fontSize: 4 }).success).toBe(
      false,
    );
    expect(badgeWidget.propsSchema.safeParse({ fontSize: 100 }).success).toBe(
      false,
    );
  });

  it("rejects out-of-range letterSpacingPx", () => {
    expect(
      badgeWidget.propsSchema.safeParse({ letterSpacingPx: -10 }).success,
    ).toBe(false);
    expect(
      badgeWidget.propsSchema.safeParse({ letterSpacingPx: 20 }).success,
    ).toBe(false);
  });

  it("pairs the widget with a non-null React component in the bundled registration", () => {
    expect(badgeRegistration.widget).toBe(badgeWidget);
    expect(typeof badgeRegistration.Component).toBe("function");
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

describe("Hyperscape meta-plugin — badge widget contribution", () => {
  it("onEnable calls ctx.widgets.register with the badge registration", () => {
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
    expect(registered).toContain(badgeRegistration);
  });
});

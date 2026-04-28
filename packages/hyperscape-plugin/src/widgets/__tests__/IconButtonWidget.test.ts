/**
 * IconButtonWidget — definition + plugin onEnable
 * contribution test. Mirrors the established widget-test pattern.
 */

import { describe, expect, it, vi } from "vitest";
import defaultFactory, {
  type HyperscapeContext,
  ICON_BUTTON_SIZES,
  ICON_BUTTON_VARIANTS,
  ICON_BUTTON_SIZE_TABLE,
  DEFAULT_ICON_BUTTON_VARIANT_COLORS,
  type IconButtonSize,
  type IconButtonVariant,
  iconButtonRegistration,
  iconButtonWidget,
} from "../../index.js";

describe("IconButtonWidget — definition", () => {
  it("declares a stable manifest id, category, and default size", () => {
    expect(iconButtonWidget.manifest.id).toBe(
      "com.hyperforge.hyperscape.icon-button",
    );
    expect(iconButtonWidget.manifest.category).toBe("panel");
    expect(iconButtonWidget.manifest.defaultSize).toEqual({
      width: 4,
      height: 4,
    });
  });

  it("default props match a sensible base", () => {
    expect(iconButtonWidget.defaultProps).toMatchObject({
      icon: "•",
      ariaLabel: "",
      size: "md",
      variant: "ghost",
      disabled: false,
      borderRadiusPx: 4,
      disabledOpacity: 0.4,
    });
  });

  it("ICON_BUTTON_SIZES covers xs/sm/md/lg/xl", () => {
    expect(ICON_BUTTON_SIZES).toEqual(["xs", "sm", "md", "lg", "xl"]);
  });

  it("ICON_BUTTON_VARIANTS covers ghost/subtle/primary/danger", () => {
    expect(ICON_BUTTON_VARIANTS).toEqual([
      "ghost",
      "subtle",
      "primary",
      "danger",
    ]);
  });

  it("ICON_BUTTON_SIZE_TABLE has an entry per size", () => {
    for (const size of ICON_BUTTON_SIZES) {
      const dims = ICON_BUTTON_SIZE_TABLE[size];
      expect(dims.button).toBeGreaterThan(0);
      expect(dims.icon).toBeGreaterThan(0);
      expect(dims.icon).toBeLessThan(dims.button);
    }
  });

  it("DEFAULT_ICON_BUTTON_VARIANT_COLORS has an entry per variant", () => {
    for (const variant of ICON_BUTTON_VARIANTS) {
      const palette = DEFAULT_ICON_BUTTON_VARIANT_COLORS[variant];
      expect(palette.background).toBeTruthy();
      expect(palette.hoverBackground).toBeTruthy();
      expect(palette.iconColor).toBeTruthy();
    }
  });

  it("schema accepts every size", () => {
    for (const size of ICON_BUTTON_SIZES) {
      expect(iconButtonWidget.propsSchema.safeParse({ size }).success).toBe(
        true,
      );
    }
  });

  it("schema accepts every variant", () => {
    for (const variant of ICON_BUTTON_VARIANTS) {
      expect(iconButtonWidget.propsSchema.safeParse({ variant }).success).toBe(
        true,
      );
    }
  });

  it("schema accepts a populated runtime payload", () => {
    const parsed = iconButtonWidget.propsSchema.safeParse({
      icon: "✕",
      ariaLabel: "Close",
      size: "lg",
      variant: "danger",
      disabled: false,
      backgroundColor: "#222",
      hoverBackgroundColor: "#444",
      borderColor: "#555",
      iconColor: "#fff",
      borderRadiusPx: 6,
      disabledOpacity: 0.3,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects unknown size", () => {
    expect(
      iconButtonWidget.propsSchema.safeParse({
        size: "xxxl" as unknown as IconButtonSize,
      }).success,
    ).toBe(false);
  });

  it("rejects unknown variant", () => {
    expect(
      iconButtonWidget.propsSchema.safeParse({
        variant: "rainbow" as unknown as IconButtonVariant,
      }).success,
    ).toBe(false);
  });

  it("rejects empty icon", () => {
    expect(iconButtonWidget.propsSchema.safeParse({ icon: "" }).success).toBe(
      false,
    );
  });

  it("rejects out-of-range disabledOpacity", () => {
    expect(
      iconButtonWidget.propsSchema.safeParse({ disabledOpacity: -0.1 }).success,
    ).toBe(false);
    expect(
      iconButtonWidget.propsSchema.safeParse({ disabledOpacity: 1.5 }).success,
    ).toBe(false);
  });

  it("pairs the widget with a non-null React component in the bundled registration", () => {
    expect(iconButtonRegistration.widget).toBe(iconButtonWidget);
    expect(typeof iconButtonRegistration.Component).toBe("function");
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

describe("Hyperscape meta-plugin — icon button widget contribution", () => {
  it("onEnable calls ctx.widgets.register with the icon button registration", () => {
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
    expect(registered).toContain(iconButtonRegistration);
  });
});

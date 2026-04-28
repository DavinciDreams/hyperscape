/**
 * ChipListWidget — definition + plugin onEnable
 * contribution test. Mirrors the established widget-test pattern.
 */

import { describe, expect, it, vi } from "vitest";
import defaultFactory, {
  type HyperscapeContext,
  CHIP_VARIANTS,
  CHIP_LIST_ORIENTATIONS,
  DEFAULT_CHIP_VARIANT_COLORS,
  type ChipVariant,
  type ChipListOrientation,
  chipListRegistration,
  chipListWidget,
} from "../../index.js";

describe("ChipListWidget — definition", () => {
  it("declares a stable manifest id, category, and default size", () => {
    expect(chipListWidget.manifest.id).toBe(
      "com.hyperforge.hyperscape.chip-list",
    );
    expect(chipListWidget.manifest.category).toBe("panel");
    expect(chipListWidget.manifest.defaultSize).toEqual({
      width: 32,
      height: 6,
    });
  });

  it("default props match a sensible base", () => {
    expect(chipListWidget.defaultProps).toMatchObject({
      chips: [],
      removable: false,
      orientation: "row",
      gapPx: 6,
      fontSize: 12,
      paddingYPx: 3,
      paddingXPx: 8,
      borderRadiusPx: 12,
      removeGlyph: "×",
      disabledOpacity: 0.4,
    });
  });

  it("CHIP_VARIANTS covers neutral/accent/success/danger", () => {
    expect(CHIP_VARIANTS).toEqual(["neutral", "accent", "success", "danger"]);
  });

  it("CHIP_LIST_ORIENTATIONS covers row/column", () => {
    expect(CHIP_LIST_ORIENTATIONS).toEqual(["row", "column"]);
  });

  it("DEFAULT_CHIP_VARIANT_COLORS has an entry per variant", () => {
    for (const variant of CHIP_VARIANTS) {
      const colors = DEFAULT_CHIP_VARIANT_COLORS[variant];
      expect(colors.background).toBeTruthy();
      expect(colors.text).toBeTruthy();
      expect(colors.border).toBeTruthy();
    }
  });

  it("schema accepts a populated runtime payload", () => {
    const parsed = chipListWidget.propsSchema.safeParse({
      chips: [
        { id: "tag-1", label: "weapon", variant: "neutral" },
        { id: "tag-2", label: "rare", icon: "✨", variant: "accent" },
        { id: "tag-3", label: "broken", variant: "danger", disabled: true },
      ],
      removable: true,
      orientation: "row",
      gapPx: 8,
      fontSize: 13,
      paddingYPx: 4,
      paddingXPx: 10,
      borderRadiusPx: 16,
      removeGlyph: "✕",
      disabledOpacity: 0.3,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects unknown variant", () => {
    expect(
      chipListWidget.propsSchema.safeParse({
        chips: [
          {
            id: "x",
            label: "X",
            variant: "purple" as unknown as ChipVariant,
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects unknown orientation", () => {
    expect(
      chipListWidget.propsSchema.safeParse({
        orientation: "diagonal" as unknown as ChipListOrientation,
      }).success,
    ).toBe(false);
  });

  it("rejects empty chip id or label", () => {
    expect(
      chipListWidget.propsSchema.safeParse({
        chips: [{ id: "", label: "X" }],
      }).success,
    ).toBe(false);
    expect(
      chipListWidget.propsSchema.safeParse({
        chips: [{ id: "x", label: "" }],
      }).success,
    ).toBe(false);
  });

  it("rejects empty removeGlyph", () => {
    expect(
      chipListWidget.propsSchema.safeParse({ removeGlyph: "" }).success,
    ).toBe(false);
  });

  it("pairs the widget with a non-null React component in the bundled registration", () => {
    expect(chipListRegistration.widget).toBe(chipListWidget);
    expect(typeof chipListRegistration.Component).toBe("function");
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

describe("Hyperscape meta-plugin — chip list widget contribution", () => {
  it("onEnable calls ctx.widgets.register with the chip list registration", () => {
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
    expect(registered).toContain(chipListRegistration);
  });
});

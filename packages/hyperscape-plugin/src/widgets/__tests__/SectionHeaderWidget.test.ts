/**
 * SectionHeaderWidget — definition + plugin onEnable
 * contribution test. Mirrors the established widget-test pattern.
 */

import { describe, expect, it, vi } from "vitest";
import defaultFactory, {
  type HyperscapeContext,
  SECTION_HEADER_LEVELS,
  type SectionHeaderLevel,
  sectionHeaderRegistration,
  sectionHeaderWidget,
} from "../../index.js";

describe("SectionHeaderWidget — definition", () => {
  it("declares a stable manifest id, category, and default size", () => {
    expect(sectionHeaderWidget.manifest.id).toBe(
      "com.hyperforge.hyperscape.section-header",
    );
    expect(sectionHeaderWidget.manifest.category).toBe("panel");
    expect(sectionHeaderWidget.manifest.defaultSize).toEqual({
      width: 32,
      height: 4,
    });
  });

  it("default props match a sensible base", () => {
    expect(sectionHeaderWidget.defaultProps).toMatchObject({
      title: "",
      subtitle: "",
      level: "h3",
      actionLabel: "",
      icon: "",
      divided: false,
      titleFontSize: 13,
      subtitleFontSize: 11,
      actionFontSize: 12,
      uppercase: false,
      letterSpacingPx: 0.5,
      marginBottomPx: 8,
    });
  });

  it("SECTION_HEADER_LEVELS covers the canonical heading set", () => {
    expect(SECTION_HEADER_LEVELS).toEqual(["h2", "h3", "h4"]);
  });

  it("schema accepts every level value", () => {
    for (const level of SECTION_HEADER_LEVELS) {
      expect(sectionHeaderWidget.propsSchema.safeParse({ level }).success).toBe(
        true,
      );
    }
  });

  it("rejects unknown level", () => {
    expect(
      sectionHeaderWidget.propsSchema.safeParse({
        level: "h1" as unknown as SectionHeaderLevel,
      }).success,
    ).toBe(false);
  });

  it("schema accepts a populated runtime payload", () => {
    const parsed = sectionHeaderWidget.propsSchema.safeParse({
      title: "Audio",
      subtitle: "Master volume and per-channel mix",
      level: "h2",
      actionLabel: "Reset",
      icon: "🔊",
      divided: true,
      titleColor: "#ffd84d",
      subtitleColor: "#aaa",
      actionColor: "#ffd84d",
      actionHoverColor: "rgba(255,216,77,0.12)",
      dividerColor: "rgba(255,255,255,0.08)",
      titleFontSize: 14,
      subtitleFontSize: 12,
      actionFontSize: 12,
      uppercase: true,
      letterSpacingPx: 0.8,
      marginBottomPx: 12,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects out-of-range marginBottomPx", () => {
    expect(
      sectionHeaderWidget.propsSchema.safeParse({ marginBottomPx: -1 }).success,
    ).toBe(false);
    expect(
      sectionHeaderWidget.propsSchema.safeParse({ marginBottomPx: 100 })
        .success,
    ).toBe(false);
  });

  it("rejects out-of-range fontSize values", () => {
    expect(
      sectionHeaderWidget.propsSchema.safeParse({ titleFontSize: 4 }).success,
    ).toBe(false);
    expect(
      sectionHeaderWidget.propsSchema.safeParse({ subtitleFontSize: 100 })
        .success,
    ).toBe(false);
    expect(
      sectionHeaderWidget.propsSchema.safeParse({ actionFontSize: 0 }).success,
    ).toBe(false);
  });

  it("rejects out-of-range letterSpacingPx", () => {
    expect(
      sectionHeaderWidget.propsSchema.safeParse({ letterSpacingPx: -10 })
        .success,
    ).toBe(false);
    expect(
      sectionHeaderWidget.propsSchema.safeParse({ letterSpacingPx: 20 })
        .success,
    ).toBe(false);
  });

  it("pairs the widget with a non-null React component in the bundled registration", () => {
    expect(sectionHeaderRegistration.widget).toBe(sectionHeaderWidget);
    expect(typeof sectionHeaderRegistration.Component).toBe("function");
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

describe("Hyperscape meta-plugin — section header widget contribution", () => {
  it("onEnable calls ctx.widgets.register with the section header registration", () => {
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
    expect(registered).toContain(sectionHeaderRegistration);
  });
});

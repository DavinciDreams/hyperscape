/**
 * AvatarWidget — definition + plugin onEnable
 * contribution test. Mirrors the established widget-test pattern.
 */

import { describe, expect, it, vi } from "vitest";
import defaultFactory, {
  type HyperscapeContext,
  AVATAR_SHAPES,
  AVATAR_STATUSES,
  DEFAULT_AVATAR_INITIAL_COLORS,
  DEFAULT_AVATAR_STATUS_COLORS,
  computeInitials,
  pickPaletteIndex,
  type AvatarShape,
  type AvatarStatus,
  avatarRegistration,
  avatarWidget,
} from "../../index.js";

describe("AvatarWidget — definition", () => {
  it("declares a stable manifest id, category, and default size", () => {
    expect(avatarWidget.manifest.id).toBe("com.hyperforge.hyperscape.avatar");
    expect(avatarWidget.manifest.category).toBe("panel");
    expect(avatarWidget.manifest.defaultSize).toEqual({
      width: 6,
      height: 6,
    });
  });

  it("default props match a sensible base", () => {
    expect(avatarWidget.defaultProps).toMatchObject({
      name: "",
      imageUrl: "",
      sizePx: 32,
      shape: "circle",
      status: "none",
      borderWidthPx: 0,
      statusDotFraction: 0.28,
    });
  });

  it("AVATAR_SHAPES covers circle/square", () => {
    expect(AVATAR_SHAPES).toEqual(["circle", "square"]);
  });

  it("AVATAR_STATUSES covers the canonical 5 presence states", () => {
    expect(AVATAR_STATUSES).toEqual([
      "none",
      "online",
      "away",
      "busy",
      "offline",
    ]);
  });

  it("DEFAULT_AVATAR_INITIAL_COLORS has 8 entries", () => {
    expect(DEFAULT_AVATAR_INITIAL_COLORS.length).toBe(8);
  });

  it("DEFAULT_AVATAR_STATUS_COLORS covers every non-none status", () => {
    for (const status of AVATAR_STATUSES) {
      if (status === "none") continue;
      expect(DEFAULT_AVATAR_STATUS_COLORS[status]).toBeTruthy();
    }
  });

  it("schema accepts a populated runtime payload", () => {
    const parsed = avatarWidget.propsSchema.safeParse({
      name: "Eldorin the Wise",
      imageUrl: "https://example.com/avatar.png",
      sizePx: 48,
      shape: "square",
      status: "online",
      initialsTextColor: "#fff",
      initialsPalette: ["#f00", "#0f0", "#00f"],
      borderColor: "#444",
      borderWidthPx: 2,
      statusColors: { online: "#0f0" },
      statusDotFraction: 0.3,
      statusDotRingColor: "#000",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects unknown shape", () => {
    expect(
      avatarWidget.propsSchema.safeParse({
        shape: "hexagon" as unknown as AvatarShape,
      }).success,
    ).toBe(false);
  });

  it("rejects unknown status", () => {
    expect(
      avatarWidget.propsSchema.safeParse({
        status: "ghost" as unknown as AvatarStatus,
      }).success,
    ).toBe(false);
  });

  it("rejects out-of-range sizePx", () => {
    expect(avatarWidget.propsSchema.safeParse({ sizePx: 4 }).success).toBe(
      false,
    );
    expect(avatarWidget.propsSchema.safeParse({ sizePx: 1_000 }).success).toBe(
      false,
    );
  });

  it("rejects out-of-range statusDotFraction", () => {
    expect(
      avatarWidget.propsSchema.safeParse({ statusDotFraction: 0.01 }).success,
    ).toBe(false);
    expect(
      avatarWidget.propsSchema.safeParse({ statusDotFraction: 0.9 }).success,
    ).toBe(false);
  });

  it("pairs the widget with a non-null React component in the bundled registration", () => {
    expect(avatarRegistration.widget).toBe(avatarWidget);
    expect(typeof avatarRegistration.Component).toBe("function");
  });
});

describe("computeInitials", () => {
  it("returns ? for empty/blank strings", () => {
    expect(computeInitials("")).toBe("?");
    expect(computeInitials("   ")).toBe("?");
  });

  it("returns first letter for single-word names", () => {
    expect(computeInitials("Eldorin")).toBe("E");
    expect(computeInitials("hans")).toBe("H");
  });

  it("returns first + last initial for multi-word names", () => {
    expect(computeInitials("Hans the Smith")).toBe("HS");
    expect(computeInitials("Mary Jane Watson")).toBe("MW");
  });

  it("collapses whitespace and handles hyphens as part of the word", () => {
    expect(computeInitials("  jane   doe-king  ")).toBe("JD");
  });

  it("uppercases the result regardless of input case", () => {
    expect(computeInitials("aaron beale")).toBe("AB");
    expect(computeInitials("ZZ")).toBe("Z");
  });
});

describe("pickPaletteIndex", () => {
  it("returns 0 for empty palette", () => {
    expect(pickPaletteIndex("anything", 0)).toBe(0);
  });

  it("returns a deterministic index for the same input", () => {
    const a = pickPaletteIndex("Eldorin", 8);
    const b = pickPaletteIndex("Eldorin", 8);
    expect(a).toBe(b);
  });

  it("stays within [0, paletteSize)", () => {
    for (let i = 0; i < 50; i++) {
      const idx = pickPaletteIndex(`Player_${i}`, 8);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(8);
    }
  });

  it("can produce different indices for different names", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 30; i++) {
      seen.add(pickPaletteIndex(`Name_${i}`, 8));
    }
    // Sanity check: a hash mapped to mod-8 over 30 distinct inputs
    // should hit > 1 bucket.
    expect(seen.size).toBeGreaterThan(1);
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

describe("Hyperscape meta-plugin — avatar widget contribution", () => {
  it("onEnable calls ctx.widgets.register with the avatar registration", () => {
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
    expect(registered).toContain(avatarRegistration);
  });
});

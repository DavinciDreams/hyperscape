/**
 * PaginationWidget — definition + plugin onEnable
 * contribution test. Mirrors the established widget-test pattern.
 */

import { describe, expect, it, vi } from "vitest";
import defaultFactory, {
  type HyperscapeContext,
  computePageWindow,
  paginationRegistration,
  paginationWidget,
} from "../../index.js";

describe("PaginationWidget — definition", () => {
  it("declares a stable manifest id, category, and default size", () => {
    expect(paginationWidget.manifest.id).toBe(
      "com.hyperforge.hyperscape.pagination",
    );
    expect(paginationWidget.manifest.category).toBe("panel");
    expect(paginationWidget.manifest.defaultSize).toEqual({
      width: 32,
      height: 6,
    });
  });

  it("default props match a sensible base", () => {
    expect(paginationWidget.defaultProps).toMatchObject({
      currentPage: 1,
      totalPages: 1,
      neighborCount: 1,
      showJumpArrows: true,
      showStepArrows: true,
      disabled: false,
      firstGlyph: "«",
      lastGlyph: "»",
      prevGlyph: "‹",
      nextGlyph: "›",
      ellipsisGlyph: "…",
      fontSize: 12,
      buttonMinWidthPx: 28,
      buttonHeightPx: 28,
      gapPx: 4,
      borderRadiusPx: 4,
    });
  });

  it("schema accepts a populated runtime payload", () => {
    const parsed = paginationWidget.propsSchema.safeParse({
      currentPage: 5,
      totalPages: 12,
      neighborCount: 2,
      showJumpArrows: true,
      showStepArrows: true,
      disabled: false,
      firstGlyph: "<<",
      lastGlyph: ">>",
      prevGlyph: "<",
      nextGlyph: ">",
      ellipsisGlyph: "…",
      buttonBackgroundColor: "#222",
      buttonBorderColor: "#444",
      buttonTextColor: "#aaa",
      buttonHoverBackgroundColor: "rgba(255,255,255,0.04)",
      activeBackgroundColor: "rgba(255,216,77,0.15)",
      activeBorderColor: "#ffd84d",
      activeTextColor: "#ffd84d",
      disabledOpacity: 0.4,
      ellipsisColor: "#666",
      fontSize: 13,
      buttonMinWidthPx: 32,
      buttonHeightPx: 32,
      gapPx: 6,
      borderRadiusPx: 6,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects currentPage below 1", () => {
    expect(
      paginationWidget.propsSchema.safeParse({ currentPage: 0 }).success,
    ).toBe(false);
  });

  it("rejects totalPages below 1", () => {
    expect(
      paginationWidget.propsSchema.safeParse({ totalPages: 0 }).success,
    ).toBe(false);
  });

  it("rejects out-of-range neighborCount", () => {
    expect(
      paginationWidget.propsSchema.safeParse({ neighborCount: -1 }).success,
    ).toBe(false);
    expect(
      paginationWidget.propsSchema.safeParse({ neighborCount: 20 }).success,
    ).toBe(false);
  });

  it("rejects empty arrow glyphs", () => {
    expect(
      paginationWidget.propsSchema.safeParse({ firstGlyph: "" }).success,
    ).toBe(false);
    expect(
      paginationWidget.propsSchema.safeParse({ ellipsisGlyph: "" }).success,
    ).toBe(false);
  });

  it("pairs the widget with a non-null React component in the bundled registration", () => {
    expect(paginationRegistration.widget).toBe(paginationWidget);
    expect(typeof paginationRegistration.Component).toBe("function");
  });
});

describe("computePageWindow", () => {
  it("returns single page when totalPages is 1", () => {
    expect(computePageWindow(1, 1, 1)).toEqual([{ kind: "page", page: 1 }]);
  });

  it("returns single page when totalPages is 0", () => {
    expect(computePageWindow(0, 0, 1)).toEqual([{ kind: "page", page: 1 }]);
  });

  it("returns all pages when window covers the whole range", () => {
    // currentPage=2 ± 1 plus 1 and 5 → [1, 2, 3, 5] but 4 is also adjacent
    // currentPage=2 ± 1 = [2,3] → 1 (always), then 2,3, then ellipsis if 3 < 4, then 5
    const result = computePageWindow(2, 5, 1);
    expect(result).toEqual([
      { kind: "page", page: 1 },
      { kind: "page", page: 2 },
      { kind: "page", page: 3 },
      { kind: "ellipsis" },
      { kind: "page", page: 5 },
    ]);
  });

  it("inserts both ellipses when current page is in the middle of a long range", () => {
    const result = computePageWindow(5, 12, 1);
    expect(result).toEqual([
      { kind: "page", page: 1 },
      { kind: "ellipsis" },
      { kind: "page", page: 4 },
      { kind: "page", page: 5 },
      { kind: "page", page: 6 },
      { kind: "ellipsis" },
      { kind: "page", page: 12 },
    ]);
  });

  it("omits the leading ellipsis when current page is near the start", () => {
    const result = computePageWindow(2, 12, 1);
    expect(result[0]).toEqual({ kind: "page", page: 1 });
    expect(result[1]).toEqual({ kind: "page", page: 2 });
    expect(result[2]).toEqual({ kind: "page", page: 3 });
    expect(result[3]).toEqual({ kind: "ellipsis" });
    expect(result[4]).toEqual({ kind: "page", page: 12 });
  });

  it("omits the trailing ellipsis when current page is near the end", () => {
    const result = computePageWindow(11, 12, 1);
    expect(result).toEqual([
      { kind: "page", page: 1 },
      { kind: "ellipsis" },
      { kind: "page", page: 10 },
      { kind: "page", page: 11 },
      { kind: "page", page: 12 },
    ]);
  });

  it("expands the window with larger neighborCount", () => {
    const result = computePageWindow(5, 12, 2);
    const pages = result.flatMap((e) => (e.kind === "page" ? [e.page] : []));
    expect(pages).toEqual([1, 3, 4, 5, 6, 7, 12]);
  });

  it("clamps current page to valid range", () => {
    const high = computePageWindow(99, 5, 1);
    const highPages = high.flatMap((e) => (e.kind === "page" ? [e.page] : []));
    expect(highPages[highPages.length - 1]).toBe(5);
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

describe("Hyperscape meta-plugin — pagination widget contribution", () => {
  it("onEnable calls ctx.widgets.register with the pagination registration", () => {
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
    expect(registered).toContain(paginationRegistration);
  });
});

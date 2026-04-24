import { describe, expect, it } from "vitest";
import {
  computePluginBrowserPageWindow,
  slicePluginBrowserPage,
  DEFAULT_PLUGIN_BROWSER_PAGE_SIZE,
} from "../PluginBrowserPagination.js";

describe("computePluginBrowserPageWindow — typical case", () => {
  it("computes a full first page", () => {
    const w = computePluginBrowserPageWindow({
      totalCount: 125,
      currentPage: 0,
      pageSize: 50,
    });
    expect(w.startIndex).toBe(0);
    expect(w.endIndex).toBe(50);
    expect(w.count).toBe(50);
    expect(w.pageCount).toBe(3);
    expect(w.isFirstPage).toBe(true);
    expect(w.isLastPage).toBe(false);
    expect(w.hasPrev).toBe(false);
    expect(w.hasNext).toBe(true);
    expect(w.wasClamped).toBe(false);
  });

  it("computes a partial last page", () => {
    const w = computePluginBrowserPageWindow({
      totalCount: 125,
      currentPage: 2,
      pageSize: 50,
    });
    expect(w.startIndex).toBe(100);
    expect(w.endIndex).toBe(125);
    expect(w.count).toBe(25);
    expect(w.isLastPage).toBe(true);
    expect(w.hasNext).toBe(false);
  });

  it("computes a middle page", () => {
    const w = computePluginBrowserPageWindow({
      totalCount: 125,
      currentPage: 1,
      pageSize: 50,
    });
    expect(w.startIndex).toBe(50);
    expect(w.endIndex).toBe(100);
    expect(w.isFirstPage).toBe(false);
    expect(w.isLastPage).toBe(false);
    expect(w.hasPrev).toBe(true);
    expect(w.hasNext).toBe(true);
  });
});

describe("computePluginBrowserPageWindow — exact multiples", () => {
  it("renders last page as full when total is a multiple of pageSize", () => {
    const w = computePluginBrowserPageWindow({
      totalCount: 100,
      currentPage: 1,
      pageSize: 50,
    });
    expect(w.startIndex).toBe(50);
    expect(w.endIndex).toBe(100);
    expect(w.count).toBe(50);
    expect(w.pageCount).toBe(2);
    expect(w.isLastPage).toBe(true);
  });
});

describe("computePluginBrowserPageWindow — empty input", () => {
  it("returns an empty first page for totalCount=0", () => {
    const w = computePluginBrowserPageWindow({
      totalCount: 0,
      currentPage: 0,
      pageSize: 50,
    });
    expect(w.startIndex).toBe(0);
    expect(w.endIndex).toBe(0);
    expect(w.count).toBe(0);
    expect(w.pageCount).toBe(1);
    expect(w.isFirstPage).toBe(true);
    expect(w.isLastPage).toBe(true);
    expect(w.hasPrev).toBe(false);
    expect(w.hasNext).toBe(false);
    expect(w.wasClamped).toBe(false);
  });
});

describe("computePluginBrowserPageWindow — clamping", () => {
  it("clamps negative currentPage to 0", () => {
    const w = computePluginBrowserPageWindow({
      totalCount: 30,
      currentPage: -5,
      pageSize: 10,
    });
    expect(w.currentPage).toBe(0);
    expect(w.wasClamped).toBe(true);
  });

  it("clamps overshoot to last page", () => {
    const w = computePluginBrowserPageWindow({
      totalCount: 30,
      currentPage: 99,
      pageSize: 10,
    });
    expect(w.currentPage).toBe(2);
    expect(w.wasClamped).toBe(true);
  });

  it("clamps non-finite currentPage to 0", () => {
    const w = computePluginBrowserPageWindow({
      totalCount: 30,
      currentPage: Number.NaN,
      pageSize: 10,
    });
    expect(w.currentPage).toBe(0);
    expect(w.wasClamped).toBe(true);
  });

  it("clamps zero pageSize to 1", () => {
    const w = computePluginBrowserPageWindow({
      totalCount: 5,
      currentPage: 0,
      pageSize: 0,
    });
    expect(w.pageSize).toBe(1);
    expect(w.pageCount).toBe(5);
  });

  it("clamps negative pageSize to 1", () => {
    const w = computePluginBrowserPageWindow({
      totalCount: 5,
      currentPage: 0,
      pageSize: -10,
    });
    expect(w.pageSize).toBe(1);
  });

  it("floors fractional pageSize", () => {
    const w = computePluginBrowserPageWindow({
      totalCount: 10,
      currentPage: 0,
      pageSize: 3.9,
    });
    expect(w.pageSize).toBe(3);
    expect(w.pageCount).toBe(4);
  });

  it("does not flag wasClamped=true for in-range integer pages", () => {
    const w = computePluginBrowserPageWindow({
      totalCount: 30,
      currentPage: 1,
      pageSize: 10,
    });
    expect(w.wasClamped).toBe(false);
  });

  it("clamps negative totalCount to 0", () => {
    const w = computePluginBrowserPageWindow({
      totalCount: -100,
      currentPage: 0,
      pageSize: 10,
    });
    expect(w.count).toBe(0);
    expect(w.pageCount).toBe(1);
  });
});

describe("computePluginBrowserPageWindow — invariants", () => {
  it("startIndex <= endIndex <= totalCount for all valid inputs", () => {
    const cases = [
      { totalCount: 0, currentPage: 0, pageSize: 10 },
      { totalCount: 5, currentPage: 0, pageSize: 10 },
      { totalCount: 50, currentPage: 4, pageSize: 10 },
      { totalCount: 55, currentPage: 5, pageSize: 10 },
      { totalCount: 100, currentPage: 9, pageSize: 10 },
    ];
    for (const c of cases) {
      const w = computePluginBrowserPageWindow(c);
      expect(w.startIndex).toBeLessThanOrEqual(w.endIndex);
      expect(w.endIndex).toBeLessThanOrEqual(Math.max(0, c.totalCount));
      expect(w.count).toBe(w.endIndex - w.startIndex);
    }
  });

  it("pageCount >= 1 always", () => {
    for (const totalCount of [0, 1, 5, 100, 1000]) {
      const w = computePluginBrowserPageWindow({
        totalCount,
        currentPage: 0,
        pageSize: 10,
      });
      expect(w.pageCount).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("slicePluginBrowserPage", () => {
  it("returns the window slice of an array", () => {
    const arr = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const w = computePluginBrowserPageWindow({
      totalCount: 10,
      currentPage: 1,
      pageSize: 3,
    });
    expect(slicePluginBrowserPage(arr, w)).toEqual([3, 4, 5]);
  });

  it("returns the partial slice on a last page", () => {
    const arr = [0, 1, 2, 3, 4, 5, 6];
    const w = computePluginBrowserPageWindow({
      totalCount: 7,
      currentPage: 1,
      pageSize: 5,
    });
    expect(slicePluginBrowserPage(arr, w)).toEqual([5, 6]);
  });

  it("returns [] for an empty source", () => {
    const w = computePluginBrowserPageWindow({
      totalCount: 0,
      currentPage: 0,
      pageSize: 10,
    });
    expect(slicePluginBrowserPage([], w)).toEqual([]);
  });

  it("returns a fresh array (not a reference to the source)", () => {
    const arr = [1, 2, 3];
    const w = computePluginBrowserPageWindow({
      totalCount: 3,
      currentPage: 0,
      pageSize: 10,
    });
    const out = slicePluginBrowserPage(arr, w);
    expect(out).not.toBe(arr);
    expect(out).toEqual(arr);
  });
});

describe("DEFAULT_PLUGIN_BROWSER_PAGE_SIZE", () => {
  it("is a positive integer", () => {
    expect(DEFAULT_PLUGIN_BROWSER_PAGE_SIZE).toBeGreaterThan(0);
    expect(Number.isInteger(DEFAULT_PLUGIN_BROWSER_PAGE_SIZE)).toBe(true);
  });
});

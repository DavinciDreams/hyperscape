import { describe, expect, it } from "vitest";
import {
  formatCatalogStats,
  formatWidgetEntry,
  formatWidgetList,
  searchCatalog,
} from "../promptHelpers.js";
import { fixtureCatalog } from "./fixtures.js";

describe("formatWidgetList", () => {
  it("emits 'no widgets found' for empty input", () => {
    const r = formatWidgetList([]);
    expect(r.text).toContain("No widgets found");
    expect(r.data.count).toBe(0);
  });

  it("emits one summary line per widget", () => {
    const r = formatWidgetList(fixtureCatalog.widgets);
    expect(r.data.count).toBe(2);
    expect(r.summary).toContain("com.test.demo.alpha");
    expect(r.summary).toContain("com.test.demo.beta");
  });

  it("mentions category in lead when filtered", () => {
    const r = formatWidgetList([fixtureCatalog.widgets[0]!], {
      category: "panel",
    });
    expect(r.text).toContain('"panel"');
  });

  it("truncates beyond 30 widgets", () => {
    const many = Array.from({ length: 50 }, (_, i) => ({
      ...fixtureCatalog.widgets[0]!,
      id: `com.test.demo.w${i}`,
    }));
    const r = formatWidgetList(many);
    expect(r.summary).toContain("… and 20 more");
  });
});

describe("formatWidgetEntry", () => {
  it("emits manifest id, category, defaultSize", () => {
    const r = formatWidgetEntry(fixtureCatalog.widgets[0]!);
    expect(r.text).toContain("Alpha");
    expect(r.text).toContain("(com.test.demo.alpha)");
    expect(r.text).toContain("category:    panel");
    expect(r.text).toContain("defaultSize: 4 x 3");
  });

  it("lists props with optional flag and description", () => {
    const r = formatWidgetEntry(fixtureCatalog.widgets[0]!);
    expect(r.text).toContain("label: string");
    expect(r.text).toContain("(optional)");
    expect(r.text).toContain("Label text");
  });
});

describe("formatCatalogStats", () => {
  it("emits one-line summary with category counts", () => {
    const r = formatCatalogStats(fixtureCatalog);
    expect(r.text).toContain("2 widgets");
    expect(r.text).toContain("hud: 1");
    expect(r.text).toContain("panel: 1");
    expect(r.data.total).toBe(2);
  });
});

describe("searchCatalog", () => {
  it("matches across id/name/description/jsdocSummary", () => {
    expect(searchCatalog(fixtureCatalog, "alpha")).toHaveLength(1);
    expect(searchCatalog(fixtureCatalog, "second")).toHaveLength(1);
    expect(searchCatalog(fixtureCatalog, "alpha things")).toHaveLength(1);
    expect(searchCatalog(fixtureCatalog, "nothingmatchesthis")).toHaveLength(0);
  });

  it("is case-insensitive", () => {
    expect(searchCatalog(fixtureCatalog, "ALPHA")).toHaveLength(1);
  });
});

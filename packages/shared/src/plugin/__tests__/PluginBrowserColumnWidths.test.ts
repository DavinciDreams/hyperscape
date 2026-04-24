import { describe, expect, it } from "vitest";
import {
  createPluginBrowserColumnWidths,
  type PluginBrowserColumnWidthDefinition,
} from "../PluginBrowserColumnWidths.js";

const COLUMNS: readonly PluginBrowserColumnWidthDefinition[] = [
  { id: "pluginId", defaultPx: 200, minPx: 100, maxPx: 400 },
  { id: "severity", defaultPx: 80, minPx: 60, maxPx: 120 },
  { id: "label", defaultPx: 150 },
  { id: "reasons", defaultPx: 300, minPx: 120 },
];

describe("createPluginBrowserColumnWidths — initial", () => {
  it("records every column and exposes size", () => {
    const w = createPluginBrowserColumnWidths(COLUMNS);
    expect(w.size()).toBe(4);
    for (const c of COLUMNS) expect(w.hasColumn(c.id)).toBe(true);
  });

  it("widthOf() returns the default for a known column", () => {
    const w = createPluginBrowserColumnWidths(COLUMNS);
    expect(w.widthOf("pluginId")).toBe(200);
    expect(w.widthOf("severity")).toBe(80);
    expect(w.widthOf("label")).toBe(150);
  });

  it("widthOf() returns 0 for an unknown id", () => {
    const w = createPluginBrowserColumnWidths(COLUMNS);
    expect(w.widthOf("zzz")).toBe(0);
  });

  it("snapshot() marks every column as `isDefault: true` initially", () => {
    const w = createPluginBrowserColumnWidths(COLUMNS);
    for (const s of w.snapshot()) expect(s.isDefault).toBe(true);
  });

  it("snapshot order matches authored order", () => {
    const w = createPluginBrowserColumnWidths(COLUMNS);
    expect(w.snapshot().map((s) => s.id)).toEqual([
      "pluginId",
      "severity",
      "label",
      "reasons",
    ]);
  });
});

describe("createPluginBrowserColumnWidths — setWidth", () => {
  it("changes the width for a known column", () => {
    const w = createPluginBrowserColumnWidths(COLUMNS);
    w.setWidth("pluginId", 250);
    expect(w.widthOf("pluginId")).toBe(250);
  });

  it("clamps below min", () => {
    const w = createPluginBrowserColumnWidths(COLUMNS);
    w.setWidth("pluginId", 10); // below min 100
    expect(w.widthOf("pluginId")).toBe(100);
  });

  it("clamps above max", () => {
    const w = createPluginBrowserColumnWidths(COLUMNS);
    w.setWidth("pluginId", 9999); // above max 400
    expect(w.widthOf("pluginId")).toBe(400);
  });

  it("floors non-integer values", () => {
    const w = createPluginBrowserColumnWidths(COLUMNS);
    w.setWidth("pluginId", 150.7);
    expect(w.widthOf("pluginId")).toBe(150);
  });

  it("silently ignores unknown ids", () => {
    const w = createPluginBrowserColumnWidths(COLUMNS);
    expect(() => w.setWidth("zzz", 200)).not.toThrow();
    expect(w.hasColumn("zzz")).toBe(false);
  });

  it("silently ignores non-finite widths", () => {
    const w = createPluginBrowserColumnWidths(COLUMNS);
    const before = w.widthOf("pluginId");
    w.setWidth("pluginId", Number.NaN);
    w.setWidth("pluginId", Number.POSITIVE_INFINITY);
    expect(w.widthOf("pluginId")).toBe(before);
  });

  it("flags the column as non-default after setWidth", () => {
    const w = createPluginBrowserColumnWidths(COLUMNS);
    w.setWidth("pluginId", 250);
    const snap = w.snapshot().find((s) => s.id === "pluginId")!;
    expect(snap.isDefault).toBe(false);
    expect(snap.widthPx).toBe(250);
  });
});

describe("createPluginBrowserColumnWidths — reset", () => {
  it("resetColumn() restores the default", () => {
    const w = createPluginBrowserColumnWidths(COLUMNS);
    w.setWidth("pluginId", 250);
    w.resetColumn("pluginId");
    expect(w.widthOf("pluginId")).toBe(200);
    expect(w.snapshot().find((s) => s.id === "pluginId")!.isDefault).toBe(true);
  });

  it("resetAll() restores all defaults", () => {
    const w = createPluginBrowserColumnWidths(COLUMNS);
    w.setWidth("pluginId", 250);
    w.setWidth("severity", 100);
    w.resetAll();
    expect(w.widthOf("pluginId")).toBe(200);
    expect(w.widthOf("severity")).toBe(80);
  });

  it("resetColumn() on unknown id is a silent no-op", () => {
    const w = createPluginBrowserColumnWidths(COLUMNS);
    expect(() => w.resetColumn("zzz")).not.toThrow();
  });
});

describe("createPluginBrowserColumnWidths — totalWidth", () => {
  it("totalWidthPx() sums every column", () => {
    const w = createPluginBrowserColumnWidths(COLUMNS);
    expect(w.totalWidthPx()).toBe(200 + 80 + 150 + 300);
  });

  it("totalWidthForPx() sums only the listed columns", () => {
    const w = createPluginBrowserColumnWidths(COLUMNS);
    expect(w.totalWidthForPx(["pluginId", "label"])).toBe(200 + 150);
  });

  it("totalWidthForPx() ignores unknown ids", () => {
    const w = createPluginBrowserColumnWidths(COLUMNS);
    expect(w.totalWidthForPx(["pluginId", "zzz"])).toBe(200);
  });

  it("total reflects setWidth changes", () => {
    const w = createPluginBrowserColumnWidths(COLUMNS);
    w.setWidth("pluginId", 400);
    expect(w.totalWidthPx()).toBe(400 + 80 + 150 + 300);
  });
});

describe("createPluginBrowserColumnWidths — defaults + clamping at creation", () => {
  it("default is clamped to min", () => {
    const w = createPluginBrowserColumnWidths([
      { id: "a", defaultPx: 10, minPx: 100, maxPx: 500 },
    ]);
    expect(w.widthOf("a")).toBe(100);
  });

  it("default is clamped to max", () => {
    const w = createPluginBrowserColumnWidths([
      { id: "a", defaultPx: 9999, minPx: 100, maxPx: 500 },
    ]);
    expect(w.widthOf("a")).toBe(500);
  });

  it("max < min at creation is treated as max = min", () => {
    const w = createPluginBrowserColumnWidths([
      { id: "a", defaultPx: 200, minPx: 200, maxPx: 100 },
    ]);
    // min=200, max=200 (normalized). default=200. setWidth above
    // gets clamped back to 200.
    expect(w.widthOf("a")).toBe(200);
    w.setWidth("a", 400);
    expect(w.widthOf("a")).toBe(200);
  });

  it("uses default min/max when not specified", () => {
    const w = createPluginBrowserColumnWidths([{ id: "a", defaultPx: 150 }]);
    // defaults: min 40, max 1000
    w.setWidth("a", 10);
    expect(w.widthOf("a")).toBe(40);
    w.setWidth("a", 5000);
    expect(w.widthOf("a")).toBe(1000);
  });
});

describe("createPluginBrowserColumnWidths — dedup", () => {
  it("silently drops duplicate column ids at creation (first wins)", () => {
    const w = createPluginBrowserColumnWidths([
      { id: "a", defaultPx: 100 },
      { id: "b", defaultPx: 150 },
      { id: "a", defaultPx: 999 },
    ]);
    expect(w.size()).toBe(2);
    expect(w.widthOf("a")).toBe(100);
  });
});

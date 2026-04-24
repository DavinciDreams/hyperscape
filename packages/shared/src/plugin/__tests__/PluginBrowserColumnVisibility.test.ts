import { describe, expect, it } from "vitest";
import {
  createPluginBrowserColumnVisibility,
  type PluginBrowserColumnDefinition,
} from "../PluginBrowserColumnVisibility.js";

const COLUMNS: readonly PluginBrowserColumnDefinition[] = [
  { id: "pluginId", label: "Plugin", locked: true },
  { id: "severity", label: "Severity" },
  { id: "label", label: "Label" },
  { id: "reasons", label: "Reasons" },
  { id: "stability", label: "Stability", defaultHidden: true },
];

describe("createPluginBrowserColumnVisibility — initial state", () => {
  it("records every column and exposes size()", () => {
    const c = createPluginBrowserColumnVisibility(COLUMNS);
    expect(c.size()).toBe(5);
    for (const col of COLUMNS) expect(c.hasColumn(col.id)).toBe(true);
  });

  it("locked columns are visible", () => {
    const c = createPluginBrowserColumnVisibility(COLUMNS);
    expect(c.isColumnVisible("pluginId")).toBe(true);
  });

  it("defaultHidden columns start hidden", () => {
    const c = createPluginBrowserColumnVisibility(COLUMNS);
    expect(c.isColumnVisible("stability")).toBe(false);
  });

  it("non-hidden, non-locked columns start visible", () => {
    const c = createPluginBrowserColumnVisibility(COLUMNS);
    expect(c.isColumnVisible("severity")).toBe(true);
    expect(c.isColumnVisible("label")).toBe(true);
    expect(c.isColumnVisible("reasons")).toBe(true);
  });

  it("order() matches authored order", () => {
    const c = createPluginBrowserColumnVisibility(COLUMNS);
    expect(c.order()).toEqual([
      "pluginId",
      "severity",
      "label",
      "reasons",
      "stability",
    ]);
  });

  it("visibleColumnsInOrder() omits hidden-by-default columns", () => {
    const c = createPluginBrowserColumnVisibility(COLUMNS);
    expect(c.visibleColumnsInOrder()).toEqual([
      "pluginId",
      "severity",
      "label",
      "reasons",
    ]);
  });

  it("snapshot() records visibility + locked flag", () => {
    const c = createPluginBrowserColumnVisibility(COLUMNS);
    const snap = c.snapshot();
    const pluginId = snap.find((s) => s.id === "pluginId")!;
    expect(pluginId.locked).toBe(true);
    expect(pluginId.visible).toBe(true);
    const stability = snap.find((s) => s.id === "stability")!;
    expect(stability.locked).toBe(false);
    expect(stability.visible).toBe(false);
  });
});

describe("createPluginBrowserColumnVisibility — show/hide/toggle", () => {
  it("hide() hides a visible column", () => {
    const c = createPluginBrowserColumnVisibility(COLUMNS);
    c.hide("severity");
    expect(c.isColumnVisible("severity")).toBe(false);
  });

  it("show() re-shows a hidden column", () => {
    const c = createPluginBrowserColumnVisibility(COLUMNS);
    c.hide("severity");
    c.show("severity");
    expect(c.isColumnVisible("severity")).toBe(true);
  });

  it("toggle() flips visibility", () => {
    const c = createPluginBrowserColumnVisibility(COLUMNS);
    c.toggle("severity");
    expect(c.isColumnVisible("severity")).toBe(false);
    c.toggle("severity");
    expect(c.isColumnVisible("severity")).toBe(true);
  });

  it("hide() on a locked column is a no-op", () => {
    const c = createPluginBrowserColumnVisibility(COLUMNS);
    c.hide("pluginId");
    expect(c.isColumnVisible("pluginId")).toBe(true);
  });

  it("toggle() on a locked column is a no-op", () => {
    const c = createPluginBrowserColumnVisibility(COLUMNS);
    c.toggle("pluginId");
    expect(c.isColumnVisible("pluginId")).toBe(true);
  });

  it("show()/hide()/toggle() on unknown ids are silent no-ops", () => {
    const c = createPluginBrowserColumnVisibility(COLUMNS);
    expect(() => c.show("zzz")).not.toThrow();
    expect(() => c.hide("zzz")).not.toThrow();
    expect(() => c.toggle("zzz")).not.toThrow();
    expect(c.size()).toBe(5);
    expect(c.hasColumn("zzz")).toBe(false);
  });

  it("show() makes a defaultHidden column visible", () => {
    const c = createPluginBrowserColumnVisibility(COLUMNS);
    c.show("stability");
    expect(c.isColumnVisible("stability")).toBe(true);
    expect(c.visibleColumnsInOrder()).toContain("stability");
  });
});

describe("createPluginBrowserColumnVisibility — bulk show/hide", () => {
  it("showAll() shows every column", () => {
    const c = createPluginBrowserColumnVisibility(COLUMNS);
    c.showAll();
    for (const col of COLUMNS) {
      expect(c.isColumnVisible(col.id)).toBe(true);
    }
  });

  it("hideAll() hides every non-locked column", () => {
    const c = createPluginBrowserColumnVisibility(COLUMNS);
    c.hideAll();
    expect(c.isColumnVisible("pluginId")).toBe(true); // locked
    expect(c.isColumnVisible("severity")).toBe(false);
    expect(c.isColumnVisible("label")).toBe(false);
    expect(c.isColumnVisible("reasons")).toBe(false);
    expect(c.isColumnVisible("stability")).toBe(false);
  });
});

describe("createPluginBrowserColumnVisibility — reset", () => {
  it("restores initial visibility", () => {
    const c = createPluginBrowserColumnVisibility(COLUMNS);
    c.hide("severity");
    c.show("stability");
    c.reset();
    expect(c.isColumnVisible("severity")).toBe(true);
    expect(c.isColumnVisible("stability")).toBe(false);
  });

  it("restores initial order", () => {
    const c = createPluginBrowserColumnVisibility(COLUMNS);
    c.reorder(0, 3);
    c.reorder(1, 0);
    c.reset();
    expect(c.order()).toEqual([
      "pluginId",
      "severity",
      "label",
      "reasons",
      "stability",
    ]);
  });
});

describe("createPluginBrowserColumnVisibility — reorder", () => {
  it("moves a column forward", () => {
    const c = createPluginBrowserColumnVisibility(COLUMNS);
    c.reorder(1, 3); // severity → after reasons
    expect(c.order()).toEqual([
      "pluginId",
      "label",
      "reasons",
      "severity",
      "stability",
    ]);
  });

  it("moves a column backward", () => {
    const c = createPluginBrowserColumnVisibility(COLUMNS);
    c.reorder(3, 1); // reasons → between pluginId and severity
    expect(c.order()).toEqual([
      "pluginId",
      "reasons",
      "severity",
      "label",
      "stability",
    ]);
  });

  it("from === to is a no-op", () => {
    const c = createPluginBrowserColumnVisibility(COLUMNS);
    const before = c.order();
    c.reorder(2, 2);
    expect(c.order()).toEqual(before);
  });

  it("out-of-range indexes are silent no-ops", () => {
    const c = createPluginBrowserColumnVisibility(COLUMNS);
    const before = c.order();
    c.reorder(-1, 0);
    c.reorder(0, 99);
    c.reorder(99, 0);
    c.reorder(Number.NaN, 0);
    expect(c.order()).toEqual(before);
  });
});

describe("createPluginBrowserColumnVisibility — snapshot order reflects reorder", () => {
  it("snapshot follows the current order", () => {
    const c = createPluginBrowserColumnVisibility(COLUMNS);
    c.reorder(1, 4);
    const snap = c.snapshot().map((s) => s.id);
    expect(snap).toEqual(c.order());
  });
});

describe("createPluginBrowserColumnVisibility — dedup at creation", () => {
  it("silently drops duplicate ids from the authored list", () => {
    const c = createPluginBrowserColumnVisibility([
      { id: "a", label: "A" },
      { id: "b", label: "B" },
      { id: "a", label: "A-again" },
    ]);
    expect(c.size()).toBe(2);
    expect(c.order()).toEqual(["a", "b"]);
  });
});

import { describe, expect, it } from "vitest";
import { createPluginBrowserBulkSelection } from "../PluginBrowserBulkSelection.js";

const LIST = ["a", "b", "c", "d", "e"] as const;

describe("createPluginBrowserBulkSelection — empty state", () => {
  it("starts empty with no anchor", () => {
    const s = createPluginBrowserBulkSelection();
    expect(s.size()).toBe(0);
    expect(s.ids()).toEqual([]);
    expect(s.anchor()).toBeNull();
    expect(s.isSelected("a")).toBe(false);
  });
});

describe("createPluginBrowserBulkSelection — toggle", () => {
  it("adds missing ids", () => {
    const s = createPluginBrowserBulkSelection();
    s.toggle("a");
    expect(s.isSelected("a")).toBe(true);
    expect(s.ids()).toEqual(["a"]);
    expect(s.anchor()).toBe("a");
  });

  it("removes present ids", () => {
    const s = createPluginBrowserBulkSelection();
    s.toggle("a");
    s.toggle("a");
    expect(s.isSelected("a")).toBe(false);
    expect(s.ids()).toEqual([]);
    // Anchor stays where it was last set.
    expect(s.anchor()).toBe("a");
  });

  it("anchor moves to most recent toggled id", () => {
    const s = createPluginBrowserBulkSelection();
    s.toggle("a");
    s.toggle("b");
    expect(s.anchor()).toBe("b");
    s.toggle("c");
    expect(s.anchor()).toBe("c");
  });

  it("preserves insertion order in ids()", () => {
    const s = createPluginBrowserBulkSelection();
    s.toggle("c");
    s.toggle("a");
    s.toggle("b");
    expect(s.ids()).toEqual(["c", "a", "b"]);
  });
});

describe("createPluginBrowserBulkSelection — selectOnly", () => {
  it("replaces the selection with a single id", () => {
    const s = createPluginBrowserBulkSelection();
    s.toggle("a");
    s.toggle("b");
    s.selectOnly("c");
    expect(s.ids()).toEqual(["c"]);
    expect(s.anchor()).toBe("c");
  });
});

describe("createPluginBrowserBulkSelection — selectRange", () => {
  it("selects the inclusive range when anchor precedes target", () => {
    const s = createPluginBrowserBulkSelection();
    s.selectOnly("b");
    s.selectRange(LIST, "d");
    expect(s.ids()).toEqual(["b", "c", "d"]);
    // Anchor unmoved.
    expect(s.anchor()).toBe("b");
  });

  it("selects the inclusive range when target precedes anchor", () => {
    const s = createPluginBrowserBulkSelection();
    s.selectOnly("d");
    s.selectRange(LIST, "a");
    expect(s.ids()).toEqual(["a", "b", "c", "d"]);
    expect(s.anchor()).toBe("d");
  });

  it("anchor == target selects just the anchor", () => {
    const s = createPluginBrowserBulkSelection();
    s.selectOnly("c");
    s.selectRange(LIST, "c");
    expect(s.ids()).toEqual(["c"]);
  });

  it("is a no-op when no anchor is set", () => {
    const s = createPluginBrowserBulkSelection();
    s.selectRange(LIST, "c");
    expect(s.size()).toBe(0);
    expect(s.anchor()).toBeNull();
  });

  it("is a no-op when anchor is not in orderedIds", () => {
    const s = createPluginBrowserBulkSelection();
    s.selectOnly("zzz");
    s.selectRange(LIST, "c");
    // Selection is still just the anchor (untouched).
    expect(s.ids()).toEqual(["zzz"]);
  });

  it("is a no-op when target is not in orderedIds", () => {
    const s = createPluginBrowserBulkSelection();
    s.selectOnly("b");
    s.selectRange(LIST, "zzz");
    expect(s.ids()).toEqual(["b"]);
  });

  it("replaces previous selection with the new range", () => {
    const s = createPluginBrowserBulkSelection();
    s.selectOnly("a");
    s.toggle("e");
    // anchor now at "e"
    s.selectRange(LIST, "b");
    // Range is [b..e]; old "a" is dropped.
    expect(s.ids()).toEqual(["b", "c", "d", "e"]);
  });

  it("subsequent range-selects keep the original anchor", () => {
    const s = createPluginBrowserBulkSelection();
    s.selectOnly("b");
    s.selectRange(LIST, "d");
    s.selectRange(LIST, "e");
    // Still anchored at "b".
    expect(s.anchor()).toBe("b");
    expect(s.ids()).toEqual(["b", "c", "d", "e"]);
  });
});

describe("createPluginBrowserBulkSelection — selectAll", () => {
  it("adds every id", () => {
    const s = createPluginBrowserBulkSelection();
    s.selectAll(LIST);
    expect(s.size()).toBe(5);
    expect(s.ids()).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("lands anchor on the last id", () => {
    const s = createPluginBrowserBulkSelection();
    s.selectAll(LIST);
    expect(s.anchor()).toBe("e");
  });

  it("is additive — preserves existing selections", () => {
    const s = createPluginBrowserBulkSelection();
    s.toggle("z");
    s.selectAll(LIST);
    expect(s.ids()).toEqual(["z", "a", "b", "c", "d", "e"]);
  });

  it("empty orderedIds leaves state unchanged", () => {
    const s = createPluginBrowserBulkSelection();
    s.toggle("a");
    s.selectAll([]);
    expect(s.ids()).toEqual(["a"]);
    expect(s.anchor()).toBe("a");
  });
});

describe("createPluginBrowserBulkSelection — clear", () => {
  it("empties the selection and resets the anchor", () => {
    const s = createPluginBrowserBulkSelection();
    s.selectAll(LIST);
    s.clear();
    expect(s.size()).toBe(0);
    expect(s.anchor()).toBeNull();
  });

  it("is idempotent on an empty selection", () => {
    const s = createPluginBrowserBulkSelection();
    s.clear();
    s.clear();
    expect(s.size()).toBe(0);
  });
});

describe("createPluginBrowserBulkSelection — ids() snapshot", () => {
  it("returns a fresh array each call", () => {
    const s = createPluginBrowserBulkSelection();
    s.toggle("a");
    const a = s.ids();
    s.toggle("b");
    const b = s.ids();
    expect(a).not.toBe(b);
    expect(a).toEqual(["a"]);
    expect(b).toEqual(["a", "b"]);
  });
});

describe("createPluginBrowserBulkSelection — realistic file-manager flow", () => {
  it("models click → shift-click → ctrl-click", () => {
    const s = createPluginBrowserBulkSelection();
    // Click "b"
    s.selectOnly("b");
    expect(s.ids()).toEqual(["b"]);
    // Shift-click "d" → range [b..d]
    s.selectRange(LIST, "d");
    expect(s.ids()).toEqual(["b", "c", "d"]);
    // Ctrl-click "a" → toggle adds "a" but does NOT clear
    s.toggle("a");
    expect(s.ids()).toEqual(["b", "c", "d", "a"]);
    // Ctrl-click "c" again → removes "c"
    s.toggle("c");
    expect(s.ids()).toEqual(["b", "d", "a"]);
    // Anchor tracks most-recent toggle target.
    expect(s.anchor()).toBe("c");
  });
});

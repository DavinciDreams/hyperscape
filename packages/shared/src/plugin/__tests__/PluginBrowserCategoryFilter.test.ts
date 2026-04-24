import { describe, expect, it } from "vitest";
import { createPluginBrowserCategoryFilter } from "../PluginBrowserCategoryFilter.js";

describe("createPluginBrowserCategoryFilter — defaults", () => {
  it("starts empty with mode='any'", () => {
    const f = createPluginBrowserCategoryFilter();
    expect(f.selected()).toEqual([]);
    expect(f.count()).toBe(0);
    expect(f.mode()).toBe("any");
  });

  it("accepts valid initial mode", () => {
    const f = createPluginBrowserCategoryFilter("all");
    expect(f.mode()).toBe("all");
  });

  it("falls back to 'any' on invalid initial mode", () => {
    const f = createPluginBrowserCategoryFilter("bogus" as unknown as "any");
    expect(f.mode()).toBe("any");
  });

  it("empty selection → matches everything", () => {
    const f = createPluginBrowserCategoryFilter();
    expect(f.matches(["anything", "at", "all"])).toBe(true);
    expect(f.matches([])).toBe(true);
  });
});

describe("createPluginBrowserCategoryFilter — add / remove / toggle", () => {
  it("adds a new selection", () => {
    const f = createPluginBrowserCategoryFilter();
    expect(f.add("social")).toBe(true);
    expect(f.isSelected("social")).toBe(true);
    expect(f.count()).toBe(1);
  });

  it("rejects duplicate / empty add", () => {
    const f = createPluginBrowserCategoryFilter();
    f.add("social");
    expect(f.add("social")).toBe(false);
    expect(f.add("")).toBe(false);
  });

  it("removes an existing selection", () => {
    const f = createPluginBrowserCategoryFilter();
    f.add("social");
    expect(f.remove("social")).toBe(true);
    expect(f.isSelected("social")).toBe(false);
  });

  it("remove returns false for unknown / empty", () => {
    const f = createPluginBrowserCategoryFilter();
    expect(f.remove("nothere")).toBe(false);
    expect(f.remove("")).toBe(false);
  });

  it("toggle adds when absent, removes when present", () => {
    const f = createPluginBrowserCategoryFilter();
    expect(f.toggle("a")).toBe(true);
    expect(f.isSelected("a")).toBe(true);
    expect(f.toggle("a")).toBe(false);
    expect(f.isSelected("a")).toBe(false);
  });

  it("toggle empty returns false", () => {
    const f = createPluginBrowserCategoryFilter();
    expect(f.toggle("")).toBe(false);
  });
});

describe("createPluginBrowserCategoryFilter — setAll", () => {
  it("replaces the entire selection", () => {
    const f = createPluginBrowserCategoryFilter();
    f.add("old");
    f.setAll(["a", "b", "c"]);
    expect(f.selected()).toEqual(["a", "b", "c"]);
  });

  it("silently drops empty strings and dupes", () => {
    const f = createPluginBrowserCategoryFilter();
    f.setAll(["a", "", "a", "b", "b"]);
    expect(f.selected()).toEqual(["a", "b"]);
  });

  it("empty array clears selection", () => {
    const f = createPluginBrowserCategoryFilter();
    f.add("a");
    f.setAll([]);
    expect(f.selected()).toEqual([]);
  });
});

describe("createPluginBrowserCategoryFilter — mode", () => {
  it("setMode toggles between 'any' and 'all'", () => {
    const f = createPluginBrowserCategoryFilter();
    expect(f.setMode("all")).toBe(true);
    expect(f.mode()).toBe("all");
  });

  it("setMode idempotent on unchanged", () => {
    const f = createPluginBrowserCategoryFilter();
    expect(f.setMode("any")).toBe(false);
  });

  it("setMode rejects invalid", () => {
    const f = createPluginBrowserCategoryFilter();
    expect(f.setMode("bogus" as unknown as "any")).toBe(false);
  });
});

describe("createPluginBrowserCategoryFilter — matches (any mode)", () => {
  it("OR semantics — at least one intersects", () => {
    const f = createPluginBrowserCategoryFilter("any");
    f.setAll(["social", "tools"]);
    expect(f.matches(["tools", "ui"])).toBe(true);
    expect(f.matches(["social"])).toBe(true);
  });

  it("OR no overlap → false", () => {
    const f = createPluginBrowserCategoryFilter("any");
    f.setAll(["social"]);
    expect(f.matches(["ui", "tools"])).toBe(false);
  });

  it("OR empty plugin cats → false when filter active", () => {
    const f = createPluginBrowserCategoryFilter("any");
    f.setAll(["social"]);
    expect(f.matches([])).toBe(false);
  });
});

describe("createPluginBrowserCategoryFilter — matches (all mode)", () => {
  it("AND semantics — every selected must be present", () => {
    const f = createPluginBrowserCategoryFilter("all");
    f.setAll(["social", "tools"]);
    expect(f.matches(["social", "tools", "ui"])).toBe(true);
  });

  it("AND missing any → false", () => {
    const f = createPluginBrowserCategoryFilter("all");
    f.setAll(["social", "tools"]);
    expect(f.matches(["social"])).toBe(false);
    expect(f.matches(["tools"])).toBe(false);
  });

  it("AND single selected → equivalent to 'contains'", () => {
    const f = createPluginBrowserCategoryFilter("all");
    f.setAll(["social"]);
    expect(f.matches(["social", "tools"])).toBe(true);
    expect(f.matches(["tools"])).toBe(false);
  });

  it("AND empty plugin cats → false", () => {
    const f = createPluginBrowserCategoryFilter("all");
    f.setAll(["social"]);
    expect(f.matches([])).toBe(false);
  });
});

describe("createPluginBrowserCategoryFilter — matches hygiene", () => {
  it("ignores empty-string / non-string plugin categories", () => {
    const f = createPluginBrowserCategoryFilter("any");
    f.setAll(["social"]);
    expect(f.matches(["", "social"])).toBe(true);
    expect(f.matches(["", ""])).toBe(false);
  });

  it("non-array plugin categories → false when filter active", () => {
    const f = createPluginBrowserCategoryFilter("any");
    f.setAll(["social"]);
    expect(f.matches(null as unknown as readonly string[])).toBe(false);
  });
});

describe("createPluginBrowserCategoryFilter — snapshot / clear", () => {
  it("selected() is snapshot-isolated", () => {
    const f = createPluginBrowserCategoryFilter();
    f.setAll(["a", "b"]);
    const snap = f.selected() as unknown as unknown[];
    snap.length = 0;
    expect(f.count()).toBe(2);
  });

  it("clear drops selection but preserves mode", () => {
    const f = createPluginBrowserCategoryFilter("all");
    f.setAll(["a", "b"]);
    f.clear();
    expect(f.count()).toBe(0);
    expect(f.mode()).toBe("all");
  });
});

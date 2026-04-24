import { describe, expect, it } from "vitest";
import { createPluginBrowserTagFilter } from "../PluginBrowserTagFilter.js";

describe("createPluginBrowserTagFilter — defaults", () => {
  it("starts empty", () => {
    const f = createPluginBrowserTagFilter();
    expect(f.isEmpty()).toBe(true);
    expect(f.requireTags()).toEqual([]);
    expect(f.excludeTags()).toEqual([]);
  });

  it("empty filter matches any row", () => {
    const f = createPluginBrowserTagFilter();
    expect(f.matches([])).toBe(true);
    expect(f.matches(["a", "b"])).toBe(true);
  });

  it("stateOf returns neutral for unseen tags", () => {
    const f = createPluginBrowserTagFilter();
    expect(f.stateOf("x")).toBe("neutral");
    expect(f.stateOf("")).toBe("neutral");
  });
});

describe("createPluginBrowserTagFilter — initial seeds", () => {
  it("seeds require tags", () => {
    const f = createPluginBrowserTagFilter({
      initialRequireTags: ["a", "b"],
    });
    expect(f.requireTags()).toEqual(["a", "b"]);
  });

  it("seeds exclude tags", () => {
    const f = createPluginBrowserTagFilter({
      initialExcludeTags: ["x", "y"],
    });
    expect(f.excludeTags()).toEqual(["x", "y"]);
  });

  it("exclude-wins when the same seed lands in both", () => {
    const f = createPluginBrowserTagFilter({
      initialRequireTags: ["a"],
      initialExcludeTags: ["a"],
    });
    expect(f.stateOf("a")).toBe("exclude");
    expect(f.requireTags()).toEqual([]);
  });

  it("drops empty strings from seeds", () => {
    const f = createPluginBrowserTagFilter({
      initialRequireTags: ["a", "", "b"],
      initialExcludeTags: ["", "x"],
    });
    expect(f.requireTags()).toEqual(["a", "b"]);
    expect(f.excludeTags()).toEqual(["x"]);
  });
});

describe("createPluginBrowserTagFilter — requireTag", () => {
  it("adds to require set", () => {
    const f = createPluginBrowserTagFilter();
    expect(f.requireTag("a")).toBe(true);
    expect(f.stateOf("a")).toBe("require");
  });

  it("returns false when already require", () => {
    const f = createPluginBrowserTagFilter();
    f.requireTag("a");
    expect(f.requireTag("a")).toBe(false);
  });

  it("moves tag from exclude to require", () => {
    const f = createPluginBrowserTagFilter();
    f.excludeTag("a");
    expect(f.requireTag("a")).toBe(true);
    expect(f.stateOf("a")).toBe("require");
    expect(f.excludeTags()).toEqual([]);
  });

  it("rejects empty id", () => {
    const f = createPluginBrowserTagFilter();
    expect(f.requireTag("")).toBe(false);
    expect(f.isEmpty()).toBe(true);
  });
});

describe("createPluginBrowserTagFilter — excludeTag", () => {
  it("adds to exclude set", () => {
    const f = createPluginBrowserTagFilter();
    expect(f.excludeTag("a")).toBe(true);
    expect(f.stateOf("a")).toBe("exclude");
  });

  it("returns false when already exclude", () => {
    const f = createPluginBrowserTagFilter();
    f.excludeTag("a");
    expect(f.excludeTag("a")).toBe(false);
  });

  it("moves tag from require to exclude", () => {
    const f = createPluginBrowserTagFilter();
    f.requireTag("a");
    expect(f.excludeTag("a")).toBe(true);
    expect(f.stateOf("a")).toBe("exclude");
    expect(f.requireTags()).toEqual([]);
  });

  it("rejects empty id", () => {
    const f = createPluginBrowserTagFilter();
    expect(f.excludeTag("")).toBe(false);
    expect(f.isEmpty()).toBe(true);
  });
});

describe("createPluginBrowserTagFilter — unsetTag", () => {
  it("removes from require", () => {
    const f = createPluginBrowserTagFilter();
    f.requireTag("a");
    expect(f.unsetTag("a")).toBe(true);
    expect(f.stateOf("a")).toBe("neutral");
  });

  it("removes from exclude", () => {
    const f = createPluginBrowserTagFilter();
    f.excludeTag("a");
    expect(f.unsetTag("a")).toBe(true);
    expect(f.stateOf("a")).toBe("neutral");
  });

  it("returns false on unknown tag", () => {
    const f = createPluginBrowserTagFilter();
    expect(f.unsetTag("never-added")).toBe(false);
  });

  it("returns false on empty id", () => {
    const f = createPluginBrowserTagFilter();
    f.requireTag("a");
    expect(f.unsetTag("")).toBe(false);
    expect(f.requireTags()).toEqual(["a"]);
  });
});

describe("createPluginBrowserTagFilter — cycleTag", () => {
  it("neutral → require → exclude → neutral", () => {
    const f = createPluginBrowserTagFilter();
    f.cycleTag("a");
    expect(f.stateOf("a")).toBe("require");
    f.cycleTag("a");
    expect(f.stateOf("a")).toBe("exclude");
    f.cycleTag("a");
    expect(f.stateOf("a")).toBe("neutral");
  });

  it("is a no-op on empty id", () => {
    const f = createPluginBrowserTagFilter();
    f.cycleTag("");
    expect(f.isEmpty()).toBe(true);
  });
});

describe("createPluginBrowserTagFilter — clear", () => {
  it("empties both sets", () => {
    const f = createPluginBrowserTagFilter();
    f.requireTag("a");
    f.excludeTag("b");
    f.clear();
    expect(f.isEmpty()).toBe(true);
  });
});

describe("createPluginBrowserTagFilter — matches", () => {
  it("require passes only when all tags present", () => {
    const f = createPluginBrowserTagFilter();
    f.requireTag("a");
    f.requireTag("b");
    expect(f.matches(["a", "b"])).toBe(true);
    expect(f.matches(["a", "b", "c"])).toBe(true);
    expect(f.matches(["a"])).toBe(false);
  });

  it("exclude rejects when any excluded tag is present", () => {
    const f = createPluginBrowserTagFilter();
    f.excludeTag("x");
    expect(f.matches(["a", "b"])).toBe(true);
    expect(f.matches(["a", "x"])).toBe(false);
  });

  it("combines require + exclude", () => {
    const f = createPluginBrowserTagFilter();
    f.requireTag("a");
    f.excludeTag("x");
    expect(f.matches(["a", "b"])).toBe(true);
    expect(f.matches(["a", "x"])).toBe(false);
    expect(f.matches(["b"])).toBe(false);
  });

  it("ignores duplicate tags in row bag", () => {
    const f = createPluginBrowserTagFilter();
    f.requireTag("a");
    expect(f.matches(["a", "a", "a"])).toBe(true);
  });

  it("skips invalid tags in row bag", () => {
    const f = createPluginBrowserTagFilter();
    f.requireTag("a");
    expect(f.matches(["", "a"])).toBe(true);
    // Non-string entries are dropped.
    expect(f.matches(["a", null as unknown as string])).toBe(true);
  });
});

describe("createPluginBrowserTagFilter — snapshot", () => {
  it("returns a fresh snapshot", () => {
    const f = createPluginBrowserTagFilter();
    f.requireTag("a");
    f.excludeTag("x");
    const snap = f.snapshot();
    expect(snap).toEqual({
      requireTags: ["a"],
      excludeTags: ["x"],
    });
  });

  it("snapshot arrays do not mutate internal state", () => {
    const f = createPluginBrowserTagFilter();
    f.requireTag("a");
    const snap = f.snapshot();
    (snap.requireTags as string[]).length = 0;
    expect(f.requireTags()).toEqual(["a"]);
  });
});

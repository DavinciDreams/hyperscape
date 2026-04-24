import { describe, expect, it } from "vitest";
import { nextFocusedPluginId } from "../PluginBrowserFocusNavigator.js";

const LIST = ["a", "b", "c", "d", "e"] as const;

describe("nextFocusedPluginId — empty list", () => {
  it("always returns null", () => {
    expect(nextFocusedPluginId([], null, "next")).toBeNull();
    expect(nextFocusedPluginId([], "a", "prev")).toBeNull();
    expect(nextFocusedPluginId([], null, "first")).toBeNull();
    expect(nextFocusedPluginId([], "a", "pageDown")).toBeNull();
  });
});

describe("nextFocusedPluginId — first/last/home/end", () => {
  it("first/home always resolves to the first id", () => {
    expect(nextFocusedPluginId(LIST, null, "first")).toBe("a");
    expect(nextFocusedPluginId(LIST, "c", "first")).toBe("a");
    expect(nextFocusedPluginId(LIST, "zzz", "home")).toBe("a");
  });

  it("last/end always resolves to the final id", () => {
    expect(nextFocusedPluginId(LIST, null, "last")).toBe("e");
    expect(nextFocusedPluginId(LIST, "c", "last")).toBe("e");
    expect(nextFocusedPluginId(LIST, "zzz", "end")).toBe("e");
  });
});

describe("nextFocusedPluginId — next / prev (no wrap)", () => {
  it("advances by one", () => {
    expect(nextFocusedPluginId(LIST, "a", "next")).toBe("b");
    expect(nextFocusedPluginId(LIST, "d", "next")).toBe("e");
  });

  it("stops at the end when wrap is off", () => {
    expect(nextFocusedPluginId(LIST, "e", "next")).toBe("e");
  });

  it("retreats by one", () => {
    expect(nextFocusedPluginId(LIST, "e", "prev")).toBe("d");
    expect(nextFocusedPluginId(LIST, "b", "prev")).toBe("a");
  });

  it("stops at the start when wrap is off", () => {
    expect(nextFocusedPluginId(LIST, "a", "prev")).toBe("a");
  });

  it("null current jumps to first", () => {
    expect(nextFocusedPluginId(LIST, null, "next")).toBe("a");
    expect(nextFocusedPluginId(LIST, null, "prev")).toBe("a");
  });

  it("unknown current jumps to first", () => {
    expect(nextFocusedPluginId(LIST, "missing", "next")).toBe("a");
    expect(nextFocusedPluginId(LIST, "missing", "prev")).toBe("a");
  });
});

describe("nextFocusedPluginId — next / prev (wrap)", () => {
  it("wraps forward past the end", () => {
    expect(nextFocusedPluginId(LIST, "e", "next", { wrap: true })).toBe("a");
  });

  it("wraps backward past the start", () => {
    expect(nextFocusedPluginId(LIST, "a", "prev", { wrap: true })).toBe("e");
  });

  it("does not wrap when inside the list", () => {
    expect(nextFocusedPluginId(LIST, "b", "next", { wrap: true })).toBe("c");
    expect(nextFocusedPluginId(LIST, "c", "prev", { wrap: true })).toBe("b");
  });
});

describe("nextFocusedPluginId — pageDown / pageUp", () => {
  it("pageDown advances by pageSize", () => {
    expect(nextFocusedPluginId(LIST, "a", "pageDown", { pageSize: 2 })).toBe(
      "c",
    );
    expect(nextFocusedPluginId(LIST, "b", "pageDown", { pageSize: 2 })).toBe(
      "d",
    );
  });

  it("pageDown clamps to the last id", () => {
    expect(nextFocusedPluginId(LIST, "c", "pageDown", { pageSize: 10 })).toBe(
      "e",
    );
    expect(nextFocusedPluginId(LIST, "d", "pageDown", { pageSize: 2 })).toBe(
      "e",
    );
  });

  it("pageUp retreats by pageSize", () => {
    expect(nextFocusedPluginId(LIST, "e", "pageUp", { pageSize: 2 })).toBe("c");
    expect(nextFocusedPluginId(LIST, "d", "pageUp", { pageSize: 2 })).toBe("b");
  });

  it("pageUp clamps to the first id", () => {
    expect(nextFocusedPluginId(LIST, "b", "pageUp", { pageSize: 10 })).toBe(
      "a",
    );
    expect(nextFocusedPluginId(LIST, "a", "pageUp", { pageSize: 2 })).toBe("a");
  });

  it("null current jumps to first on paging", () => {
    expect(nextFocusedPluginId(LIST, null, "pageDown")).toBe("a");
    expect(nextFocusedPluginId(LIST, null, "pageUp")).toBe("a");
  });

  it("defaults pageSize to 10", () => {
    expect(nextFocusedPluginId(LIST, "a", "pageDown")).toBe("e");
    expect(nextFocusedPluginId(LIST, "e", "pageUp")).toBe("a");
  });

  it("clamps pageSize to >= 1", () => {
    expect(nextFocusedPluginId(LIST, "b", "pageDown", { pageSize: 0 })).toBe(
      "c",
    );
    expect(nextFocusedPluginId(LIST, "b", "pageDown", { pageSize: -5 })).toBe(
      "c",
    );
  });

  it("floors fractional pageSize", () => {
    expect(nextFocusedPluginId(LIST, "a", "pageDown", { pageSize: 2.9 })).toBe(
      "c",
    );
  });
});

describe("nextFocusedPluginId — purity", () => {
  it("does not mutate the input list", () => {
    const rows = ["x", "y", "z"];
    const copy = rows.slice();
    nextFocusedPluginId(rows, "x", "next");
    nextFocusedPluginId(rows, "z", "pageUp", { pageSize: 3 });
    expect(rows).toEqual(copy);
  });

  it("is deterministic for identical inputs", () => {
    const r1 = nextFocusedPluginId(LIST, "c", "pageDown", { pageSize: 2 });
    const r2 = nextFocusedPluginId(LIST, "c", "pageDown", { pageSize: 2 });
    expect(r1).toBe(r2);
  });
});

describe("nextFocusedPluginId — single-item list", () => {
  it("every command resolves to that item", () => {
    const one = ["only"];
    expect(nextFocusedPluginId(one, null, "first")).toBe("only");
    expect(nextFocusedPluginId(one, null, "next")).toBe("only");
    expect(nextFocusedPluginId(one, "only", "next")).toBe("only");
    expect(nextFocusedPluginId(one, "only", "prev")).toBe("only");
    expect(nextFocusedPluginId(one, "only", "pageDown")).toBe("only");
    expect(nextFocusedPluginId(one, "only", "pageUp")).toBe("only");
    expect(nextFocusedPluginId(one, "only", "next", { wrap: true })).toBe(
      "only",
    );
    expect(nextFocusedPluginId(one, "only", "prev", { wrap: true })).toBe(
      "only",
    );
  });
});

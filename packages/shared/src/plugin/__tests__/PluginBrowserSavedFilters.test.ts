import { describe, expect, it } from "vitest";
import { createPluginBrowserSavedFilters } from "../PluginBrowserSavedFilters.js";

interface FilterPayload {
  readonly severity: string;
  readonly search: string;
}

describe("createPluginBrowserSavedFilters — defaults", () => {
  it("starts empty", () => {
    const f = createPluginBrowserSavedFilters<FilterPayload>();
    expect(f.size()).toBe(0);
    expect(f.list()).toEqual([]);
  });

  it("default capacity 50", () => {
    const f = createPluginBrowserSavedFilters<FilterPayload>();
    expect(f.capacity()).toBe(50);
  });

  it("custom capacity", () => {
    const f = createPluginBrowserSavedFilters<FilterPayload>({
      capacity: 3,
    });
    expect(f.capacity()).toBe(3);
  });

  it("non-finite / negative capacity falls back to default", () => {
    expect(
      createPluginBrowserSavedFilters({
        capacity: Number.NaN,
      }).capacity(),
    ).toBe(50);
    expect(
      createPluginBrowserSavedFilters({
        capacity: -5,
      }).capacity(),
    ).toBe(50);
  });

  it("seeds from initialFilters", () => {
    const f = createPluginBrowserSavedFilters<FilterPayload>({
      initialFilters: [
        { name: "All", payload: { severity: "", search: "" } },
        {
          name: "Errors",
          payload: { severity: "error", search: "" },
        },
      ],
    });
    expect(f.names()).toEqual(["All", "Errors"]);
  });

  it("dedupes seed first-wins + drops empty names", () => {
    const f = createPluginBrowserSavedFilters<FilterPayload>({
      initialFilters: [
        { name: "A", payload: { severity: "", search: "1" } },
        { name: "", payload: { severity: "", search: "x" } },
        { name: "A", payload: { severity: "", search: "2" } },
      ],
    });
    expect(f.size()).toBe(1);
    expect(f.get("A")?.search).toBe("1");
  });

  it("respects capacity on seed", () => {
    const f = createPluginBrowserSavedFilters<FilterPayload>({
      capacity: 2,
      initialFilters: [
        { name: "a", payload: { severity: "", search: "" } },
        { name: "b", payload: { severity: "", search: "" } },
        { name: "c", payload: { severity: "", search: "" } },
      ],
    });
    expect(f.names()).toEqual(["a", "b"]);
  });
});

describe("createPluginBrowserSavedFilters — save/get", () => {
  it("save adds a new preset", () => {
    const f = createPluginBrowserSavedFilters<FilterPayload>();
    expect(f.save("Errors", { severity: "error", search: "" })).toBe(true);
    expect(f.has("Errors")).toBe(true);
    expect(f.get("Errors")?.severity).toBe("error");
  });

  it("save trims the name", () => {
    const f = createPluginBrowserSavedFilters<FilterPayload>();
    f.save("  Foo  ", { severity: "", search: "" });
    expect(f.has("Foo")).toBe(true);
  });

  it("save is case-sensitive", () => {
    const f = createPluginBrowserSavedFilters<FilterPayload>();
    f.save("Foo", { severity: "", search: "1" });
    f.save("foo", { severity: "", search: "2" });
    expect(f.size()).toBe(2);
  });

  it("save on existing name updates in place (order preserved)", () => {
    const f = createPluginBrowserSavedFilters<FilterPayload>();
    f.save("a", { severity: "", search: "1" });
    f.save("b", { severity: "", search: "2" });
    f.save("a", { severity: "", search: "updated" });
    expect(f.names()).toEqual(["a", "b"]);
    expect(f.get("a")?.search).toBe("updated");
  });

  it("save rejects empty / whitespace-only names", () => {
    const f = createPluginBrowserSavedFilters<FilterPayload>();
    expect(f.save("", { severity: "", search: "" })).toBe(false);
    expect(f.save("  ", { severity: "", search: "" })).toBe(false);
    expect(f.size()).toBe(0);
  });

  it("capacity=0 refuses saves", () => {
    const f = createPluginBrowserSavedFilters<FilterPayload>({
      capacity: 0,
    });
    expect(f.save("a", { severity: "", search: "" })).toBe(false);
    expect(f.size()).toBe(0);
  });

  it("get returns undefined for unknown", () => {
    const f = createPluginBrowserSavedFilters<FilterPayload>();
    expect(f.get("zzz")).toBeUndefined();
    expect(f.get("")).toBeUndefined();
  });
});

describe("createPluginBrowserSavedFilters — capacity eviction", () => {
  it("evicts oldest on new save past capacity", () => {
    const f = createPluginBrowserSavedFilters<FilterPayload>({
      capacity: 2,
    });
    f.save("a", { severity: "", search: "" });
    f.save("b", { severity: "", search: "" });
    f.save("c", { severity: "", search: "" });
    expect(f.names()).toEqual(["b", "c"]);
  });

  it("updates never evict", () => {
    const f = createPluginBrowserSavedFilters<FilterPayload>({
      capacity: 2,
    });
    f.save("a", { severity: "", search: "1" });
    f.save("b", { severity: "", search: "1" });
    f.save("a", { severity: "", search: "2" });
    expect(f.names()).toEqual(["a", "b"]);
  });
});

describe("createPluginBrowserSavedFilters — remove", () => {
  it("removes a preset and returns true", () => {
    const f = createPluginBrowserSavedFilters<FilterPayload>();
    f.save("a", { severity: "", search: "" });
    expect(f.remove("a")).toBe(true);
    expect(f.has("a")).toBe(false);
  });

  it("remove unknown name returns false", () => {
    const f = createPluginBrowserSavedFilters<FilterPayload>();
    expect(f.remove("zzz")).toBe(false);
  });

  it("remove empty name returns false", () => {
    const f = createPluginBrowserSavedFilters<FilterPayload>();
    expect(f.remove("")).toBe(false);
  });

  it("clear drops everything", () => {
    const f = createPluginBrowserSavedFilters<FilterPayload>();
    f.save("a", { severity: "", search: "" });
    f.save("b", { severity: "", search: "" });
    f.clear();
    expect(f.size()).toBe(0);
  });
});

describe("createPluginBrowserSavedFilters — rename", () => {
  it("renames an existing preset, preserving insertion order", () => {
    const f = createPluginBrowserSavedFilters<FilterPayload>();
    f.save("a", { severity: "", search: "" });
    f.save("b", { severity: "", search: "" });
    f.save("c", { severity: "", search: "" });
    expect(f.rename("b", "B-renamed")).toBe(true);
    expect(f.names()).toEqual(["a", "B-renamed", "c"]);
  });

  it("rename refuses when target already exists", () => {
    const f = createPluginBrowserSavedFilters<FilterPayload>();
    f.save("a", { severity: "", search: "" });
    f.save("b", { severity: "", search: "" });
    expect(f.rename("a", "b")).toBe(false);
    expect(f.names()).toEqual(["a", "b"]);
  });

  it("rename on same name is a no-op (returns true)", () => {
    const f = createPluginBrowserSavedFilters<FilterPayload>();
    f.save("a", { severity: "", search: "1" });
    expect(f.rename("a", "a")).toBe(true);
    expect(f.get("a")?.search).toBe("1");
  });

  it("rename of unknown source returns false", () => {
    const f = createPluginBrowserSavedFilters<FilterPayload>();
    expect(f.rename("zzz", "b")).toBe(false);
  });

  it("rename to empty target returns false", () => {
    const f = createPluginBrowserSavedFilters<FilterPayload>();
    f.save("a", { severity: "", search: "" });
    expect(f.rename("a", "  ")).toBe(false);
  });
});

describe("createPluginBrowserSavedFilters — list/names", () => {
  it("list returns {name, payload} in insertion order", () => {
    const f = createPluginBrowserSavedFilters<FilterPayload>();
    f.save("a", { severity: "", search: "1" });
    f.save("b", { severity: "", search: "2" });
    expect(f.list().map((e) => e.name)).toEqual(["a", "b"]);
    expect(f.list()[1].payload.search).toBe("2");
  });

  it("names returns in insertion order", () => {
    const f = createPluginBrowserSavedFilters<FilterPayload>();
    f.save("c", { severity: "", search: "" });
    f.save("a", { severity: "", search: "" });
    f.save("b", { severity: "", search: "" });
    expect(f.names()).toEqual(["c", "a", "b"]);
  });
});

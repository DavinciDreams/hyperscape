import { describe, expect, it } from "vitest";
import { createPluginBrowserRowExpansion } from "../PluginBrowserRowExpansion.js";

describe("createPluginBrowserRowExpansion — defaults", () => {
  it("starts empty with defaultExpanded=false", () => {
    const e = createPluginBrowserRowExpansion();
    expect(e.size()).toBe(0);
    expect(e.defaultExpanded()).toBe(false);
    expect(e.isExpanded("anything")).toBe(false);
  });

  it("honors defaultExpanded=true baseline", () => {
    const e = createPluginBrowserRowExpansion({
      defaultExpanded: true,
    });
    expect(e.defaultExpanded()).toBe(true);
    expect(e.isExpanded("row-1")).toBe(true);
  });

  it("seeds initiallyExpanded", () => {
    const e = createPluginBrowserRowExpansion({
      initiallyExpanded: ["a", "b"],
    });
    expect(e.isExpanded("a")).toBe(true);
    expect(e.isExpanded("b")).toBe(true);
    expect(e.isExpanded("c")).toBe(false);
    expect(e.size()).toBe(2);
  });

  it("silently drops empty/duplicate initiallyExpanded", () => {
    const e = createPluginBrowserRowExpansion({
      initiallyExpanded: ["a", "", "a", "b"],
    });
    expect(e.size()).toBe(2);
  });
});

describe("createPluginBrowserRowExpansion — expand/collapse", () => {
  it("expand sets a row as open", () => {
    const e = createPluginBrowserRowExpansion();
    e.expand("a");
    expect(e.isExpanded("a")).toBe(true);
  });

  it("collapse sets a row as closed", () => {
    const e = createPluginBrowserRowExpansion({
      defaultExpanded: true,
    });
    e.collapse("a");
    expect(e.isExpanded("a")).toBe(false);
  });

  it("toggle flips current state", () => {
    const e = createPluginBrowserRowExpansion();
    e.toggle("a");
    expect(e.isExpanded("a")).toBe(true);
    e.toggle("a");
    expect(e.isExpanded("a")).toBe(false);
  });

  it("toggle from default baseline flips to non-default", () => {
    const e = createPluginBrowserRowExpansion({
      defaultExpanded: true,
    });
    e.toggle("a"); // default=true → false
    expect(e.isExpanded("a")).toBe(false);
    e.toggle("a"); // false → true
    expect(e.isExpanded("a")).toBe(true);
  });

  it("silently ignores empty/non-string ids", () => {
    const e = createPluginBrowserRowExpansion();
    e.expand("");
    e.collapse("");
    e.toggle("");
    e.expand(null as unknown as string);
    expect(e.size()).toBe(0);
  });
});

describe("createPluginBrowserRowExpansion — batch ops", () => {
  it("expandAll sets every id open", () => {
    const e = createPluginBrowserRowExpansion();
    e.expandAll(["a", "b", "c"]);
    expect(e.explicitlyExpandedIds()).toEqual(["a", "b", "c"]);
  });

  it("collapseAll sets every id closed", () => {
    const e = createPluginBrowserRowExpansion({
      defaultExpanded: true,
    });
    e.collapseAll(["a", "b"]);
    expect(e.explicitlyCollapsedIds()).toEqual(["a", "b"]);
  });

  it("expandAll ignores empty ids", () => {
    const e = createPluginBrowserRowExpansion();
    e.expandAll(["a", "", "b"]);
    expect(e.size()).toBe(2);
  });
});

describe("createPluginBrowserRowExpansion — prune / reset", () => {
  it("prune drops ids not in knownIds", () => {
    const e = createPluginBrowserRowExpansion();
    e.expand("a");
    e.expand("b");
    e.collapse("c");
    e.prune(["a"]);
    expect(e.size()).toBe(1);
    expect(e.isExpanded("a")).toBe(true);
    expect(e.isExpanded("b")).toBe(false); // back to default
    expect(e.isExpanded("c")).toBe(false);
  });

  it("prune with empty knownIds is a no-op", () => {
    const e = createPluginBrowserRowExpansion();
    e.expand("a");
    e.prune([]);
    expect(e.size()).toBe(1);
  });

  it("reset clears all state", () => {
    const e = createPluginBrowserRowExpansion();
    e.expand("a");
    e.collapse("b");
    e.reset();
    expect(e.size()).toBe(0);
    expect(e.isExpanded("a")).toBe(false);
  });
});

describe("createPluginBrowserRowExpansion — explicit id getters", () => {
  it("explicitlyExpandedIds returns only expanded entries", () => {
    const e = createPluginBrowserRowExpansion();
    e.expand("a");
    e.collapse("b");
    e.expand("c");
    expect(e.explicitlyExpandedIds()).toEqual(["a", "c"]);
  });

  it("explicitlyCollapsedIds returns only collapsed entries", () => {
    const e = createPluginBrowserRowExpansion({
      defaultExpanded: true,
    });
    e.collapse("a");
    e.expand("b");
    e.collapse("c");
    expect(e.explicitlyCollapsedIds()).toEqual(["a", "c"]);
  });

  it("expanded + collapsed ids partition the state map", () => {
    const e = createPluginBrowserRowExpansion();
    e.expand("a");
    e.collapse("b");
    expect(
      e.explicitlyExpandedIds().length + e.explicitlyCollapsedIds().length,
    ).toBe(e.size());
  });

  it("order follows insertion order", () => {
    const e = createPluginBrowserRowExpansion();
    e.expand("z");
    e.expand("a");
    e.expand("m");
    expect(e.explicitlyExpandedIds()).toEqual(["z", "a", "m"]);
  });
});

describe("createPluginBrowserRowExpansion — resilience", () => {
  it("state persists across unknown-id checks", () => {
    const e = createPluginBrowserRowExpansion();
    e.expand("a");
    e.isExpanded("b"); // shouldn't mutate anything
    e.isExpanded("c");
    expect(e.size()).toBe(1);
  });

  it("writing after toggle survives", () => {
    const e = createPluginBrowserRowExpansion();
    e.toggle("a");
    e.expand("a");
    expect(e.isExpanded("a")).toBe(true);
  });
});

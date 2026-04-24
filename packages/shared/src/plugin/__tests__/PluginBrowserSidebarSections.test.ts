import { describe, expect, it } from "vitest";
import { createPluginBrowserSidebarSections } from "../PluginBrowserSidebarSections.js";

const SECTIONS = [
  { id: "recent" },
  { id: "favorites" },
  { id: "byAuthor", defaultExpanded: false },
  { id: "byTag" },
] as const;

describe("createPluginBrowserSidebarSections — defaults", () => {
  it("empty sections baseline", () => {
    const s = createPluginBrowserSidebarSections({ sections: [] });
    expect(s.sectionIds()).toEqual([]);
    expect(s.sectionCount()).toBe(0);
  });

  it("defaultExpanded defaults to true when omitted", () => {
    const s = createPluginBrowserSidebarSections({ sections: SECTIONS });
    expect(s.isExpanded("recent")).toBe(true);
    expect(s.isExpanded("favorites")).toBe(true);
    expect(s.isExpanded("byTag")).toBe(true);
  });

  it("honors defaultExpanded=false", () => {
    const s = createPluginBrowserSidebarSections({ sections: SECTIONS });
    expect(s.isExpanded("byAuthor")).toBe(false);
  });

  it("snapshot captures effective state", () => {
    const s = createPluginBrowserSidebarSections({ sections: SECTIONS });
    expect(s.snapshot()).toEqual({
      sections: [
        { id: "recent", expanded: true },
        { id: "favorites", expanded: true },
        { id: "byAuthor", expanded: false },
        { id: "byTag", expanded: true },
      ],
    });
  });
});

describe("createPluginBrowserSidebarSections — dedup / drop-empty", () => {
  it("dedupes duplicates (first wins)", () => {
    const s = createPluginBrowserSidebarSections({
      sections: [{ id: "a" }, { id: "b" }, { id: "a", defaultExpanded: false }],
    });
    expect(s.sectionIds()).toEqual(["a", "b"]);
    expect(s.isExpanded("a")).toBe(true); // first wins
  });

  it("drops empty ids", () => {
    const s = createPluginBrowserSidebarSections({
      sections: [{ id: "a" }, { id: "" }, { id: "b" }],
    });
    expect(s.sectionIds()).toEqual(["a", "b"]);
  });
});

describe("createPluginBrowserSidebarSections — initialOverrides", () => {
  it("seeds explicit state", () => {
    const s = createPluginBrowserSidebarSections({
      sections: SECTIONS,
      initialOverrides: {
        recent: false,
        byAuthor: true,
      },
    });
    expect(s.isExpanded("recent")).toBe(false);
    expect(s.isExpanded("byAuthor")).toBe(true);
  });

  it("ignores overrides for unknown ids", () => {
    const s = createPluginBrowserSidebarSections({
      sections: SECTIONS,
      initialOverrides: { zzz: false },
    });
    expect(s.isExpanded("zzz")).toBe(false); // unknown
    expect(s.sectionCount()).toBe(4);
  });

  it("ignores non-boolean override values", () => {
    const s = createPluginBrowserSidebarSections({
      sections: SECTIONS,
      initialOverrides: {
        recent: "nope" as unknown as boolean,
      },
    });
    expect(s.isExpanded("recent")).toBe(true); // untouched
  });
});

describe("createPluginBrowserSidebarSections — setExpanded", () => {
  it("changes effective state", () => {
    const s = createPluginBrowserSidebarSections({ sections: SECTIONS });
    expect(s.setExpanded("recent", false)).toBe(true);
    expect(s.isExpanded("recent")).toBe(false);
  });

  it("returns false when no effective change", () => {
    const s = createPluginBrowserSidebarSections({ sections: SECTIONS });
    expect(s.setExpanded("recent", true)).toBe(false);
  });

  it("returns false on unknown id", () => {
    const s = createPluginBrowserSidebarSections({ sections: SECTIONS });
    expect(s.setExpanded("zzz", true)).toBe(false);
  });

  it("returns false on empty id", () => {
    const s = createPluginBrowserSidebarSections({ sections: SECTIONS });
    expect(s.setExpanded("", true)).toBe(false);
  });
});

describe("createPluginBrowserSidebarSections — toggle", () => {
  it("flips expanded → collapsed", () => {
    const s = createPluginBrowserSidebarSections({ sections: SECTIONS });
    s.toggle("recent");
    expect(s.isExpanded("recent")).toBe(false);
  });

  it("flips collapsed → expanded (from default=false)", () => {
    const s = createPluginBrowserSidebarSections({ sections: SECTIONS });
    s.toggle("byAuthor");
    expect(s.isExpanded("byAuthor")).toBe(true);
  });

  it("is a no-op on unknown id", () => {
    const s = createPluginBrowserSidebarSections({ sections: SECTIONS });
    s.toggle("zzz");
    expect(s.sectionCount()).toBe(4);
  });
});

describe("createPluginBrowserSidebarSections — expandAll / collapseAll", () => {
  it("expandAll sets every section to true", () => {
    const s = createPluginBrowserSidebarSections({ sections: SECTIONS });
    s.expandAll();
    expect(s.isExpanded("byAuthor")).toBe(true);
    expect(s.isExpanded("recent")).toBe(true);
  });

  it("collapseAll sets every section to false", () => {
    const s = createPluginBrowserSidebarSections({ sections: SECTIONS });
    s.collapseAll();
    expect(s.isExpanded("recent")).toBe(false);
    expect(s.isExpanded("byTag")).toBe(false);
  });
});

describe("createPluginBrowserSidebarSections — reset / resetAll", () => {
  it("reset drops explicit override, restores default", () => {
    const s = createPluginBrowserSidebarSections({ sections: SECTIONS });
    s.setExpanded("byAuthor", true);
    expect(s.isExpanded("byAuthor")).toBe(true);
    expect(s.reset("byAuthor")).toBe(true);
    expect(s.isExpanded("byAuthor")).toBe(false); // back to default=false
  });

  it("reset returns false when no override exists", () => {
    const s = createPluginBrowserSidebarSections({ sections: SECTIONS });
    expect(s.reset("recent")).toBe(false);
  });

  it("reset returns false on unknown id", () => {
    const s = createPluginBrowserSidebarSections({ sections: SECTIONS });
    expect(s.reset("zzz")).toBe(false);
  });

  it("resetAll drops every override", () => {
    const s = createPluginBrowserSidebarSections({ sections: SECTIONS });
    s.collapseAll();
    s.resetAll();
    expect(s.isExpanded("recent")).toBe(true);
    expect(s.isExpanded("byAuthor")).toBe(false); // back to authored default
  });
});

describe("createPluginBrowserSidebarSections — isKnown", () => {
  it("true for authored", () => {
    const s = createPluginBrowserSidebarSections({ sections: SECTIONS });
    expect(s.isKnown("favorites")).toBe(true);
  });

  it("false for unknown / empty", () => {
    const s = createPluginBrowserSidebarSections({ sections: SECTIONS });
    expect(s.isKnown("zzz")).toBe(false);
    expect(s.isKnown("")).toBe(false);
  });
});

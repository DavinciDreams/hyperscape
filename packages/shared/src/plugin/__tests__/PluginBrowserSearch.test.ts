import { describe, expect, it } from "vitest";
import type { PluginBrowserRow } from "../PluginBrowserSnapshot.js";
import { searchPluginBrowser } from "../PluginBrowserSearch.js";

function mkRow(partial: Partial<PluginBrowserRow>): PluginBrowserRow {
  return {
    id: "com.example.plugin",
    name: "Example Plugin",
    version: "1.0.0",
    description: "",
    author: "Acme",
    license: "MIT",
    state: "registered",
    enabledByDefault: true,
    hasFactory: true,
    dependencyIds: [],
    tags: [],
    contributions: {
      systems: 0,
      entities: 0,
      widgets: 0,
      manifestSchemas: 0,
      paletteCategories: 0,
      toolbarTools: 0,
      commands: 0,
    },
    errorMessage: null,
    healthIssues: [],
    ...partial,
  } as PluginBrowserRow;
}

const ROWS: readonly PluginBrowserRow[] = [
  mkRow({
    id: "com.acme.terrain",
    name: "Terrain Tools",
    description: "Sculpt terrain and paint biomes",
    tags: ["editor", "terrain"],
    state: "enabled",
  }),
  mkRow({
    id: "com.acme.combat",
    name: "Combat System",
    description: "Real-time combat loop",
    tags: ["runtime", "combat"],
    state: "loaded",
  }),
  mkRow({
    id: "com.beta.ui",
    name: "UI Pack",
    description: "Editor HUD overlays",
    tags: ["editor", "ui"],
    state: "registered",
    hasFactory: false,
    healthIssues: [
      {
        pluginId: "com.beta.ui",
        kind: "missing-factory",
        severity: "error",
        message: "no factory",
      },
    ],
  }),
];

describe("searchPluginBrowser — filters", () => {
  it("returns all rows when query empty and no filters", () => {
    const result = searchPluginBrowser(ROWS);
    expect(result.map((r) => r.row.id).sort()).toEqual([
      "com.acme.combat",
      "com.acme.terrain",
      "com.beta.ui",
    ]);
    expect(result.every((r) => r.score === 0)).toBe(true);
  });

  it("filters by lifecycle state", () => {
    const result = searchPluginBrowser(ROWS, { states: ["enabled", "loaded"] });
    expect(result.map((r) => r.row.id).sort()).toEqual([
      "com.acme.combat",
      "com.acme.terrain",
    ]);
  });

  it("filters by anyTags (OR)", () => {
    const result = searchPluginBrowser(ROWS, { anyTags: ["combat"] });
    expect(result.map((r) => r.row.id)).toEqual(["com.acme.combat"]);
  });

  it("filters by allTags (AND)", () => {
    const result = searchPluginBrowser(ROWS, { allTags: ["editor", "ui"] });
    expect(result.map((r) => r.row.id)).toEqual(["com.beta.ui"]);
  });

  it("filters by hasHealthIssues=true", () => {
    const result = searchPluginBrowser(ROWS, { hasHealthIssues: true });
    expect(result.map((r) => r.row.id)).toEqual(["com.beta.ui"]);
  });

  it("filters by hasHealthIssues=false", () => {
    const result = searchPluginBrowser(ROWS, { hasHealthIssues: false });
    expect(result.map((r) => r.row.id).sort()).toEqual([
      "com.acme.combat",
      "com.acme.terrain",
    ]);
  });

  it("filters by hasFactory=false", () => {
    const result = searchPluginBrowser(ROWS, { hasFactory: false });
    expect(result.map((r) => r.row.id)).toEqual(["com.beta.ui"]);
  });
});

describe("searchPluginBrowser — scoring", () => {
  it("exact id match outranks substring", () => {
    const result = searchPluginBrowser(ROWS, { query: "com.acme.combat" });
    expect(result[0].row.id).toBe("com.acme.combat");
    expect(result[0].matchedField).toBe("id");
    expect(result[0].score).toBeGreaterThan(0);
  });

  it("prefix match on id ranks above substring in description", () => {
    const result = searchPluginBrowser(ROWS, { query: "com.acme" });
    expect(result.map((r) => r.row.id)).toEqual([
      "com.acme.combat",
      "com.acme.terrain",
    ]);
  });

  it("exact tag match outranks id substring", () => {
    // "terrain" is an exact tag on com.acme.terrain (score 100)
    // AND a substring of id "com.acme.terrain" (score 20). Tag wins.
    const result = searchPluginBrowser(ROWS, { query: "terrain" });
    expect(result[0].row.id).toBe("com.acme.terrain");
    expect(result[0].matchedField).toBe("tag");
  });

  it("matches on description", () => {
    const result = searchPluginBrowser(ROWS, { query: "biomes" });
    expect(result).toHaveLength(1);
    expect(result[0].row.id).toBe("com.acme.terrain");
    expect(result[0].matchedField).toBe("description");
  });

  it("matches on tag (exact)", () => {
    const result = searchPluginBrowser(ROWS, { query: "runtime" });
    expect(result.map((r) => r.row.id)).toEqual(["com.acme.combat"]);
    expect(result[0].matchedField).toBe("tag");
  });

  it("drops rows with no match on non-empty query", () => {
    const result = searchPluginBrowser(ROWS, { query: "xyzzy" });
    expect(result).toEqual([]);
  });

  it("query is case-insensitive", () => {
    const result = searchPluginBrowser(ROWS, { query: "TERRAIN" });
    expect(result[0].row.id).toBe("com.acme.terrain");
  });

  it("ties break alphabetically by id", () => {
    const result = searchPluginBrowser(ROWS, { query: "editor" });
    // both com.acme.terrain and com.beta.ui have tag "editor"
    expect(result.map((r) => r.row.id)).toEqual([
      "com.acme.terrain",
      "com.beta.ui",
    ]);
  });
});

describe("searchPluginBrowser — filter + query composition", () => {
  it("applies filters before scoring", () => {
    const result = searchPluginBrowser(ROWS, {
      query: "editor",
      states: ["enabled"],
    });
    expect(result.map((r) => r.row.id)).toEqual(["com.acme.terrain"]);
  });
});

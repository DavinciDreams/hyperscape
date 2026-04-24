import { describe, expect, it } from "vitest";
import type { PluginBrowserRow } from "../PluginBrowserSnapshot.js";
import {
  groupByAuthor,
  groupByState,
  groupByTag,
} from "../PluginBrowserGroupings.js";

function mkRow(partial: Partial<PluginBrowserRow>): PluginBrowserRow {
  return {
    id: "com.example.plugin",
    name: "Example",
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

describe("groupByState", () => {
  it("buckets rows by lifecycle state", () => {
    const rows = [
      mkRow({ id: "com.a", state: "enabled" }),
      mkRow({ id: "com.b", state: "enabled" }),
      mkRow({ id: "com.c", state: "registered" }),
    ];
    const out = groupByState(rows);
    expect(out).toHaveLength(2);
    expect(out.map((g) => g.key)).toEqual(["enabled", "registered"]);
    expect(out[0].rows.map((r) => r.id)).toEqual(["com.a", "com.b"]);
    expect(out[1].rows.map((r) => r.id)).toEqual(["com.c"]);
  });

  it("omits empty states by default", () => {
    const rows = [mkRow({ id: "com.a", state: "enabled" })];
    const out = groupByState(rows);
    expect(out.map((g) => g.key)).toEqual(["enabled"]);
  });

  it("includeEmptyStates=true seeds all canonical states", () => {
    const rows = [mkRow({ id: "com.a", state: "enabled" })];
    const out = groupByState(rows, { includeEmptyStates: true });
    expect(out.map((g) => g.key).sort()).toEqual([
      "disabled",
      "enabled",
      "failed",
      "loaded",
      "registered",
    ]);
    const enabledBucket = out.find((g) => g.key === "enabled");
    expect(enabledBucket?.rows).toHaveLength(1);
    const disabledBucket = out.find((g) => g.key === "disabled");
    expect(disabledBucket?.rows).toEqual([]);
  });

  it("sorts rows alphabetically within each bucket", () => {
    const rows = [
      mkRow({ id: "com.z", state: "enabled" }),
      mkRow({ id: "com.a", state: "enabled" }),
      mkRow({ id: "com.m", state: "enabled" }),
    ];
    const out = groupByState(rows);
    expect(out[0].rows.map((r) => r.id)).toEqual(["com.a", "com.m", "com.z"]);
  });
});

describe("groupByAuthor", () => {
  it("buckets by author", () => {
    const rows = [
      mkRow({ id: "com.a", author: "Acme" }),
      mkRow({ id: "com.b", author: "Beta" }),
      mkRow({ id: "com.c", author: "Acme" }),
    ];
    const out = groupByAuthor(rows);
    expect(out.map((g) => g.key)).toEqual(["Acme", "Beta"]);
    expect(out[0].rows.map((r) => r.id)).toEqual(["com.a", "com.c"]);
  });

  it("groups empty authors under '(unknown)'", () => {
    const rows = [
      mkRow({ id: "com.a", author: "" }),
      mkRow({ id: "com.b", author: "   " }),
      mkRow({ id: "com.c", author: "Acme" }),
    ];
    const out = groupByAuthor(rows);
    expect(out.map((g) => g.key)).toEqual(["(unknown)", "Acme"]);
    expect(out[0].rows.map((r) => r.id)).toEqual(["com.a", "com.b"]);
  });
});

describe("groupByTag", () => {
  it("buckets rows by each of their tags", () => {
    const rows = [
      mkRow({ id: "com.a", tags: ["editor", "terrain"] }),
      mkRow({ id: "com.b", tags: ["editor"] }),
      mkRow({ id: "com.c", tags: ["runtime"] }),
    ];
    const out = groupByTag(rows);
    expect(out.map((g) => g.key)).toEqual(["editor", "runtime", "terrain"]);
    expect(out[0].rows.map((r) => r.id)).toEqual(["com.a", "com.b"]);
    expect(out[1].rows.map((r) => r.id)).toEqual(["com.c"]);
    expect(out[2].rows.map((r) => r.id)).toEqual(["com.a"]);
  });

  it("groups untagged rows under '(untagged)'", () => {
    const rows = [
      mkRow({ id: "com.a", tags: [] }),
      mkRow({ id: "com.b", tags: ["ui"] }),
    ];
    const out = groupByTag(rows);
    expect(out.map((g) => g.key)).toEqual(["(untagged)", "ui"]);
    expect(out[0].rows.map((r) => r.id)).toEqual(["com.a"]);
  });

  it("returns [] for an empty row list", () => {
    expect(groupByTag([])).toEqual([]);
  });
});

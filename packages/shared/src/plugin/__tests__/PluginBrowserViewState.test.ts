import { describe, expect, it } from "vitest";
import {
  DEFAULT_VIEW_STATE,
  parsePluginBrowserViewState,
  serializePluginBrowserViewState,
  viewStateToOptions,
  type PluginBrowserViewState,
} from "../PluginBrowserViewState.js";

describe("DEFAULT_VIEW_STATE", () => {
  it("is a valid PluginBrowserViewState", () => {
    expect(DEFAULT_VIEW_STATE.filters).toEqual({});
    expect(DEFAULT_VIEW_STATE.sort).toBeNull();
    expect(DEFAULT_VIEW_STATE.groupMode).toBe("none");
    expect(DEFAULT_VIEW_STATE.expandedGroupKeys).toEqual([]);
    expect(DEFAULT_VIEW_STATE.selectedPluginId).toBeNull();
  });
});

describe("viewStateToOptions", () => {
  it("projects state to view options", () => {
    const state: PluginBrowserViewState = {
      filters: { query: "terrain", states: ["enabled"] },
      sort: { column: "name", direction: "asc" },
      groupMode: "author",
      includeEmptyStateGroups: true,
      expandedGroupKeys: ["Alice"],
      selectedPluginId: "com.example",
    };
    const opts = viewStateToOptions(state);
    expect(opts.filters).toEqual({ query: "terrain", states: ["enabled"] });
    expect(opts.sort).toEqual({ column: "name", direction: "asc" });
    expect(opts.groupMode).toBe("author");
    expect(opts.includeEmptyStateGroups).toBe(true);
  });

  it("converts null sort to undefined", () => {
    const opts = viewStateToOptions(DEFAULT_VIEW_STATE);
    expect(opts.sort).toBeUndefined();
  });
});

describe("serialize + parse round-trip", () => {
  it("round-trips default state", () => {
    const wire = serializePluginBrowserViewState(DEFAULT_VIEW_STATE);
    const back = parsePluginBrowserViewState(wire);
    expect(back).toEqual(DEFAULT_VIEW_STATE);
  });

  it("round-trips a populated state", () => {
    const state: PluginBrowserViewState = {
      filters: {
        query: "hyperia",
        states: ["enabled", "failed"],
        anyTags: ["terrain"],
        hasFactory: true,
      },
      sort: { column: "state", direction: "desc" },
      groupMode: "state",
      includeEmptyStateGroups: true,
      expandedGroupKeys: ["enabled", "failed"],
      selectedPluginId: "com.hyperia.terrain",
    };
    const back = parsePluginBrowserViewState(
      serializePluginBrowserViewState(state),
    );
    expect(back).toEqual(state);
  });
});

describe("parsePluginBrowserViewState — fail-soft behavior", () => {
  it("returns default on null input", () => {
    expect(parsePluginBrowserViewState(null)).toEqual(DEFAULT_VIEW_STATE);
  });

  it("returns default on empty string", () => {
    expect(parsePluginBrowserViewState("")).toEqual(DEFAULT_VIEW_STATE);
  });

  it("returns default on unparsable JSON", () => {
    expect(parsePluginBrowserViewState("{not json")).toEqual(
      DEFAULT_VIEW_STATE,
    );
  });

  it("returns default on wrong schema version", () => {
    const wire = JSON.stringify({ v: 99, groupMode: "state" });
    expect(parsePluginBrowserViewState(wire)).toEqual(DEFAULT_VIEW_STATE);
  });

  it("returns default when root is not an object", () => {
    expect(parsePluginBrowserViewState("[]")).toEqual(DEFAULT_VIEW_STATE);
    expect(parsePluginBrowserViewState("42")).toEqual(DEFAULT_VIEW_STATE);
    expect(parsePluginBrowserViewState('"string"')).toEqual(DEFAULT_VIEW_STATE);
  });
});

describe("parsePluginBrowserViewState — per-field recovery", () => {
  it("drops unknown groupMode, keeps other valid fields", () => {
    const wire = JSON.stringify({
      v: 1,
      filters: { query: "foo" },
      sort: null,
      groupMode: "bogus",
      includeEmptyStateGroups: true,
      expandedGroupKeys: [],
      selectedPluginId: null,
    });
    const parsed = parsePluginBrowserViewState(wire);
    expect(parsed.groupMode).toBe("none");
    expect(parsed.filters.query).toBe("foo");
    expect(parsed.includeEmptyStateGroups).toBe(true);
  });

  it("drops malformed sort (non-object)", () => {
    const wire = JSON.stringify({
      v: 1,
      filters: {},
      sort: "not-an-object",
      groupMode: "none",
      includeEmptyStateGroups: false,
      expandedGroupKeys: [],
      selectedPluginId: null,
    });
    expect(parsePluginBrowserViewState(wire).sort).toBeNull();
  });

  it("drops sort with invalid column", () => {
    const wire = JSON.stringify({
      v: 1,
      sort: { column: "bogus-column", direction: "asc" },
      filters: {},
      groupMode: "none",
      includeEmptyStateGroups: false,
      expandedGroupKeys: [],
      selectedPluginId: null,
    });
    expect(parsePluginBrowserViewState(wire).sort).toBeNull();
  });

  it("drops sort with invalid direction", () => {
    const wire = JSON.stringify({
      v: 1,
      sort: { column: "id", direction: "weird" },
      filters: {},
      groupMode: "none",
      includeEmptyStateGroups: false,
      expandedGroupKeys: [],
      selectedPluginId: null,
    });
    expect(parsePluginBrowserViewState(wire).sort).toBeNull();
  });

  it("filters unknown lifecycle states out of filters.states", () => {
    const wire = JSON.stringify({
      v: 1,
      filters: { states: ["enabled", "not-a-state", "failed"] },
      sort: null,
      groupMode: "none",
      includeEmptyStateGroups: false,
      expandedGroupKeys: [],
      selectedPluginId: null,
    });
    const parsed = parsePluginBrowserViewState(wire);
    expect(parsed.filters.states).toEqual(["enabled", "failed"]);
  });

  it("strips non-string items from expandedGroupKeys", () => {
    const wire = JSON.stringify({
      v: 1,
      filters: {},
      sort: null,
      groupMode: "author",
      includeEmptyStateGroups: false,
      expandedGroupKeys: ["Alice", 123, null, "Bob"],
      selectedPluginId: null,
    });
    expect(parsePluginBrowserViewState(wire).expandedGroupKeys).toEqual([
      "Alice",
      "Bob",
    ]);
  });

  it("rejects non-boolean hasHealthIssues", () => {
    const wire = JSON.stringify({
      v: 1,
      filters: { hasHealthIssues: "true" },
      sort: null,
      groupMode: "none",
      includeEmptyStateGroups: false,
      expandedGroupKeys: [],
      selectedPluginId: null,
    });
    expect(
      parsePluginBrowserViewState(wire).filters.hasHealthIssues,
    ).toBeUndefined();
  });

  it("drops non-string selectedPluginId", () => {
    const wire = JSON.stringify({
      v: 1,
      filters: {},
      sort: null,
      groupMode: "none",
      includeEmptyStateGroups: false,
      expandedGroupKeys: [],
      selectedPluginId: 12345,
    });
    expect(parsePluginBrowserViewState(wire).selectedPluginId).toBeNull();
  });
});

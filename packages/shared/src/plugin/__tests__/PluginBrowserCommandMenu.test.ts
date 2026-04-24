import { describe, expect, it } from "vitest";
import {
  buildPluginBrowserCommandMenu,
  filterPluginBrowserCommandMenu,
} from "../PluginBrowserCommandMenu.js";
import {
  initialPluginBrowserState,
  pluginBrowserReducer,
} from "../PluginBrowserReducer.js";
import type { PluginBrowserRowSummary } from "../PluginBrowserRowSummary.js";

function row(
  pluginId: string,
  severity: PluginBrowserRowSummary["severity"] = "ok",
): PluginBrowserRowSummary {
  return {
    pluginId,
    severity,
    label: severity,
    reasons: [],
    health: null,
    stability: null,
  };
}

function snap(...entries: Array<PluginBrowserRowSummary>) {
  return new Map(entries.map((r) => [r.pluginId, r]));
}

describe("buildPluginBrowserCommandMenu — empty state", () => {
  it("omits every command when nothing is actionable", () => {
    const entries = buildPluginBrowserCommandMenu(initialPluginBrowserState());
    expect(entries).toEqual([]);
  });

  it("reports every command disabled with includeDisabled=true", () => {
    const entries = buildPluginBrowserCommandMenu(initialPluginBrowserState(), {
      includeDisabled: true,
    });
    expect(entries.map((e) => e.id)).toEqual([
      "selection/clear",
      "changelog/mark-all-seen",
      "changelog/clear",
    ]);
    for (const e of entries) expect(e.enabled).toBe(false);
  });
});

describe("buildPluginBrowserCommandMenu — enabled gates", () => {
  it("enables clear-selection only when a plugin is selected", () => {
    let s = initialPluginBrowserState();
    s = pluginBrowserReducer(s, { type: "selectPlugin", pluginId: "com.a" });
    const entries = buildPluginBrowserCommandMenu(s);
    const clear = entries.find((e) => e.id === "selection/clear");
    expect(clear?.enabled).toBe(true);
    expect(clear?.action).toEqual({ type: "clearSelection" });
  });

  it("enables markAllSeen when the changelog has unread entries", () => {
    let s = initialPluginBrowserState();
    s = pluginBrowserReducer(s, {
      type: "snapshotRefreshed",
      snapshot: snap(row("a")),
      now: 1000,
    });
    const entries = buildPluginBrowserCommandMenu(s);
    const mark = entries.find((e) => e.id === "changelog/mark-all-seen");
    expect(mark?.enabled).toBe(true);
    expect(mark?.shortcut).toBe("m");
  });

  it("disables markAllSeen once everything is read", () => {
    let s = initialPluginBrowserState();
    s = pluginBrowserReducer(s, {
      type: "snapshotRefreshed",
      snapshot: snap(row("a")),
      now: 1000,
    });
    s = pluginBrowserReducer(s, { type: "markAllSeen" });
    const entries = buildPluginBrowserCommandMenu(s, { includeDisabled: true });
    const mark = entries.find((e) => e.id === "changelog/mark-all-seen");
    expect(mark?.enabled).toBe(false);
  });

  it("enables clearChangelog when changelog has any entries", () => {
    let s = initialPluginBrowserState();
    s = pluginBrowserReducer(s, {
      type: "snapshotRefreshed",
      snapshot: snap(row("a")),
      now: 1000,
    });
    const entries = buildPluginBrowserCommandMenu(s);
    const clear = entries.find((e) => e.id === "changelog/clear");
    expect(clear?.enabled).toBe(true);
    expect(clear?.action).toEqual({ type: "clearChangelog" });
    expect(clear?.shortcut).toBe("Ctrl+C");
  });
});

describe("buildPluginBrowserCommandMenu — shortcut hints", () => {
  it("hint strings match the keyboard-bindings module", () => {
    let s = initialPluginBrowserState();
    s = pluginBrowserReducer(s, {
      type: "snapshotRefreshed",
      snapshot: snap(row("a")),
      now: 1000,
    });
    s = pluginBrowserReducer(s, { type: "selectPlugin", pluginId: "a" });
    const entries = buildPluginBrowserCommandMenu(s);
    const byId = new Map(entries.map((e) => [e.id, e]));
    expect(byId.get("selection/clear")?.shortcut).toBe("Esc");
    expect(byId.get("changelog/mark-all-seen")?.shortcut).toBe("m");
    expect(byId.get("changelog/clear")?.shortcut).toBe("Ctrl+C");
  });
});

describe("filterPluginBrowserCommandMenu", () => {
  it("returns all entries when query is empty or whitespace", () => {
    const entries = buildPluginBrowserCommandMenu(initialPluginBrowserState(), {
      includeDisabled: true,
    });
    expect(filterPluginBrowserCommandMenu(entries, "")).toEqual(entries);
    expect(filterPluginBrowserCommandMenu(entries, "   ")).toEqual(entries);
  });

  it("matches label text case-insensitively", () => {
    const entries = buildPluginBrowserCommandMenu(initialPluginBrowserState(), {
      includeDisabled: true,
    });
    const hits = filterPluginBrowserCommandMenu(entries, "CHANGELOG");
    expect(hits.map((e) => e.id)).toEqual([
      "changelog/mark-all-seen",
      "changelog/clear",
    ]);
  });

  it("matches description text", () => {
    const entries = buildPluginBrowserCommandMenu(initialPluginBrowserState(), {
      includeDisabled: true,
    });
    const hits = filterPluginBrowserCommandMenu(entries, "unread");
    expect(hits.map((e) => e.id)).toEqual(["changelog/mark-all-seen"]);
  });

  it("returns empty list when nothing matches", () => {
    const entries = buildPluginBrowserCommandMenu(initialPluginBrowserState(), {
      includeDisabled: true,
    });
    expect(filterPluginBrowserCommandMenu(entries, "xyzzy-no-match")).toEqual(
      [],
    );
  });
});

describe("stable ordering", () => {
  it("keeps selection → changelog order when fully enabled", () => {
    let s = initialPluginBrowserState();
    s = pluginBrowserReducer(s, {
      type: "snapshotRefreshed",
      snapshot: snap(row("a")),
      now: 1000,
    });
    s = pluginBrowserReducer(s, { type: "selectPlugin", pluginId: "a" });
    const entries = buildPluginBrowserCommandMenu(s);
    expect(entries.map((e) => e.id)).toEqual([
      "selection/clear",
      "changelog/mark-all-seen",
      "changelog/clear",
    ]);
  });
});

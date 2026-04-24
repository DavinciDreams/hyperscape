import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAX_CHANGELOG_ENTRIES,
  appendPluginBrowserChangelog,
  emptyPluginBrowserChangelog,
  filterPluginBrowserChangelog,
  prunePluginBrowserChangelog,
} from "../PluginBrowserChangelog.js";
import type { PluginBrowserToastIntent } from "../PluginBrowserToastRouter.js";

function intent(
  pluginId: string,
  kind: PluginBrowserToastIntent["kind"],
  severity: PluginBrowserToastIntent["severity"] = "ok",
): PluginBrowserToastIntent {
  return {
    id: `${pluginId}:${kind}`,
    pluginId,
    kind,
    severity,
    previous: null,
    current: null,
  };
}

describe("emptyPluginBrowserChangelog", () => {
  it("produces empty state with default capacity", () => {
    const s = emptyPluginBrowserChangelog();
    expect(s.entries).toEqual([]);
    expect(s.maxEntries).toBe(DEFAULT_MAX_CHANGELOG_ENTRIES);
  });

  it("clamps non-positive caps to 1", () => {
    expect(emptyPluginBrowserChangelog(0).maxEntries).toBe(1);
    expect(emptyPluginBrowserChangelog(-5).maxEntries).toBe(1);
  });

  it("respects a custom cap", () => {
    expect(emptyPluginBrowserChangelog(50).maxEntries).toBe(50);
  });
});

describe("appendPluginBrowserChangelog", () => {
  it("returns the same state reference when intents are empty", () => {
    const s = emptyPluginBrowserChangelog();
    const next = appendPluginBrowserChangelog(s, { intents: [], now: 100 });
    expect(next).toBe(s);
  });

  it("appends intents with deterministic ids and timestamp", () => {
    const s = emptyPluginBrowserChangelog();
    const next = appendPluginBrowserChangelog(s, {
      intents: [
        intent("com.a", "added"),
        intent("com.b", "regressed", "error"),
      ],
      now: 1000,
    });
    expect(next.entries).toHaveLength(2);
    expect(next.entries[0].id).toBe("1000:0");
    expect(next.entries[1].id).toBe("1000:1");
    expect(next.entries[0].timestamp).toBe(1000);
    expect(next.entries[0].intent.pluginId).toBe("com.a");
    expect(next.entries[1].intent.severity).toBe("error");
  });

  it("trims oldest entries when exceeding ring-buffer capacity", () => {
    let s = emptyPluginBrowserChangelog(3);
    s = appendPluginBrowserChangelog(s, {
      intents: [intent("a", "added")],
      now: 1,
    });
    s = appendPluginBrowserChangelog(s, {
      intents: [intent("b", "added")],
      now: 2,
    });
    s = appendPluginBrowserChangelog(s, {
      intents: [intent("c", "added"), intent("d", "added")],
      now: 3,
    });
    expect(s.entries).toHaveLength(3);
    // oldest "a" dropped; b/c/d remain in order
    expect(s.entries.map((e) => e.intent.pluginId)).toEqual(["b", "c", "d"]);
  });

  it("preserves maxEntries across appends", () => {
    const s = emptyPluginBrowserChangelog(5);
    const next = appendPluginBrowserChangelog(s, {
      intents: [intent("x", "added")],
      now: 1,
    });
    expect(next.maxEntries).toBe(5);
  });
});

describe("filterPluginBrowserChangelog", () => {
  function build() {
    let s = emptyPluginBrowserChangelog();
    s = appendPluginBrowserChangelog(s, {
      intents: [intent("com.a", "added", "info")],
      now: 100,
    });
    s = appendPluginBrowserChangelog(s, {
      intents: [
        intent("com.a", "regressed", "error"),
        intent("com.b", "recovered", "ok"),
      ],
      now: 200,
    });
    s = appendPluginBrowserChangelog(s, {
      intents: [intent("com.b", "label-changed", "warning")],
      now: 300,
    });
    return s;
  }

  it("returns all entries when filter is empty", () => {
    const s = build();
    const r = filterPluginBrowserChangelog(s, {});
    expect(r).toHaveLength(4);
  });

  it("filters by pluginId", () => {
    const s = build();
    const r = filterPluginBrowserChangelog(s, { pluginId: "com.a" });
    expect(r.map((e) => e.intent.pluginId)).toEqual(["com.a", "com.a"]);
  });

  it("filters by kinds", () => {
    const s = build();
    const r = filterPluginBrowserChangelog(s, {
      kinds: ["regressed", "recovered"],
    });
    expect(r.map((e) => e.intent.kind)).toEqual(["regressed", "recovered"]);
  });

  it("filters by severities", () => {
    const s = build();
    const r = filterPluginBrowserChangelog(s, { severities: ["error"] });
    expect(r).toHaveLength(1);
    expect(r[0].intent.kind).toBe("regressed");
  });

  it("filters by sinceMs (inclusive)", () => {
    const s = build();
    const r = filterPluginBrowserChangelog(s, { sinceMs: 200 });
    expect(r).toHaveLength(3);
    expect(r[0].timestamp).toBe(200);
  });

  it("combines multiple axes (AND)", () => {
    const s = build();
    const r = filterPluginBrowserChangelog(s, {
      pluginId: "com.b",
      kinds: ["label-changed"],
      sinceMs: 300,
    });
    expect(r).toHaveLength(1);
    expect(r[0].intent.severity).toBe("warning");
  });

  it("returns empty when filter excludes everything", () => {
    const s = build();
    const r = filterPluginBrowserChangelog(s, { pluginId: "nope" });
    expect(r).toEqual([]);
  });
});

describe("prunePluginBrowserChangelog", () => {
  it("drops entries strictly older than now - retainMs", () => {
    let s = emptyPluginBrowserChangelog();
    s = appendPluginBrowserChangelog(s, {
      intents: [intent("a", "added")],
      now: 1000,
    });
    s = appendPluginBrowserChangelog(s, {
      intents: [intent("b", "added")],
      now: 2000,
    });
    s = appendPluginBrowserChangelog(s, {
      intents: [intent("c", "added")],
      now: 3000,
    });
    const pruned = prunePluginBrowserChangelog(s, {
      now: 3000,
      retainMs: 1500,
    });
    // cutoff = 1500 → keep >=1500 → b(2000), c(3000)
    expect(pruned.entries.map((e) => e.intent.pluginId)).toEqual(["b", "c"]);
  });

  it("returns same state reference when nothing was pruned", () => {
    let s = emptyPluginBrowserChangelog();
    s = appendPluginBrowserChangelog(s, {
      intents: [intent("a", "added")],
      now: 1000,
    });
    const pruned = prunePluginBrowserChangelog(s, {
      now: 1000,
      retainMs: 10_000,
    });
    expect(pruned).toBe(s);
  });

  it("treats boundary timestamp (now - retainMs) as kept", () => {
    let s = emptyPluginBrowserChangelog();
    s = appendPluginBrowserChangelog(s, {
      intents: [intent("edge", "added")],
      now: 500,
    });
    // cutoff = 500 exactly → keep
    const pruned = prunePluginBrowserChangelog(s, {
      now: 1000,
      retainMs: 500,
    });
    expect(pruned.entries).toHaveLength(1);
  });

  it("preserves maxEntries after pruning", () => {
    let s = emptyPluginBrowserChangelog(42);
    s = appendPluginBrowserChangelog(s, {
      intents: [intent("a", "added")],
      now: 100,
    });
    const pruned = prunePluginBrowserChangelog(s, { now: 10_000, retainMs: 1 });
    expect(pruned.maxEntries).toBe(42);
  });
});

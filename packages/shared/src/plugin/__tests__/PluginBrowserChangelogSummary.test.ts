import { describe, expect, it } from "vitest";
import {
  appendPluginBrowserChangelog,
  emptyPluginBrowserChangelog,
} from "../PluginBrowserChangelog.js";
import {
  emptyPluginBrowserChangelogSummary,
  summarizePluginBrowserChangelog,
  topPluginsByChangelogActivity,
} from "../PluginBrowserChangelogSummary.js";
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

function build() {
  let s = emptyPluginBrowserChangelog();
  s = appendPluginBrowserChangelog(s, {
    intents: [intent("com.a", "added", "info"), intent("com.b", "added", "ok")],
    now: 100,
  });
  s = appendPluginBrowserChangelog(s, {
    intents: [
      intent("com.a", "regressed", "error"),
      intent("com.b", "recovered", "ok"),
      intent("com.a", "label-changed", "warning"),
    ],
    now: 200,
  });
  s = appendPluginBrowserChangelog(s, {
    intents: [intent("com.c", "removed", "info")],
    now: 300,
  });
  return s;
}

describe("emptyPluginBrowserChangelogSummary", () => {
  it("zeroes all counts and nulls timestamps", () => {
    const s = emptyPluginBrowserChangelogSummary();
    expect(s.total).toBe(0);
    expect(s.byKind).toEqual({
      added: 0,
      removed: 0,
      regressed: 0,
      recovered: 0,
      "label-changed": 0,
    });
    expect(s.bySeverity).toEqual({ ok: 0, info: 0, warning: 0, error: 0 });
    expect(s.byPluginId).toEqual({});
    expect(s.distinctPluginCount).toBe(0);
    expect(s.firstTimestamp).toBeNull();
    expect(s.lastTimestamp).toBeNull();
  });
});

describe("summarizePluginBrowserChangelog — empty", () => {
  it("returns the empty summary on empty state", () => {
    const s = summarizePluginBrowserChangelog(emptyPluginBrowserChangelog());
    expect(s).toEqual(emptyPluginBrowserChangelogSummary());
  });
});

describe("summarizePluginBrowserChangelog — full window", () => {
  it("aggregates total, byKind, bySeverity, byPluginId", () => {
    const s = summarizePluginBrowserChangelog(build());
    expect(s.total).toBe(6);
    expect(s.byKind.added).toBe(2);
    expect(s.byKind.regressed).toBe(1);
    expect(s.byKind.recovered).toBe(1);
    expect(s.byKind["label-changed"]).toBe(1);
    expect(s.byKind.removed).toBe(1);
    expect(s.bySeverity.ok).toBe(2);
    expect(s.bySeverity.info).toBe(2);
    expect(s.bySeverity.warning).toBe(1);
    expect(s.bySeverity.error).toBe(1);
    expect(s.byPluginId).toEqual({ "com.a": 3, "com.b": 2, "com.c": 1 });
    expect(s.distinctPluginCount).toBe(3);
    expect(s.firstTimestamp).toBe(100);
    expect(s.lastTimestamp).toBe(300);
  });

  it("always presents all 5 kinds + 4 severities (zero if absent)", () => {
    let s = emptyPluginBrowserChangelog();
    s = appendPluginBrowserChangelog(s, {
      intents: [intent("x", "added", "ok")],
      now: 1,
    });
    const r = summarizePluginBrowserChangelog(s);
    expect(r.byKind.removed).toBe(0);
    expect(r.bySeverity.error).toBe(0);
  });
});

describe("summarizePluginBrowserChangelog — with filter", () => {
  it("honors pluginId filter", () => {
    const r = summarizePluginBrowserChangelog(build(), {
      filter: { pluginId: "com.a" },
    });
    expect(r.total).toBe(3);
    expect(r.distinctPluginCount).toBe(1);
    expect(r.byPluginId).toEqual({ "com.a": 3 });
  });

  it("honors kinds filter", () => {
    const r = summarizePluginBrowserChangelog(build(), {
      filter: { kinds: ["regressed", "recovered"] },
    });
    expect(r.total).toBe(2);
    expect(r.byKind.regressed).toBe(1);
    expect(r.byKind.recovered).toBe(1);
    expect(r.byKind.added).toBe(0);
  });

  it("honors sinceMs filter", () => {
    const r = summarizePluginBrowserChangelog(build(), {
      filter: { sinceMs: 300 },
    });
    expect(r.total).toBe(1);
    expect(r.firstTimestamp).toBe(300);
    expect(r.lastTimestamp).toBe(300);
  });

  it("returns empty summary when filter excludes everything", () => {
    const r = summarizePluginBrowserChangelog(build(), {
      filter: { pluginId: "nope" },
    });
    expect(r).toEqual(emptyPluginBrowserChangelogSummary());
  });
});

describe("topPluginsByChangelogActivity", () => {
  it("returns top-N by count desc, breaking ties by pluginId asc", () => {
    const s = summarizePluginBrowserChangelog(build());
    const top = topPluginsByChangelogActivity(s, 2);
    expect(top).toEqual([
      { pluginId: "com.a", count: 3 },
      { pluginId: "com.b", count: 2 },
    ]);
  });

  it("breaks pure ties lexicographically", () => {
    let s = emptyPluginBrowserChangelog();
    s = appendPluginBrowserChangelog(s, {
      intents: [
        intent("com.z", "added"),
        intent("com.a", "added"),
        intent("com.m", "added"),
      ],
      now: 1,
    });
    const top = topPluginsByChangelogActivity(
      summarizePluginBrowserChangelog(s),
      3,
    );
    expect(top.map((t) => t.pluginId)).toEqual(["com.a", "com.m", "com.z"]);
  });

  it("returns [] for non-positive limit", () => {
    const s = summarizePluginBrowserChangelog(build());
    expect(topPluginsByChangelogActivity(s, 0)).toEqual([]);
    expect(topPluginsByChangelogActivity(s, -1)).toEqual([]);
  });

  it("clamps limit larger than distinct plugin count to available", () => {
    const s = summarizePluginBrowserChangelog(build());
    const top = topPluginsByChangelogActivity(s, 100);
    expect(top).toHaveLength(3);
  });
});

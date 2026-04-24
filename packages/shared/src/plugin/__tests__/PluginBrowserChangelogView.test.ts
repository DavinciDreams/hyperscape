import { describe, expect, it } from "vitest";
import {
  appendPluginBrowserChangelog,
  emptyPluginBrowserChangelog,
} from "../PluginBrowserChangelog.js";
import { renderPluginBrowserChangelogView } from "../PluginBrowserChangelogView.js";
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
    intents: [intent("com.c", "label-changed", "warning")],
    now: 300,
  });
  return s;
}

describe("renderPluginBrowserChangelogView — empty", () => {
  it("returns empty groups on empty input", () => {
    const v = renderPluginBrowserChangelogView([]);
    expect(v.groups).toEqual([]);
  });
});

describe("renderPluginBrowserChangelogView — grouping", () => {
  it("buckets entries by timestamp (refresh)", () => {
    const v = renderPluginBrowserChangelogView(build().entries);
    expect(v.groups).toHaveLength(3);
    const timestamps = v.groups.map((g) => g.timestamp);
    // Default newestFirst: 300, 200, 100
    expect(timestamps).toEqual([300, 200, 100]);
  });

  it("preserves row order within a refresh", () => {
    const v = renderPluginBrowserChangelogView(build().entries);
    const midGroup = v.groups.find((g) => g.timestamp === 200);
    expect(midGroup?.rows).toHaveLength(2);
    expect(midGroup?.rows[0].pluginId).toBe("com.a");
    expect(midGroup?.rows[1].pluginId).toBe("com.b");
  });

  it("echoes entry ids unchanged on each row", () => {
    const s = build();
    const v = renderPluginBrowserChangelogView(s.entries);
    const allIds = v.groups.flatMap((g) => g.rows.map((r) => r.id));
    expect(allIds.sort()).toEqual(s.entries.map((e) => e.id).sort());
  });
});

describe("renderPluginBrowserChangelogView — severity aggregation", () => {
  it("group severity is the worst across its rows", () => {
    const v = renderPluginBrowserChangelogView(build().entries);
    const atHundred = v.groups.find((g) => g.timestamp === 100);
    const atTwoHundred = v.groups.find((g) => g.timestamp === 200);
    const atThreeHundred = v.groups.find((g) => g.timestamp === 300);
    expect(atHundred?.severity).toBe("info"); // only added/info
    expect(atTwoHundred?.severity).toBe("error"); // regressed/error wins
    expect(atThreeHundred?.severity).toBe("warning");
  });

  it("defaults to ok when all rows are ok", () => {
    let s = emptyPluginBrowserChangelog();
    s = appendPluginBrowserChangelog(s, {
      intents: [intent("x", "recovered", "ok")],
      now: 1,
    });
    const v = renderPluginBrowserChangelogView(s.entries);
    expect(v.groups[0].severity).toBe("ok");
  });
});

describe("renderPluginBrowserChangelogView — display passthrough", () => {
  it("produces toast-compatible titles per row", () => {
    const s = build();
    const v = renderPluginBrowserChangelogView(s.entries);
    const regressedRow = v.groups
      .flatMap((g) => g.rows)
      .find((r) => r.id === "200:0");
    expect(regressedRow?.display.title).toBe("com.a regressed to error");
  });

  it("every row exposes a localization key + aria label", () => {
    const v = renderPluginBrowserChangelogView(build().entries);
    for (const g of v.groups) {
      for (const r of g.rows) {
        expect(r.display.localization.titleKey).toMatch(/^plugin\.toast\./);
        expect(r.display.ariaLabel.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("renderPluginBrowserChangelogView — ordering toggle", () => {
  it("append-order (newestFirst=false) preserves insertion order", () => {
    const v = renderPluginBrowserChangelogView(build().entries, {
      newestFirst: false,
    });
    expect(v.groups.map((g) => g.timestamp)).toEqual([100, 200, 300]);
  });
});

import { describe, expect, it } from "vitest";
import type { PluginBrowserKeyboardEvent } from "../PluginBrowserKeyboardBindings.js";
import { pluginBrowserActionForKey } from "../PluginBrowserKeyboardBindings.js";
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

function ev(
  key: string,
  mods: Partial<PluginBrowserKeyboardEvent> = {},
): PluginBrowserKeyboardEvent {
  return { key, ...mods };
}

const VISIBLE = [row("a"), row("b"), row("c")];
const EMPTY_VISIBLE: readonly PluginBrowserRowSummary[] = [];

function stateWithSelection(pluginId: string | null) {
  let s = initialPluginBrowserState();
  s = pluginBrowserReducer(s, {
    type: "snapshotRefreshed",
    snapshot: new Map(VISIBLE.map((r) => [r.pluginId, r])),
    now: 1000,
  });
  if (pluginId !== null) {
    s = pluginBrowserReducer(s, { type: "selectPlugin", pluginId });
  }
  return s;
}

describe("Escape", () => {
  it("returns clearSelection when a row is selected", () => {
    const s = stateWithSelection("b");
    expect(
      pluginBrowserActionForKey(ev("Escape"), s, { visibleRows: VISIBLE }),
    ).toEqual({ type: "clearSelection" });
  });

  it("returns null when nothing is selected", () => {
    const s = stateWithSelection(null);
    expect(
      pluginBrowserActionForKey(ev("Escape"), s, { visibleRows: VISIBLE }),
    ).toBeNull();
  });

  it("ignores Escape with modifiers", () => {
    const s = stateWithSelection("b");
    expect(
      pluginBrowserActionForKey(ev("Escape", { ctrlKey: true }), s, {
        visibleRows: VISIBLE,
      }),
    ).toBeNull();
  });
});

describe("m / Ctrl+c", () => {
  it("'m' maps to markAllSeen", () => {
    const s = stateWithSelection(null);
    expect(
      pluginBrowserActionForKey(ev("m"), s, { visibleRows: VISIBLE }),
    ).toEqual({ type: "markAllSeen" });
  });

  it("Ctrl+c maps to clearChangelog", () => {
    const s = stateWithSelection(null);
    expect(
      pluginBrowserActionForKey(ev("c", { ctrlKey: true }), s, {
        visibleRows: VISIBLE,
      }),
    ).toEqual({ type: "clearChangelog" });
  });

  it("Meta+c also maps to clearChangelog (macOS)", () => {
    const s = stateWithSelection(null);
    expect(
      pluginBrowserActionForKey(ev("c", { metaKey: true }), s, {
        visibleRows: VISIBLE,
      }),
    ).toEqual({ type: "clearChangelog" });
  });

  it("bare 'c' without modifiers is unbound", () => {
    const s = stateWithSelection(null);
    expect(
      pluginBrowserActionForKey(ev("c"), s, { visibleRows: VISIBLE }),
    ).toBeNull();
  });
});

describe("ArrowDown / j (next)", () => {
  it("selects the next row after current", () => {
    const s = stateWithSelection("a");
    expect(
      pluginBrowserActionForKey(ev("ArrowDown"), s, { visibleRows: VISIBLE }),
    ).toEqual({ type: "selectPlugin", pluginId: "b" });
  });

  it("wraps from last row to first row", () => {
    const s = stateWithSelection("c");
    expect(
      pluginBrowserActionForKey(ev("ArrowDown"), s, { visibleRows: VISIBLE }),
    ).toEqual({ type: "selectPlugin", pluginId: "a" });
  });

  it("selects the first row when nothing is selected", () => {
    const s = stateWithSelection(null);
    expect(
      pluginBrowserActionForKey(ev("j"), s, { visibleRows: VISIBLE }),
    ).toEqual({ type: "selectPlugin", pluginId: "a" });
  });

  it("returns null when visible list is empty", () => {
    const s = stateWithSelection(null);
    expect(
      pluginBrowserActionForKey(ev("ArrowDown"), s, {
        visibleRows: EMPTY_VISIBLE,
      }),
    ).toBeNull();
  });
});

describe("ArrowUp / k (prev)", () => {
  it("selects the previous row", () => {
    const s = stateWithSelection("c");
    expect(
      pluginBrowserActionForKey(ev("ArrowUp"), s, { visibleRows: VISIBLE }),
    ).toEqual({ type: "selectPlugin", pluginId: "b" });
  });

  it("wraps from first row to last row", () => {
    const s = stateWithSelection("a");
    expect(
      pluginBrowserActionForKey(ev("ArrowUp"), s, { visibleRows: VISIBLE }),
    ).toEqual({ type: "selectPlugin", pluginId: "c" });
  });

  it("selects last row when nothing selected", () => {
    const s = stateWithSelection(null);
    expect(
      pluginBrowserActionForKey(ev("k"), s, { visibleRows: VISIBLE }),
    ).toEqual({ type: "selectPlugin", pluginId: "c" });
  });
});

describe("Home / End", () => {
  it("Home selects first visible row", () => {
    const s = stateWithSelection("b");
    expect(
      pluginBrowserActionForKey(ev("Home"), s, { visibleRows: VISIBLE }),
    ).toEqual({ type: "selectPlugin", pluginId: "a" });
  });

  it("End selects last visible row", () => {
    const s = stateWithSelection("a");
    expect(
      pluginBrowserActionForKey(ev("End"), s, { visibleRows: VISIBLE }),
    ).toEqual({ type: "selectPlugin", pluginId: "c" });
  });

  it("Home is no-op when visible list is empty", () => {
    const s = stateWithSelection(null);
    expect(
      pluginBrowserActionForKey(ev("Home"), s, { visibleRows: EMPTY_VISIBLE }),
    ).toBeNull();
  });
});

describe("unhandled keys", () => {
  it("returns null for an unbound letter", () => {
    const s = stateWithSelection(null);
    expect(
      pluginBrowserActionForKey(ev("x"), s, { visibleRows: VISIBLE }),
    ).toBeNull();
  });

  it("returns null when Alt is pressed (reserved for browser/OS)", () => {
    const s = stateWithSelection("b");
    expect(
      pluginBrowserActionForKey(ev("Escape", { altKey: true }), s, {
        visibleRows: VISIBLE,
      }),
    ).toBeNull();
  });
});

describe("stale selection", () => {
  it("arrow keys fall back to first row when selection is stale", () => {
    // Select 'a', then refresh snapshot so 'a' is no longer present.
    let s = stateWithSelection("a");
    s = pluginBrowserReducer(s, {
      type: "snapshotRefreshed",
      snapshot: new Map([
        ["b", row("b")],
        ["c", row("c")],
      ]),
      now: 2000,
    });
    expect(
      pluginBrowserActionForKey(ev("ArrowDown"), s, {
        visibleRows: [row("b"), row("c")],
      }),
    ).toEqual({ type: "selectPlugin", pluginId: "b" });
  });
});

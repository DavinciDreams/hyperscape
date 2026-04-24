import { describe, expect, it } from "vitest";
import {
  appendPluginBrowserChangelog,
  emptyPluginBrowserChangelog,
} from "../PluginBrowserChangelog.js";
import {
  PLUGIN_BROWSER_EDITOR_STATE_VERSION,
  emptyPluginBrowserEditorState,
  loadPluginBrowserEditorState,
  savePluginBrowserEditorState,
} from "../PluginBrowserEditorState.js";
import type { PluginBrowserToastIntent } from "../PluginBrowserToastRouter.js";

function intent(
  pluginId: string,
  kind: PluginBrowserToastIntent["kind"],
): PluginBrowserToastIntent {
  return {
    id: `${pluginId}:${kind}`,
    pluginId,
    kind,
    severity: "ok",
    previous: null,
    current: null,
  };
}

describe("emptyPluginBrowserEditorState", () => {
  it("returns a consistent empty snapshot", () => {
    const s = emptyPluginBrowserEditorState();
    expect(s.changelog.entries).toEqual([]);
    expect(s.cursor.lastSeenTimestamp).toBeNull();
    expect(s.toastSuppression.shown.size).toBe(0);
  });

  it("honors custom max changelog capacity", () => {
    const s = emptyPluginBrowserEditorState(42);
    expect(s.changelog.maxEntries).toBe(42);
  });
});

describe("savePluginBrowserEditorState", () => {
  it("wraps state in a versioned envelope", () => {
    const env = savePluginBrowserEditorState(emptyPluginBrowserEditorState());
    expect(env.version).toBe(PLUGIN_BROWSER_EDITOR_STATE_VERSION);
    expect(env.state.changelog).toBeDefined();
    expect(env.state.cursor).toBeDefined();
    expect(env.state.toastSuppression).toBeDefined();
  });

  it("flattens the suppression Map into a plain object", () => {
    const s = emptyPluginBrowserEditorState();
    const suppressed = new Map<string, number>();
    suppressed.set("com.a:regressed", 1000);
    suppressed.set("com.b:added", 2000);
    const withSup = {
      ...s,
      toastSuppression: { shown: suppressed as ReadonlyMap<string, number> },
    };
    const env = savePluginBrowserEditorState(withSup);
    expect(env.state.toastSuppression.shown).toEqual({
      "com.a:regressed": 1000,
      "com.b:added": 2000,
    });
  });

  it("round-trips through JSON.stringify", () => {
    let s = emptyPluginBrowserEditorState();
    s = {
      ...s,
      changelog: appendPluginBrowserChangelog(s.changelog, {
        intents: [intent("a", "added")],
        now: 1234,
      }),
    };
    const env = savePluginBrowserEditorState(s);
    const json = JSON.stringify(env);
    expect(() => JSON.parse(json)).not.toThrow();
  });
});

describe("loadPluginBrowserEditorState", () => {
  it("returns empty state + ['non-object-input'] for non-objects", () => {
    for (const bad of [null, undefined, 123, "hello", []]) {
      const r = loadPluginBrowserEditorState(bad);
      expect(r.issues).toContain("non-object-input");
      expect(r.state.changelog.entries).toEqual([]);
    }
  });

  it("flags missing version", () => {
    const r = loadPluginBrowserEditorState({ state: {} });
    expect(r.issues).toContain("missing-version");
  });

  it("flags unsupported version and uses empty state", () => {
    const r = loadPluginBrowserEditorState({ version: 999, state: {} });
    expect(r.issues).toContain("unsupported-version");
    expect(r.state.changelog.entries).toEqual([]);
  });

  it("flags missing state block", () => {
    const r = loadPluginBrowserEditorState({
      version: PLUGIN_BROWSER_EDITOR_STATE_VERSION,
    });
    expect(r.issues).toContain("missing-state");
  });

  it("flags malformed changelog (not a record)", () => {
    const r = loadPluginBrowserEditorState({
      version: PLUGIN_BROWSER_EDITOR_STATE_VERSION,
      state: { changelog: "nope", cursor: { lastSeenTimestamp: null } },
    });
    expect(r.issues).toContain("malformed-changelog");
    expect(r.state.changelog.entries).toEqual([]);
  });

  it("flags malformed cursor (wrong timestamp type)", () => {
    const r = loadPluginBrowserEditorState({
      version: PLUGIN_BROWSER_EDITOR_STATE_VERSION,
      state: {
        changelog: { entries: [], maxEntries: 10 },
        cursor: { lastSeenTimestamp: "yesterday" },
      },
    });
    expect(r.issues).toContain("malformed-cursor");
    expect(r.state.cursor.lastSeenTimestamp).toBeNull();
  });

  it("flags malformed suppression (non-number value)", () => {
    const r = loadPluginBrowserEditorState({
      version: PLUGIN_BROWSER_EDITOR_STATE_VERSION,
      state: {
        changelog: { entries: [], maxEntries: 10 },
        cursor: { lastSeenTimestamp: null },
        toastSuppression: { shown: { "com.a:added": "nope" } },
      },
    });
    expect(r.issues).toContain("malformed-suppression");
    expect(r.state.toastSuppression.shown.size).toBe(0);
  });

  it("full save → load round-trip preserves every field", () => {
    let s = emptyPluginBrowserEditorState();
    s = {
      ...s,
      changelog: appendPluginBrowserChangelog(s.changelog, {
        intents: [intent("a", "added"), intent("b", "regressed")],
        now: 5000,
      }),
      cursor: { lastSeenTimestamp: 5000 },
      toastSuppression: {
        shown: new Map([["a:added", 5000]]),
      },
    };
    const env = savePluginBrowserEditorState(s);
    const roundTripped = JSON.parse(JSON.stringify(env));
    const r = loadPluginBrowserEditorState(roundTripped);
    expect(r.issues).toEqual([]);
    expect(r.state.changelog.entries).toHaveLength(2);
    expect(r.state.cursor.lastSeenTimestamp).toBe(5000);
    expect(r.state.toastSuppression.shown.get("a:added")).toBe(5000);
  });

  it("accumulates multiple issues without throwing", () => {
    const r = loadPluginBrowserEditorState({
      version: PLUGIN_BROWSER_EDITOR_STATE_VERSION,
      state: {
        changelog: 42, // bad
        cursor: { lastSeenTimestamp: "bad" },
        toastSuppression: 99, // bad
      },
    });
    expect(r.issues).toContain("malformed-changelog");
    expect(r.issues).toContain("malformed-cursor");
    expect(r.issues).toContain("malformed-suppression");
    // still yields a usable state
    expect(r.state.changelog.entries).toEqual([]);
    expect(r.state.cursor.lastSeenTimestamp).toBeNull();
    expect(r.state.toastSuppression.shown.size).toBe(0);
  });
});

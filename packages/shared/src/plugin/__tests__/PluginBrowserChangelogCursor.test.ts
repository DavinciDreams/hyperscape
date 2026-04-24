import { describe, expect, it } from "vitest";
import {
  appendPluginBrowserChangelog,
  emptyPluginBrowserChangelog,
} from "../PluginBrowserChangelog.js";
import {
  emptyPluginBrowserChangelogCursor,
  markPluginBrowserChangelogSeen,
  setPluginBrowserChangelogCursor,
  unreadPluginBrowserChangelog,
} from "../PluginBrowserChangelogCursor.js";
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
    intents: [intent("a", "added", "info")],
    now: 100,
  });
  s = appendPluginBrowserChangelog(s, {
    intents: [intent("b", "regressed", "error")],
    now: 200,
  });
  s = appendPluginBrowserChangelog(s, {
    intents: [intent("c", "label-changed", "warning")],
    now: 300,
  });
  return s;
}

describe("emptyPluginBrowserChangelogCursor", () => {
  it("starts with null lastSeenTimestamp", () => {
    expect(emptyPluginBrowserChangelogCursor()).toEqual({
      lastSeenTimestamp: null,
    });
  });
});

describe("unreadPluginBrowserChangelog", () => {
  it("treats every entry as unread when cursor is null", () => {
    const r = unreadPluginBrowserChangelog(
      build(),
      emptyPluginBrowserChangelogCursor(),
    );
    expect(r.unreadCount).toBe(3);
    expect(r.worstSeverity).toBe("error");
  });

  it("excludes entries at or before lastSeenTimestamp", () => {
    const r = unreadPluginBrowserChangelog(build(), {
      lastSeenTimestamp: 200,
    });
    expect(r.unreadCount).toBe(1);
    expect(r.unreadEntries[0].timestamp).toBe(300);
    expect(r.worstSeverity).toBe("warning");
  });

  it("returns zero unread when cursor is at or past newest", () => {
    const r = unreadPluginBrowserChangelog(build(), {
      lastSeenTimestamp: 300,
    });
    expect(r.unreadCount).toBe(0);
    expect(r.unreadEntries).toEqual([]);
    expect(r.worstSeverity).toBeNull();
  });

  it("returns empty report on empty changelog", () => {
    const r = unreadPluginBrowserChangelog(
      emptyPluginBrowserChangelog(),
      emptyPluginBrowserChangelogCursor(),
    );
    expect(r.unreadCount).toBe(0);
    expect(r.worstSeverity).toBeNull();
  });
});

describe("markPluginBrowserChangelogSeen", () => {
  it("advances cursor to newest timestamp", () => {
    const next = markPluginBrowserChangelogSeen(
      build(),
      emptyPluginBrowserChangelogCursor(),
    );
    expect(next.lastSeenTimestamp).toBe(300);
  });

  it("is idempotent when cursor already leads", () => {
    const state = build();
    const cursor = { lastSeenTimestamp: 300 };
    const next = markPluginBrowserChangelogSeen(state, cursor);
    expect(next).toBe(cursor);
  });

  it("is idempotent when cursor is past newest", () => {
    const state = build();
    const cursor = { lastSeenTimestamp: 9999 };
    const next = markPluginBrowserChangelogSeen(state, cursor);
    expect(next).toBe(cursor);
  });

  it("returns same reference for empty changelog", () => {
    const cursor = emptyPluginBrowserChangelogCursor();
    const next = markPluginBrowserChangelogSeen(
      emptyPluginBrowserChangelog(),
      cursor,
    );
    expect(next).toBe(cursor);
  });

  it("advances from null cursor to newest", () => {
    const next = markPluginBrowserChangelogSeen(build(), {
      lastSeenTimestamp: null,
    });
    expect(next.lastSeenTimestamp).toBe(300);
  });

  it("advances to newest even when newest isn't the last entry", () => {
    // ring-buffer ordering is by append, but we also cover the case
    // where the latest timestamp might not be strictly last.
    let s = emptyPluginBrowserChangelog();
    s = appendPluginBrowserChangelog(s, {
      intents: [intent("z", "added")],
      now: 1000,
    });
    s = appendPluginBrowserChangelog(s, {
      intents: [intent("y", "added")],
      now: 500, // older "now" (clock skew, debug rewind, etc.)
    });
    const next = markPluginBrowserChangelogSeen(
      s,
      emptyPluginBrowserChangelogCursor(),
    );
    expect(next.lastSeenTimestamp).toBe(1000);
  });
});

describe("setPluginBrowserChangelogCursor", () => {
  it("assigns a specific timestamp", () => {
    expect(setPluginBrowserChangelogCursor(42)).toEqual({
      lastSeenTimestamp: 42,
    });
  });

  it("can reset to null", () => {
    expect(setPluginBrowserChangelogCursor(null)).toEqual({
      lastSeenTimestamp: null,
    });
  });
});

describe("cursor + mark round-trip", () => {
  it("second visit after mark has zero unread", () => {
    const state = build();
    let cursor = emptyPluginBrowserChangelogCursor();
    expect(unreadPluginBrowserChangelog(state, cursor).unreadCount).toBe(3);
    cursor = markPluginBrowserChangelogSeen(state, cursor);
    expect(unreadPluginBrowserChangelog(state, cursor).unreadCount).toBe(0);
  });

  it("new entries after mark re-appear as unread", () => {
    let state = build();
    let cursor = markPluginBrowserChangelogSeen(
      state,
      emptyPluginBrowserChangelogCursor(),
    );
    state = appendPluginBrowserChangelog(state, {
      intents: [intent("d", "removed", "info")],
      now: 400,
    });
    const r = unreadPluginBrowserChangelog(state, cursor);
    expect(r.unreadCount).toBe(1);
    expect(r.unreadEntries[0].intent.pluginId).toBe("d");
  });
});

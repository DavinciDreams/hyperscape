import { describe, expect, it } from "vitest";
import {
  PERSISTENCE_SCHEMA_VERSION,
  bootPluginBrowserStateFromJson,
  parsePluginBrowserPersistedState,
  parsePluginBrowserPersistedStateJson,
  rehydratePluginBrowserState,
  serializePluginBrowserState,
  stringifyPluginBrowserPersistedState,
} from "../PluginBrowserPersistence.js";
import {
  initialPluginBrowserState,
  type PluginBrowserState,
} from "../PluginBrowserReducer.js";
import { createPluginBrowserStore } from "../PluginBrowserStore.js";
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

describe("serializePluginBrowserState", () => {
  it("extracts selectedPluginId and lastSeenTimestamp", () => {
    const state: PluginBrowserState = {
      ...initialPluginBrowserState(),
      selectedPluginId: "a",
      cursor: { lastSeenTimestamp: 1234 },
    };
    const persisted = serializePluginBrowserState(state);
    expect(persisted.schemaVersion).toBe(PERSISTENCE_SCHEMA_VERSION);
    expect(persisted.selectedPluginId).toBe("a");
    expect(persisted.lastSeenTimestamp).toBe(1234);
  });

  it("handles null selection and null cursor", () => {
    const state = initialPluginBrowserState();
    const persisted = serializePluginBrowserState(state);
    expect(persisted.selectedPluginId).toBeNull();
    expect(persisted.lastSeenTimestamp).toBeNull();
  });

  it("produces JSON-safe output (round-trips through JSON)", () => {
    const state: PluginBrowserState = {
      ...initialPluginBrowserState(),
      selectedPluginId: "com.example",
      cursor: { lastSeenTimestamp: 9999 },
    };
    const out = JSON.parse(JSON.stringify(serializePluginBrowserState(state)));
    expect(out).toEqual({
      schemaVersion: PERSISTENCE_SCHEMA_VERSION,
      selectedPluginId: "com.example",
      lastSeenTimestamp: 9999,
    });
  });
});

describe("rehydratePluginBrowserState", () => {
  it("applies persisted fields over initial", () => {
    const initial = initialPluginBrowserState();
    const rehydrated = rehydratePluginBrowserState(initial, {
      schemaVersion: PERSISTENCE_SCHEMA_VERSION,
      selectedPluginId: "a",
      lastSeenTimestamp: 555,
    });
    expect(rehydrated.selectedPluginId).toBe("a");
    expect(rehydrated.cursor.lastSeenTimestamp).toBe(555);
  });

  it("preserves non-persistable slices by identity", () => {
    const initial = initialPluginBrowserState();
    const rehydrated = rehydratePluginBrowserState(initial, {
      schemaVersion: PERSISTENCE_SCHEMA_VERSION,
      selectedPluginId: "a",
      lastSeenTimestamp: 0,
    });
    expect(rehydrated.currentSnapshot).toBe(initial.currentSnapshot);
    expect(rehydrated.changelog).toBe(initial.changelog);
    expect(rehydrated.displays).toBe(initial.displays);
  });

  it("returns the same reference when no persisted field differs", () => {
    const initial = initialPluginBrowserState();
    const out = rehydratePluginBrowserState(initial, {
      schemaVersion: PERSISTENCE_SCHEMA_VERSION,
      selectedPluginId: null,
      lastSeenTimestamp: null,
    });
    expect(out).toBe(initial);
  });

  it("preserves cursor reference when only selection moved", () => {
    const initial = initialPluginBrowserState();
    const out = rehydratePluginBrowserState(initial, {
      schemaVersion: PERSISTENCE_SCHEMA_VERSION,
      selectedPluginId: "a",
      lastSeenTimestamp: null,
    });
    expect(out.cursor).toBe(initial.cursor);
  });
});

describe("parsePluginBrowserPersistedState", () => {
  it("accepts a valid object", () => {
    const out = parsePluginBrowserPersistedState({
      schemaVersion: PERSISTENCE_SCHEMA_VERSION,
      selectedPluginId: "a",
      lastSeenTimestamp: 123,
    });
    expect(out).toEqual({
      schemaVersion: PERSISTENCE_SCHEMA_VERSION,
      selectedPluginId: "a",
      lastSeenTimestamp: 123,
    });
  });

  it("accepts null values for both nullable fields", () => {
    const out = parsePluginBrowserPersistedState({
      schemaVersion: PERSISTENCE_SCHEMA_VERSION,
      selectedPluginId: null,
      lastSeenTimestamp: null,
    });
    expect(out).not.toBeNull();
    expect(out!.selectedPluginId).toBeNull();
    expect(out!.lastSeenTimestamp).toBeNull();
  });

  it("returns null for non-object input", () => {
    expect(parsePluginBrowserPersistedState(null)).toBeNull();
    expect(parsePluginBrowserPersistedState("string")).toBeNull();
    expect(parsePluginBrowserPersistedState(42)).toBeNull();
    expect(parsePluginBrowserPersistedState(undefined)).toBeNull();
  });

  it("returns null on schema-version mismatch", () => {
    expect(
      parsePluginBrowserPersistedState({
        schemaVersion: PERSISTENCE_SCHEMA_VERSION + 1,
        selectedPluginId: "a",
        lastSeenTimestamp: null,
      }),
    ).toBeNull();
  });

  it("returns null when selectedPluginId is wrong type", () => {
    expect(
      parsePluginBrowserPersistedState({
        schemaVersion: PERSISTENCE_SCHEMA_VERSION,
        selectedPluginId: 42,
        lastSeenTimestamp: null,
      }),
    ).toBeNull();
  });

  it("returns null when lastSeenTimestamp is wrong type", () => {
    expect(
      parsePluginBrowserPersistedState({
        schemaVersion: PERSISTENCE_SCHEMA_VERSION,
        selectedPluginId: "a",
        lastSeenTimestamp: "not-a-number",
      }),
    ).toBeNull();
  });

  it("returns null when lastSeenTimestamp is a non-finite number", () => {
    expect(
      parsePluginBrowserPersistedState({
        schemaVersion: PERSISTENCE_SCHEMA_VERSION,
        selectedPluginId: "a",
        lastSeenTimestamp: Number.NaN,
      }),
    ).toBeNull();
    expect(
      parsePluginBrowserPersistedState({
        schemaVersion: PERSISTENCE_SCHEMA_VERSION,
        selectedPluginId: "a",
        lastSeenTimestamp: Number.POSITIVE_INFINITY,
      }),
    ).toBeNull();
  });
});

describe("parsePluginBrowserPersistedStateJson", () => {
  it("parses a valid JSON string", () => {
    const json = JSON.stringify({
      schemaVersion: PERSISTENCE_SCHEMA_VERSION,
      selectedPluginId: "a",
      lastSeenTimestamp: 1,
    });
    const out = parsePluginBrowserPersistedStateJson(json);
    expect(out).not.toBeNull();
    expect(out!.selectedPluginId).toBe("a");
  });

  it("returns null for null / undefined inputs", () => {
    expect(parsePluginBrowserPersistedStateJson(null)).toBeNull();
    expect(parsePluginBrowserPersistedStateJson(undefined)).toBeNull();
  });

  it("returns null for unparseable JSON", () => {
    expect(parsePluginBrowserPersistedStateJson("{not valid}")).toBeNull();
  });

  it("returns null for valid JSON with invalid shape", () => {
    expect(
      parsePluginBrowserPersistedStateJson(JSON.stringify({ foo: "bar" })),
    ).toBeNull();
  });
});

describe("stringifyPluginBrowserPersistedState + round-trip", () => {
  it("stringify → parse reproduces the persistable subset", () => {
    const state: PluginBrowserState = {
      ...initialPluginBrowserState(),
      selectedPluginId: "com.x",
      cursor: { lastSeenTimestamp: 42 },
    };
    const json = stringifyPluginBrowserPersistedState(state);
    const parsed = parsePluginBrowserPersistedStateJson(json);
    expect(parsed).toEqual({
      schemaVersion: PERSISTENCE_SCHEMA_VERSION,
      selectedPluginId: "com.x",
      lastSeenTimestamp: 42,
    });
  });

  it("live-store → stringify → boot reproduces selection + cursor", () => {
    const store = createPluginBrowserStore();
    store.dispatch({
      type: "snapshotRefreshed",
      snapshot: snap(row("a", "error")),
      now: 1000,
    });
    store.dispatch({ type: "selectPlugin", pluginId: "a" });
    store.dispatch({ type: "markAllSeen" });

    const json = stringifyPluginBrowserPersistedState(store.getState());
    const booted = bootPluginBrowserStateFromJson(json);

    expect(booted.selectedPluginId).toBe("a");
    expect(booted.cursor.lastSeenTimestamp).toBe(
      store.getState().cursor.lastSeenTimestamp,
    );
    // And critically: non-persisted slices should NOT survive.
    expect(booted.currentSnapshot.size).toBe(0);
    expect(booted.changelog.entries.length).toBe(0);
  });
});

describe("bootPluginBrowserStateFromJson", () => {
  it("returns initial state when JSON is null", () => {
    const out = bootPluginBrowserStateFromJson(null);
    expect(out.selectedPluginId).toBeNull();
    expect(out.cursor.lastSeenTimestamp).toBeNull();
  });

  it("returns initial state when JSON is corrupt", () => {
    const out = bootPluginBrowserStateFromJson("not-json");
    expect(out.selectedPluginId).toBeNull();
  });

  it("rehydrates persisted fields when JSON is valid", () => {
    const json = JSON.stringify({
      schemaVersion: PERSISTENCE_SCHEMA_VERSION,
      selectedPluginId: "com.valid",
      lastSeenTimestamp: 777,
    });
    const out = bootPluginBrowserStateFromJson(json);
    expect(out.selectedPluginId).toBe("com.valid");
    expect(out.cursor.lastSeenTimestamp).toBe(777);
  });
});

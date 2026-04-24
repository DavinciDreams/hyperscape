/**
 * Tests for the AnalyticsEventsProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { analyticsEventsProvider } from "../AnalyticsEventsProvider";

beforeEach(() => {
  analyticsEventsProvider.unload();
});
afterEach(() => {
  analyticsEventsProvider.unload();
});

const validManifest = [
  {
    name: "session_start",
    category: "session",
    props: [
      {
        name: "platform",
        kind: "enum" as const,
        enumValues: ["web", "ios", "android"],
      },
      {
        name: "client_version",
        kind: "string" as const,
        cardinality: "high" as const,
      },
    ],
  },
  {
    name: "quest_completed",
    category: "progression",
    samplingRate: 0.5,
    props: [
      {
        name: "quest_id",
        kind: "string" as const,
        cardinality: "medium" as const,
      },
      { name: "duration_seconds", kind: "integer" as const },
    ],
  },
];

describe("AnalyticsEventsProvider", () => {
  it("starts unloaded", () => {
    expect(analyticsEventsProvider.isLoaded()).toBe(false);
    expect(analyticsEventsProvider.getEvents()).toEqual([]);
    expect(analyticsEventsProvider.getManifest()).toBeNull();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = analyticsEventsProvider.loadRaw(validManifest);
    analyticsEventsProvider.unload();
    analyticsEventsProvider.load(parsed);
    expect(analyticsEventsProvider.isLoaded()).toBe(true);
    expect(analyticsEventsProvider.getEvents().length).toBe(2);
  });

  it("loadRaw() accepts valid payload and returns parsed manifest", () => {
    const parsed = analyticsEventsProvider.loadRaw(validManifest);
    expect(parsed.length).toBe(2);
    expect(parsed[0].name).toBe("session_start");
    expect(parsed[0].props[0].kind).toBe("enum");
  });

  it("loadRaw() accepts an empty array", () => {
    const parsed = analyticsEventsProvider.loadRaw([]);
    expect(parsed).toEqual([]);
    expect(analyticsEventsProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() rejects duplicate event names", () => {
    const dup = [
      { name: "session_start", category: "session" },
      { name: "session_start", category: "session" },
    ];
    expect(() => analyticsEventsProvider.loadRaw(dup)).toThrow();
    expect(analyticsEventsProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects non-snake_case event names", () => {
    const bad = [{ name: "SessionStart", category: "session" }];
    expect(() => analyticsEventsProvider.loadRaw(bad)).toThrow();
    expect(analyticsEventsProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects enum prop without enumValues", () => {
    const bad = [
      {
        name: "session_start",
        category: "session",
        props: [{ name: "platform", kind: "enum" as const }],
      },
    ];
    expect(() => analyticsEventsProvider.loadRaw(bad)).toThrow();
    expect(analyticsEventsProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects non-enum prop carrying enumValues", () => {
    const bad = [
      {
        name: "session_start",
        category: "session",
        props: [
          {
            name: "client_version",
            kind: "string" as const,
            enumValues: ["a"],
          },
        ],
      },
    ];
    expect(() => analyticsEventsProvider.loadRaw(bad)).toThrow();
    expect(analyticsEventsProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects duplicate prop names within a single event", () => {
    const bad = [
      {
        name: "session_start",
        category: "session",
        props: [
          { name: "platform", kind: "string" as const },
          { name: "platform", kind: "string" as const },
        ],
      },
    ];
    expect(() => analyticsEventsProvider.loadRaw(bad)).toThrow();
    expect(analyticsEventsProvider.isLoaded()).toBe(false);
  });

  it("hotReload(manifest) replaces the current manifest", () => {
    analyticsEventsProvider.loadRaw(validManifest);
    const replacement = analyticsEventsProvider.loadRaw([
      { name: "login_success", category: "session" },
    ]);
    analyticsEventsProvider.hotReload(replacement);
    expect(analyticsEventsProvider.getEvents().length).toBe(1);
    expect(analyticsEventsProvider.getEvents()[0].name).toBe("login_success");
  });

  it("hotReload(null) clears", () => {
    analyticsEventsProvider.loadRaw(validManifest);
    analyticsEventsProvider.hotReload(null);
    expect(analyticsEventsProvider.isLoaded()).toBe(false);
    expect(analyticsEventsProvider.getEvents()).toEqual([]);
  });

  it("unload() resets", () => {
    analyticsEventsProvider.loadRaw(validManifest);
    analyticsEventsProvider.unload();
    expect(analyticsEventsProvider.isLoaded()).toBe(false);
    expect(analyticsEventsProvider.getManifest()).toBeNull();
  });
});

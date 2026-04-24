/**
 * Tests for the NewsFeedProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { newsFeedProvider } from "../NewsFeedProvider";

beforeEach(() => {
  newsFeedProvider.unload();
});
afterEach(() => {
  newsFeedProvider.unload();
});

const validCategory = {
  id: "patchNotes",
  name: "Patch Notes",
};

const validEntry = {
  id: "patch1",
  titleLocalizationKey: "news.patch1.title",
  bodyAssetRef: "newsPatch1Body",
  categoryId: "patchNotes",
  publishAtIso: "2026-04-20T00:00:00Z",
};

const validManifest = {
  enabled: true,
  categories: [validCategory],
  entries: [validEntry],
};

describe("NewsFeedProvider", () => {
  it("starts unloaded", () => {
    expect(newsFeedProvider.isLoaded()).toBe(false);
    expect(newsFeedProvider.getManifest()).toBeNull();
  });

  it("loadRaw() accepts a valid manifest and fills defaults", () => {
    const parsed = newsFeedProvider.loadRaw(validManifest);
    expect(parsed.enabled).toBe(true);
    expect(parsed.categories.length).toBe(1);
    expect(parsed.entries.length).toBe(1);
    expect(parsed.entries[0].priority).toBe("normal");
    expect(parsed.entries[0].pinned).toBe(false);
    expect(parsed.entries[0].dismissable).toBe(true);
    expect(parsed.feed.maxEntriesRetained).toBe(100);
    expect(parsed.feed.pollIntervalMinutes).toBe(30);
    expect(newsFeedProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() accepts disabled blob", () => {
    const parsed = newsFeedProvider.loadRaw({ enabled: false });
    expect(parsed.enabled).toBe(false);
    expect(parsed.categories.length).toBe(0);
    expect(newsFeedProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() rejects enabled=true with no categories", () => {
    expect(() => newsFeedProvider.loadRaw({ enabled: true })).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = newsFeedProvider.loadRaw(validManifest);
    newsFeedProvider.unload();
    newsFeedProvider.load(parsed);
    expect(newsFeedProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() rejects duplicate category ids", () => {
    const bad = {
      ...validManifest,
      categories: [validCategory, { ...validCategory }],
    };
    expect(() => newsFeedProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects duplicate entry ids", () => {
    const bad = {
      ...validManifest,
      entries: [validEntry, { ...validEntry }],
    };
    expect(() => newsFeedProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects entry with undeclared categoryId", () => {
    const bad = {
      ...validManifest,
      entries: [{ ...validEntry, categoryId: "unknownCat" }],
    };
    expect(() => newsFeedProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects expireAtIso <= publishAtIso", () => {
    const bad = {
      ...validManifest,
      entries: [
        {
          ...validEntry,
          publishAtIso: "2026-04-20T00:00:00Z",
          expireAtIso: "2026-04-19T00:00:00Z",
        },
      ],
    };
    expect(() => newsFeedProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() accepts empty expireAtIso (never expires)", () => {
    const parsed = newsFeedProvider.loadRaw({
      ...validManifest,
      entries: [{ ...validEntry, expireAtIso: "" }],
    });
    expect(parsed.entries[0].expireAtIso).toBe("");
  });

  it("loadRaw() rejects duplicate tags on an entry", () => {
    const bad = {
      ...validManifest,
      entries: [{ ...validEntry, tags: ["foo", "foo"] }],
    };
    expect(() => newsFeedProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects duplicate platforms in targeting", () => {
    const bad = {
      ...validManifest,
      entries: [
        {
          ...validEntry,
          targeting: { platforms: ["web", "web"] },
        },
      ],
    };
    expect(() => newsFeedProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects duplicate regionPrefixes in targeting", () => {
    const bad = {
      ...validManifest,
      entries: [
        {
          ...validEntry,
          targeting: { regionPrefixes: ["US", "US"] },
        },
      ],
    };
    expect(() => newsFeedProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects malformed category color", () => {
    const bad = {
      ...validManifest,
      categories: [{ ...validCategory, color: "red" as unknown as string }],
    };
    expect(() => newsFeedProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() accepts valid #RRGGBB category color", () => {
    const parsed = newsFeedProvider.loadRaw({
      ...validManifest,
      categories: [{ ...validCategory, color: "#ff8800" }],
    });
    expect(parsed.categories[0].color).toBe("#ff8800");
  });

  it("loadRaw() rejects minClientBuild of invalid shape", () => {
    // minClientBuild is a plain string default "" — anything non-string rejects
    const bad = {
      ...validManifest,
      entries: [
        {
          ...validEntry,
          targeting: { minClientBuild: 123 as unknown as string },
        },
      ],
    };
    expect(() => newsFeedProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects minAccountAgeDays out of range", () => {
    const bad = {
      ...validManifest,
      entries: [
        {
          ...validEntry,
          targeting: { minAccountAgeDays: 99999 },
        },
      ],
    };
    expect(() => newsFeedProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() accepts pollIntervalMinutes=0 (push-only)", () => {
    const parsed = newsFeedProvider.loadRaw({
      ...validManifest,
      feed: { pollIntervalMinutes: 0 },
    });
    expect(parsed.feed.pollIntervalMinutes).toBe(0);
  });

  it("hotReload() replaces the manifest with a new one", () => {
    newsFeedProvider.loadRaw(validManifest);
    const parsed = newsFeedProvider.loadRaw({
      enabled: false,
    });
    newsFeedProvider.hotReload(parsed);
    expect(newsFeedProvider.getManifest()?.enabled).toBe(false);
  });

  it("hotReload(null) clears the manifest", () => {
    newsFeedProvider.loadRaw(validManifest);
    newsFeedProvider.hotReload(null);
    expect(newsFeedProvider.isLoaded()).toBe(false);
  });

  it("unload() clears a loaded manifest", () => {
    newsFeedProvider.loadRaw(validManifest);
    newsFeedProvider.unload();
    expect(newsFeedProvider.isLoaded()).toBe(false);
  });
});

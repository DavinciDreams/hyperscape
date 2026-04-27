import { NewsFeedManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it, vi } from "vitest";
import {
  NewsFeedNotLoadedError,
  NewsFeedRegistry,
  UnknownNewsCategoryError,
  UnknownNewsEntryError,
} from "../NewsFeedRegistry.js";

function manifest() {
  return NewsFeedManifestSchema.parse({
    enabled: true,
    categories: [
      { id: "patch", name: "Patch notes", visibleInFilters: true },
      { id: "event", name: "Events", visibleInFilters: true },
      { id: "internal", name: "Internal", visibleInFilters: false },
    ],
    entries: [
      {
        id: "patch001",
        titleLocalizationKey: "news.patch001.title",
        bodyAssetRef: "bodyPatch001",
        categoryId: "patch",
        priority: "normal",
        publishAtIso: "2026-01-01T00:00:00Z",
      },
      {
        id: "maintenance",
        titleLocalizationKey: "news.maint.title",
        bodyAssetRef: "bodyMaint",
        categoryId: "patch",
        priority: "critical",
        publishAtIso: "2026-02-01T00:00:00Z",
        expireAtIso: "2026-02-10T00:00:00Z",
      },
      {
        id: "festive",
        titleLocalizationKey: "news.festive.title",
        bodyAssetRef: "bodyFestive",
        categoryId: "event",
        priority: "high",
        pinned: true,
        publishAtIso: "2026-03-01T00:00:00Z",
        targeting: {
          platforms: ["web", "windows"],
          minCharacterLevel: 10,
        },
      },
      {
        id: "iosOnly",
        titleLocalizationKey: "news.ios.title",
        bodyAssetRef: "bodyIos",
        categoryId: "event",
        priority: "low",
        publishAtIso: "2026-03-15T00:00:00Z",
        targeting: { platforms: ["ios"] },
      },
      {
        id: "flaggedBeta",
        titleLocalizationKey: "news.flagged.title",
        bodyAssetRef: "bodyFlagged",
        categoryId: "patch",
        priority: "normal",
        publishAtIso: "2026-03-20T00:00:00Z",
        targeting: { requiresFlagId: "beta.news" },
      },
    ],
  });
}

const baseViewer = {
  platform: "web" as const,
  region: "en-US",
  clientBuild: "1.0.0",
  characterLevel: 20,
  accountAgeDays: 30,
  enabledFlagIds: new Set<string>(),
};

describe("NewsFeedRegistry — not loaded", () => {
  it("throws pre-load", () => {
    expect(() => new NewsFeedRegistry().manifest).toThrow(
      NewsFeedNotLoadedError,
    );
  });
});

describe("NewsFeedRegistry — lookup", () => {
  it("indexes entries and categories", () => {
    const r = new NewsFeedRegistry(manifest());
    expect(r.hasEntry("patch001")).toBe(true);
    expect(r.entry("festive").pinned).toBe(true);
    expect(r.category("patch").name).toBe("Patch notes");
  });

  it("throws on unknown entry/category", () => {
    const r = new NewsFeedRegistry(manifest());
    expect(() => r.entry("ghost")).toThrow(UnknownNewsEntryError);
    expect(() => r.category("ghost")).toThrow(UnknownNewsCategoryError);
  });

  it("filter-chip categories respect visibleInFilters", () => {
    const r = new NewsFeedRegistry(manifest());
    expect(r.filterChipCategories().map((c) => c.id)).toEqual([
      "patch",
      "event",
    ]);
  });
});

describe("NewsFeedRegistry — publish window", () => {
  it("unpublished before publishAt", () => {
    const r = new NewsFeedRegistry(manifest());
    expect(r.isPublished("patch001", "2025-12-31T00:00:00Z")).toBe(false);
  });

  it("published after publishAt", () => {
    const r = new NewsFeedRegistry(manifest());
    expect(r.isPublished("patch001", "2026-06-01T00:00:00Z")).toBe(true);
  });

  it("unpublished after expireAt", () => {
    const r = new NewsFeedRegistry(manifest());
    expect(r.isPublished("maintenance", "2026-02-15T00:00:00Z")).toBe(false);
  });
});

describe("NewsFeedRegistry — targeting", () => {
  it("matches by platform", () => {
    const r = new NewsFeedRegistry(manifest());
    expect(r.matchesViewer("iosOnly", baseViewer)).toBe(false);
    expect(r.matchesViewer("iosOnly", { ...baseViewer, platform: "ios" })).toBe(
      true,
    );
  });

  it("matches by character level", () => {
    const r = new NewsFeedRegistry(manifest());
    expect(
      r.matchesViewer("festive", { ...baseViewer, characterLevel: 5 }),
    ).toBe(false);
    expect(r.matchesViewer("festive", baseViewer)).toBe(true);
  });

  it("matches by region prefix", () => {
    const r = new NewsFeedRegistry();
    r.loadFromJson({
      enabled: true,
      categories: [{ id: "c", name: "C" }],
      entries: [
        {
          id: "e",
          titleLocalizationKey: "e.title",
          bodyAssetRef: "bodyRegion",
          categoryId: "c",
          publishAtIso: "2026-01-01T00:00:00Z",
          targeting: { regionPrefixes: ["en-"] },
        },
      ],
    });
    expect(r.matchesViewer("e", baseViewer)).toBe(true);
    expect(r.matchesViewer("e", { ...baseViewer, region: "fr-FR" })).toBe(
      false,
    );
  });

  it("matches by feature flag", () => {
    const r = new NewsFeedRegistry(manifest());
    expect(r.matchesViewer("flaggedBeta", baseViewer)).toBe(false);
    expect(
      r.matchesViewer("flaggedBeta", {
        ...baseViewer,
        enabledFlagIds: new Set(["beta.news"]),
      }),
    ).toBe(true);
  });
});

describe("NewsFeedRegistry — visible feed", () => {
  it("orders by pinned then priority then recency", () => {
    const r = new NewsFeedRegistry(manifest());
    const feed = r.visibleFeed("2026-04-01T00:00:00Z", baseViewer);
    // expired: maintenance. flaggedBeta: not flagged, so filtered out.
    // festive (pinned, high), iosOnly (filtered — wrong platform), patch001 (normal).
    expect(feed.map((e) => e.id)).toEqual(["festive", "patch001"]);
  });

  it("includes expired-out entries during their window", () => {
    const r = new NewsFeedRegistry(manifest());
    const feed = r.visibleFeed("2026-02-05T00:00:00Z", baseViewer);
    expect(feed.map((e) => e.id)).toContain("maintenance");
    // critical > pinned (both patch001 not pinned; maintenance is critical but not pinned)
    // festive not yet published (starts 2026-03)
    expect(feed[0].id).toBe("maintenance");
  });

  it("respects dismissed ids", () => {
    const r = new NewsFeedRegistry(manifest());
    const feed = r.visibleFeed("2026-04-01T00:00:00Z", {
      ...baseViewer,
      dismissedEntryIds: new Set(["festive"]),
    });
    expect(feed.map((e) => e.id)).not.toContain("festive");
  });
});

describe("NewsFeedRegistry — unreadCount", () => {
  it("counts unread visible entries", () => {
    const r = new NewsFeedRegistry(manifest());
    expect(r.unreadCount("2026-04-01T00:00:00Z", baseViewer, new Set())).toBe(
      2,
    );
    expect(
      r.unreadCount("2026-04-01T00:00:00Z", baseViewer, new Set(["festive"])),
    ).toBe(1);
  });
});

describe("NewsFeedRegistry — onReloaded", () => {
  it("fires after every successful load()", () => {
    const r = new NewsFeedRegistry();
    const cb = vi.fn();
    r.onReloaded(cb);
    r.load(manifest());
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("returned unsubscribe stops further notifications", () => {
    const r = new NewsFeedRegistry();
    const cb = vi.fn();
    const off = r.onReloaded(cb);
    r.load(manifest());
    off();
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("a throwing listener does not break subsequent listeners", () => {
    const r = new NewsFeedRegistry();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const bad = vi.fn(() => {
      throw new Error("listener boom");
    });
    const good = vi.fn();
    r.onReloaded(bad);
    r.onReloaded(good);
    r.load(manifest());
    expect(bad).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

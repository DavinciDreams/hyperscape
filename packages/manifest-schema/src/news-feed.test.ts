import { describe, expect, it } from "vitest";
import {
  FeedRulesSchema,
  NewsCategorySchema,
  NewsEntrySchema,
  NewsFeedManifestSchema,
  NewsTargetingSchema,
} from "./news-feed.js";

describe("NewsCategorySchema", () => {
  it("accepts a valid category", () => {
    const c = NewsCategorySchema.parse({
      id: "patchNotes",
      name: "Patch Notes",
      color: "#ff8800",
    });
    expect(c.visibleInFilters).toBe(true);
  });

  it("rejects invalid hex color", () => {
    expect(() =>
      NewsCategorySchema.parse({
        id: "x",
        name: "X",
        color: "red",
      }),
    ).toThrow(/color/);
  });

  it("accepts empty color (use UI default)", () => {
    const c = NewsCategorySchema.parse({
      id: "x",
      name: "X",
      color: "",
    });
    expect(c.color).toBe("");
  });
});

describe("NewsTargetingSchema", () => {
  it("accepts wildcard default", () => {
    const t = NewsTargetingSchema.parse({});
    expect(t.platforms).toEqual([]);
    expect(t.minCharacterLevel).toBe(0);
  });

  it("rejects duplicate platforms", () => {
    expect(() =>
      NewsTargetingSchema.parse({
        platforms: ["ios", "ios"],
      }),
    ).toThrow(/unique/);
  });

  it("rejects duplicate region prefixes", () => {
    expect(() =>
      NewsTargetingSchema.parse({
        regionPrefixes: ["en", "en"],
      }),
    ).toThrow(/unique/);
  });

  it("rejects minCharacterLevel > 200", () => {
    expect(() =>
      NewsTargetingSchema.parse({ minCharacterLevel: 300 }),
    ).toThrow();
  });
});

describe("NewsEntrySchema", () => {
  const base = {
    id: "v1_0_0_patch",
    titleLocalizationKey: "news.v1_0_0.title",
    bodyAssetRef: "newsBody_v1_0_0",
    categoryId: "patchNotes",
    publishAtIso: "2025-06-01T00:00:00Z",
  };

  it("accepts a valid entry", () => {
    const e = NewsEntrySchema.parse(base);
    expect(e.priority).toBe("normal");
    expect(e.pinned).toBe(false);
  });

  it("rejects expireAtIso <= publishAtIso", () => {
    expect(() =>
      NewsEntrySchema.parse({
        ...base,
        expireAtIso: "2025-01-01T00:00:00Z",
      }),
    ).toThrow(/expireAtIso/);
  });

  it("accepts expireAtIso > publishAtIso", () => {
    const e = NewsEntrySchema.parse({
      ...base,
      expireAtIso: "2025-06-30T00:00:00Z",
    });
    expect(e.expireAtIso).toBe("2025-06-30T00:00:00Z");
  });

  it("accepts empty expireAtIso (never expires)", () => {
    const e = NewsEntrySchema.parse({ ...base, expireAtIso: "" });
    expect(e.expireAtIso).toBe("");
  });

  it("rejects duplicate tags", () => {
    expect(() =>
      NewsEntrySchema.parse({ ...base, tags: ["foo", "foo"] }),
    ).toThrow(/tags/);
  });

  it("requires title localization key", () => {
    expect(() =>
      NewsEntrySchema.parse({ ...base, titleLocalizationKey: "" }),
    ).toThrow();
  });
});

describe("FeedRulesSchema", () => {
  it("defaults sensibly", () => {
    const r = FeedRulesSchema.parse({});
    expect(r.maxEntriesRetained).toBe(100);
    expect(r.pollIntervalMinutes).toBe(30);
    expect(r.autoShowOnLoginIfUnread).toBe(true);
  });

  it("rejects maxEntriesRetained below 10", () => {
    expect(() => FeedRulesSchema.parse({ maxEntriesRetained: 1 })).toThrow();
  });

  it("allows pollIntervalMinutes=0 (push-only)", () => {
    const r = FeedRulesSchema.parse({ pollIntervalMinutes: 0 });
    expect(r.pollIntervalMinutes).toBe(0);
  });
});

describe("NewsFeedManifestSchema", () => {
  const cat = { id: "patchNotes", name: "Patch Notes" };
  const entry = {
    id: "e1",
    titleLocalizationKey: "news.e1.title",
    bodyAssetRef: "newsBodyE1",
    categoryId: "patchNotes",
    publishAtIso: "2025-06-01T00:00:00Z",
  };

  it("accepts a minimal manifest", () => {
    const m = NewsFeedManifestSchema.parse({
      categories: [cat],
      entries: [entry],
    });
    expect(m.enabled).toBe(true);
  });

  it("rejects enabled manifest with no categories", () => {
    expect(() => NewsFeedManifestSchema.parse({ categories: [] })).toThrow(
      /at least one category/,
    );
  });

  it("allows disabled manifest with no categories", () => {
    const m = NewsFeedManifestSchema.parse({
      enabled: false,
      categories: [],
    });
    expect(m.enabled).toBe(false);
  });

  it("rejects duplicate category ids", () => {
    expect(() =>
      NewsFeedManifestSchema.parse({
        categories: [cat, cat],
      }),
    ).toThrow(/category ids/);
  });

  it("rejects duplicate entry ids", () => {
    expect(() =>
      NewsFeedManifestSchema.parse({
        categories: [cat],
        entries: [entry, entry],
      }),
    ).toThrow(/entry ids/);
  });

  it("rejects entry pointing to unknown category", () => {
    expect(() =>
      NewsFeedManifestSchema.parse({
        categories: [cat],
        entries: [{ ...entry, categoryId: "ghost" }],
      }),
    ).toThrow(/categoryId/);
  });

  it("accepts a full manifest", () => {
    const m = NewsFeedManifestSchema.parse({
      categories: [cat, { id: "maintenance", name: "Maintenance" }],
      entries: [
        entry,
        {
          ...entry,
          id: "e2",
          categoryId: "maintenance",
          priority: "critical",
          publishAtIso: "2025-07-01T00:00:00Z",
          tags: ["downtime", "server"],
        },
      ],
    });
    expect(m.entries).toHaveLength(2);
  });
});

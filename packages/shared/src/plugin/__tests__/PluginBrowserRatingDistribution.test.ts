import { describe, expect, it } from "vitest";
import { createPluginBrowserRatingDistribution } from "../PluginBrowserRatingDistribution.js";

describe("createPluginBrowserRatingDistribution — defaults", () => {
  it("starts empty", () => {
    const r = createPluginBrowserRatingDistribution();
    expect(r.all()).toEqual([]);
    expect(r.size()).toBe(0);
    expect(r.has("p")).toBe(false);
    expect(r.get("p")).toBeUndefined();
    expect(r.rankByAverage()).toEqual([]);
  });
});

describe("createPluginBrowserRatingDistribution — set", () => {
  it("stores a new entry with total + average", () => {
    const r = createPluginBrowserRatingDistribution();
    expect(
      r.set("p", { star1: 1, star2: 2, star3: 3, star4: 4, star5: 5 }),
    ).toBe(true);
    const e = r.get("p");
    expect(e?.total).toBe(15);
    // (1*1 + 2*2 + 3*3 + 4*4 + 5*5) / 15 = 55 / 15
    expect(e?.average).toBeCloseTo(55 / 15);
  });

  it("handles zero-total (average=0)", () => {
    const r = createPluginBrowserRatingDistribution();
    r.set("p", { star1: 0, star2: 0, star3: 0, star4: 0, star5: 0 });
    const e = r.get("p");
    expect(e?.total).toBe(0);
    expect(e?.average).toBe(0);
  });

  it("replaces existing entry atomically", () => {
    const r = createPluginBrowserRatingDistribution();
    r.set("p", { star1: 5, star2: 0, star3: 0, star4: 0, star5: 0 });
    r.set("p", { star1: 0, star2: 0, star3: 0, star4: 0, star5: 5 });
    expect(r.get("p")?.average).toBe(5);
  });

  it("idempotent on identical buckets", () => {
    const r = createPluginBrowserRatingDistribution();
    r.set("p", { star1: 1, star2: 1, star3: 1, star4: 1, star5: 1 });
    expect(
      r.set("p", { star1: 1, star2: 1, star3: 1, star4: 1, star5: 1 }),
    ).toBe(false);
  });

  it("rejects empty pluginId", () => {
    const r = createPluginBrowserRatingDistribution();
    expect(
      r.set("", { star1: 1, star2: 0, star3: 0, star4: 0, star5: 0 }),
    ).toBe(false);
  });

  it("rejects negative / non-integer / non-finite buckets", () => {
    const r = createPluginBrowserRatingDistribution();
    expect(
      r.set("p", { star1: -1, star2: 0, star3: 0, star4: 0, star5: 0 }),
    ).toBe(false);
    expect(
      r.set("p", { star1: 1.5, star2: 0, star3: 0, star4: 0, star5: 0 }),
    ).toBe(false);
    expect(
      r.set("p", {
        star1: Number.NaN,
        star2: 0,
        star3: 0,
        star4: 0,
        star5: 0,
      }),
    ).toBe(false);
    expect(
      r.set("p", {
        star1: Number.POSITIVE_INFINITY,
        star2: 0,
        star3: 0,
        star4: 0,
        star5: 0,
      }),
    ).toBe(false);
  });

  it("rejects non-object buckets", () => {
    const r = createPluginBrowserRatingDistribution();
    expect(r.set("p", null as unknown as Parameters<typeof r.set>[1])).toBe(
      false,
    );
  });
});

describe("createPluginBrowserRatingDistribution — has / get", () => {
  it("rejects empty pluginId", () => {
    const r = createPluginBrowserRatingDistribution();
    r.set("p", { star1: 1, star2: 0, star3: 0, star4: 0, star5: 0 });
    expect(r.has("")).toBe(false);
    expect(r.get("")).toBeUndefined();
  });
});

describe("createPluginBrowserRatingDistribution — all", () => {
  it("returns insertion order, snapshot-isolated", () => {
    const r = createPluginBrowserRatingDistribution();
    r.set("a", { star1: 1, star2: 0, star3: 0, star4: 0, star5: 0 });
    r.set("b", { star1: 0, star2: 0, star3: 0, star4: 0, star5: 1 });
    const snap = r.all() as unknown as unknown[];
    snap.length = 0;
    expect(r.size()).toBe(2);
    expect(r.all().map((e) => e.pluginId)).toEqual(["a", "b"]);
  });
});

describe("createPluginBrowserRatingDistribution — rankByAverage", () => {
  it("sorts by average descending", () => {
    const r = createPluginBrowserRatingDistribution();
    r.set("a", { star1: 0, star2: 0, star3: 0, star4: 0, star5: 1 }); // avg 5
    r.set("b", { star1: 0, star2: 0, star3: 1, star4: 0, star5: 0 }); // avg 3
    r.set("c", { star1: 0, star2: 0, star3: 0, star4: 1, star5: 0 }); // avg 4
    expect(r.rankByAverage()).toEqual(["a", "c", "b"]);
  });

  it("tiebreak by total descending", () => {
    const r = createPluginBrowserRatingDistribution();
    // both avg=4 but b has more total
    r.set("a", { star1: 0, star2: 0, star3: 0, star4: 1, star5: 0 });
    r.set("b", { star1: 0, star2: 0, star3: 0, star4: 10, star5: 0 });
    expect(r.rankByAverage()).toEqual(["b", "a"]);
  });

  it("tiebreak by insertion order after total tie", () => {
    const r = createPluginBrowserRatingDistribution();
    r.set("first", { star1: 0, star2: 0, star3: 1, star4: 0, star5: 0 });
    r.set("second", { star1: 0, star2: 0, star3: 1, star4: 0, star5: 0 });
    expect(r.rankByAverage()).toEqual(["first", "second"]);
  });

  it("excludes unrated plugins (total=0)", () => {
    const r = createPluginBrowserRatingDistribution();
    r.set("rated", { star1: 0, star2: 0, star3: 1, star4: 0, star5: 0 });
    r.set("unrated", {
      star1: 0,
      star2: 0,
      star3: 0,
      star4: 0,
      star5: 0,
    });
    expect(r.rankByAverage()).toEqual(["rated"]);
  });
});

describe("createPluginBrowserRatingDistribution — remove / clear", () => {
  it("remove returns true on hit, false on miss", () => {
    const r = createPluginBrowserRatingDistribution();
    r.set("a", { star1: 1, star2: 0, star3: 0, star4: 0, star5: 0 });
    expect(r.remove("a")).toBe(true);
    expect(r.remove("a")).toBe(false);
    expect(r.remove("")).toBe(false);
  });

  it("clear wipes every entry", () => {
    const r = createPluginBrowserRatingDistribution();
    r.set("a", { star1: 1, star2: 0, star3: 0, star4: 0, star5: 0 });
    r.set("b", { star1: 0, star2: 0, star3: 0, star4: 0, star5: 1 });
    r.clear();
    expect(r.size()).toBe(0);
  });
});

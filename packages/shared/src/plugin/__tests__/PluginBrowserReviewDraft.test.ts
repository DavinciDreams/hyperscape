import { describe, expect, it } from "vitest";
import { createPluginBrowserReviewDraft } from "../PluginBrowserReviewDraft.js";

describe("createPluginBrowserReviewDraft — defaults", () => {
  it("starts closed", () => {
    const r = createPluginBrowserReviewDraft();
    expect(r.hasOpen()).toBe(false);
    expect(r.getOpen()).toBeUndefined();
    expect(r.submit()).toBeUndefined();
    expect(r.cancel()).toBeUndefined();
    expect(r.close()).toBe(false);
  });
});

describe("createPluginBrowserReviewDraft — open", () => {
  it("opens a fresh draft with zero rating and empty text", () => {
    const r = createPluginBrowserReviewDraft();
    const d = r.open("p");
    expect(d?.id).toBe(1);
    expect(d?.pluginId).toBe("p");
    expect(d?.rating).toBe(0);
    expect(d?.text).toBe("");
    expect(r.hasOpen()).toBe(true);
  });

  it("accepts valid initial rating + text", () => {
    const r = createPluginBrowserReviewDraft();
    const d = r.open("p", 4, "nice");
    expect(d?.rating).toBe(4);
    expect(d?.text).toBe("nice");
  });

  it("silently replaces prior open", () => {
    const r = createPluginBrowserReviewDraft();
    r.open("a");
    const d2 = r.open("b");
    expect(d2?.id).toBe(2);
    expect(r.getOpen()?.pluginId).toBe("b");
  });

  it("rejects empty pluginId", () => {
    const r = createPluginBrowserReviewDraft();
    expect(r.open("")).toBeUndefined();
    expect(r.hasOpen()).toBe(false);
  });

  it("rejects out-of-range / non-integer initial rating", () => {
    const r = createPluginBrowserReviewDraft();
    expect(r.open("p", 0)).toBeUndefined();
    expect(r.open("p", 6)).toBeUndefined();
    expect(r.open("p", 3.5)).toBeUndefined();
    expect(r.open("p", Number.NaN)).toBeUndefined();
    expect(r.hasOpen()).toBe(false);
  });
});

describe("createPluginBrowserReviewDraft — setRating", () => {
  it("updates a valid rating", () => {
    const r = createPluginBrowserReviewDraft();
    r.open("p");
    expect(r.setRating(5)).toBe(true);
    expect(r.getOpen()?.rating).toBe(5);
  });

  it("rejects out-of-range / non-integer", () => {
    const r = createPluginBrowserReviewDraft();
    r.open("p", 3);
    expect(r.setRating(0)).toBe(false);
    expect(r.setRating(6)).toBe(false);
    expect(r.setRating(3.5)).toBe(false);
    expect(r.setRating(Number.NaN)).toBe(false);
    expect(r.getOpen()?.rating).toBe(3);
  });

  it("is idempotent on unchanged rating", () => {
    const r = createPluginBrowserReviewDraft();
    r.open("p", 4);
    expect(r.setRating(4)).toBe(false);
  });

  it("returns false when no draft open", () => {
    const r = createPluginBrowserReviewDraft();
    expect(r.setRating(3)).toBe(false);
  });
});

describe("createPluginBrowserReviewDraft — setText", () => {
  it("updates text including empty / whitespace", () => {
    const r = createPluginBrowserReviewDraft();
    r.open("p", 3, "start");
    expect(r.setText("hello")).toBe(true);
    expect(r.getOpen()?.text).toBe("hello");
    expect(r.setText("")).toBe(true);
    expect(r.getOpen()?.text).toBe("");
    expect(r.setText("  ")).toBe(true);
  });

  it("is idempotent on unchanged text", () => {
    const r = createPluginBrowserReviewDraft();
    r.open("p", 3, "same");
    expect(r.setText("same")).toBe(false);
  });

  it("returns false when no draft open", () => {
    const r = createPluginBrowserReviewDraft();
    expect(r.setText("x")).toBe(false);
  });
});

describe("createPluginBrowserReviewDraft — submit", () => {
  it("closes with outcome='submitted' when rating>=1", () => {
    const r = createPluginBrowserReviewDraft();
    r.open("p", 4, "great");
    const closed = r.submit();
    expect(closed?.outcome).toBe("submitted");
    expect(closed?.rating).toBe(4);
    expect(closed?.text).toBe("great");
    expect(r.hasOpen()).toBe(false);
  });

  it("rejects submit when rating=0 (no-op, keeps draft open)", () => {
    const r = createPluginBrowserReviewDraft();
    r.open("p");
    expect(r.submit()).toBeUndefined();
    expect(r.hasOpen()).toBe(true);
  });

  it("returns undefined when no draft open", () => {
    const r = createPluginBrowserReviewDraft();
    expect(r.submit()).toBeUndefined();
  });
});

describe("createPluginBrowserReviewDraft — cancel", () => {
  it("closes with outcome='canceled' regardless of rating", () => {
    const r = createPluginBrowserReviewDraft();
    r.open("p");
    const closed = r.cancel();
    expect(closed?.outcome).toBe("canceled");
    expect(closed?.rating).toBe(0);
    expect(r.hasOpen()).toBe(false);
  });

  it("returns undefined when no draft open", () => {
    const r = createPluginBrowserReviewDraft();
    expect(r.cancel()).toBeUndefined();
  });
});

describe("createPluginBrowserReviewDraft — close", () => {
  it("force-closes without outcome", () => {
    const r = createPluginBrowserReviewDraft();
    r.open("p");
    expect(r.close()).toBe(true);
    expect(r.hasOpen()).toBe(false);
  });

  it("returns false when no draft open", () => {
    const r = createPluginBrowserReviewDraft();
    expect(r.close()).toBe(false);
  });
});

describe("createPluginBrowserReviewDraft — monotonic ids", () => {
  it("increments across open cycles and silent replacements", () => {
    const r = createPluginBrowserReviewDraft();
    const s1 = r.open("a")!;
    r.cancel();
    const s2 = r.open("b")!;
    const s3 = r.open("c")!; // silent replacement
    expect(s1.id).toBe(1);
    expect(s2.id).toBe(2);
    expect(s3.id).toBe(3);
  });
});

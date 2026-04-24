import { describe, expect, it } from "vitest";
import { createPluginBrowserDragDropStaging } from "../PluginBrowserDragDropStaging.js";

describe("createPluginBrowserDragDropStaging — defaults", () => {
  it("starts empty", () => {
    const s = createPluginBrowserDragDropStaging();
    expect(s.all()).toEqual([]);
    expect(s.count()).toBe(0);
    expect(s.active()).toEqual([]);
    expect(s.byStatus("staged")).toEqual([]);
    expect(s.countByStatus("staged")).toBe(0);
    expect(s.get(1)).toBeUndefined();
    expect(s.findByHash("abc")).toEqual([]);
  });
});

describe("createPluginBrowserDragDropStaging — stage", () => {
  it("stages a valid descriptor with id=1 and status='staged'", () => {
    const s = createPluginBrowserDragDropStaging();
    const e = s.stage("plugin.zip", 1024, "application/zip", "hash1", 1000);
    expect(e?.id).toBe(1);
    expect(e?.filename).toBe("plugin.zip");
    expect(e?.sizeBytes).toBe(1024);
    expect(e?.mimeType).toBe("application/zip");
    expect(e?.contentHash).toBe("hash1");
    expect(e?.stagedAtMs).toBe(1000);
    expect(e?.status).toBe("staged");
    expect(e?.reason).toBeUndefined();
  });

  it("assigns monotonic ids", () => {
    const s = createPluginBrowserDragDropStaging();
    const a = s.stage("a.zip", 1, "application/zip", "ha", 1)!;
    const b = s.stage("b.zip", 2, "application/zip", "hb", 2)!;
    const c = s.stage("c.zip", 3, "application/zip", "hc", 3)!;
    expect(a.id).toBe(1);
    expect(b.id).toBe(2);
    expect(c.id).toBe(3);
  });

  it("does not auto-dedup duplicate hashes", () => {
    const s = createPluginBrowserDragDropStaging();
    s.stage("a.zip", 1, "application/zip", "shared", 1);
    s.stage("b.zip", 2, "application/zip", "shared", 2);
    expect(s.findByHash("shared")).toHaveLength(2);
    expect(s.count()).toBe(2);
  });

  it("accepts sizeBytes=0", () => {
    const s = createPluginBrowserDragDropStaging();
    const e = s.stage("empty.zip", 0, "application/zip", "h", 1);
    expect(e?.sizeBytes).toBe(0);
  });

  it("rejects empty filename / mimeType / contentHash", () => {
    const s = createPluginBrowserDragDropStaging();
    expect(s.stage("", 1, "application/zip", "h", 1)).toBeUndefined();
    expect(s.stage("a.zip", 1, "", "h", 1)).toBeUndefined();
    expect(s.stage("a.zip", 1, "application/zip", "", 1)).toBeUndefined();
    expect(s.count()).toBe(0);
  });

  it("rejects non-finite / negative sizeBytes", () => {
    const s = createPluginBrowserDragDropStaging();
    expect(
      s.stage("a.zip", Number.NaN, "application/zip", "h", 1),
    ).toBeUndefined();
    expect(
      s.stage("a.zip", Number.POSITIVE_INFINITY, "application/zip", "h", 1),
    ).toBeUndefined();
    expect(s.stage("a.zip", -1, "application/zip", "h", 1)).toBeUndefined();
    expect(s.count()).toBe(0);
  });

  it("rejects non-finite stagedAtMs", () => {
    const s = createPluginBrowserDragDropStaging();
    expect(
      s.stage("a.zip", 1, "application/zip", "h", Number.NaN),
    ).toBeUndefined();
    expect(
      s.stage("a.zip", 1, "application/zip", "h", Number.POSITIVE_INFINITY),
    ).toBeUndefined();
    expect(s.count()).toBe(0);
  });
});

describe("createPluginBrowserDragDropStaging — setStatus (lifecycle)", () => {
  it("advances staged → queued → processing → installed", () => {
    const s = createPluginBrowserDragDropStaging();
    const e = s.stage("a.zip", 1, "application/zip", "h", 1)!;
    expect(s.setStatus(e.id, "queued")).toBe(true);
    expect(s.get(e.id)?.status).toBe("queued");
    expect(s.setStatus(e.id, "processing")).toBe(true);
    expect(s.get(e.id)?.status).toBe("processing");
    expect(s.setStatus(e.id, "installed")).toBe(true);
    expect(s.get(e.id)?.status).toBe("installed");
  });

  it("allows staged → rejected with reason", () => {
    const s = createPluginBrowserDragDropStaging();
    const e = s.stage("a.zip", 1, "application/zip", "h", 1)!;
    expect(s.setStatus(e.id, "rejected", "bad signature")).toBe(true);
    const updated = s.get(e.id);
    expect(updated?.status).toBe("rejected");
    expect(updated?.reason).toBe("bad signature");
  });

  it("allows queued → rejected and processing → rejected", () => {
    const s = createPluginBrowserDragDropStaging();
    const a = s.stage("a.zip", 1, "application/zip", "ha", 1)!;
    s.setStatus(a.id, "queued");
    expect(s.setStatus(a.id, "rejected")).toBe(true);

    const b = s.stage("b.zip", 1, "application/zip", "hb", 1)!;
    s.setStatus(b.id, "queued");
    s.setStatus(b.id, "processing");
    expect(s.setStatus(b.id, "rejected")).toBe(true);
  });

  it("rejects skip-ahead transitions (e.g. staged → processing)", () => {
    const s = createPluginBrowserDragDropStaging();
    const e = s.stage("a.zip", 1, "application/zip", "h", 1)!;
    expect(s.setStatus(e.id, "processing")).toBe(false);
    expect(s.setStatus(e.id, "installed")).toBe(false);
    expect(s.get(e.id)?.status).toBe("staged");
  });

  it("rejects backward transitions", () => {
    const s = createPluginBrowserDragDropStaging();
    const e = s.stage("a.zip", 1, "application/zip", "h", 1)!;
    s.setStatus(e.id, "queued");
    expect(s.setStatus(e.id, "staged")).toBe(false);
    expect(s.get(e.id)?.status).toBe("queued");
  });

  it("refuses further transitions once terminal (installed)", () => {
    const s = createPluginBrowserDragDropStaging();
    const e = s.stage("a.zip", 1, "application/zip", "h", 1)!;
    s.setStatus(e.id, "queued");
    s.setStatus(e.id, "processing");
    s.setStatus(e.id, "installed");
    expect(s.setStatus(e.id, "rejected")).toBe(false);
    expect(s.get(e.id)?.status).toBe("installed");
  });

  it("refuses further transitions once terminal (rejected)", () => {
    const s = createPluginBrowserDragDropStaging();
    const e = s.stage("a.zip", 1, "application/zip", "h", 1)!;
    s.setStatus(e.id, "rejected", "corrupt");
    expect(s.setStatus(e.id, "queued")).toBe(false);
    expect(s.setStatus(e.id, "rejected", "other")).toBe(false);
    expect(s.get(e.id)?.status).toBe("rejected");
    expect(s.get(e.id)?.reason).toBe("corrupt");
  });

  it("is idempotent on unchanged status (returns false)", () => {
    const s = createPluginBrowserDragDropStaging();
    const e = s.stage("a.zip", 1, "application/zip", "h", 1)!;
    expect(s.setStatus(e.id, "staged")).toBe(false);
  });

  it("normalizes reason away for non-rejected statuses", () => {
    const s = createPluginBrowserDragDropStaging();
    const e = s.stage("a.zip", 1, "application/zip", "h", 1)!;
    s.setStatus(e.id, "queued", "why?");
    expect(s.get(e.id)?.reason).toBeUndefined();
  });

  it("normalizes empty reason to undefined on rejected", () => {
    const s = createPluginBrowserDragDropStaging();
    const e = s.stage("a.zip", 1, "application/zip", "h", 1)!;
    s.setStatus(e.id, "rejected", "");
    expect(s.get(e.id)?.status).toBe("rejected");
    expect(s.get(e.id)?.reason).toBeUndefined();
  });

  it("rejects unknown id, invalid status, non-finite id", () => {
    const s = createPluginBrowserDragDropStaging();
    expect(s.setStatus(999, "queued")).toBe(false);
    const e = s.stage("a.zip", 1, "application/zip", "h", 1)!;
    expect(s.setStatus(e.id, "bogus" as unknown as "queued")).toBe(false);
    expect(s.setStatus(Number.NaN, "queued")).toBe(false);
  });
});

describe("createPluginBrowserDragDropStaging — get / findByHash", () => {
  it("get rejects non-finite id", () => {
    const s = createPluginBrowserDragDropStaging();
    expect(s.get(Number.NaN)).toBeUndefined();
    expect(s.get(Number.POSITIVE_INFINITY)).toBeUndefined();
  });

  it("findByHash returns insertion order", () => {
    const s = createPluginBrowserDragDropStaging();
    const a = s.stage("a.zip", 1, "application/zip", "shared", 1)!;
    s.stage("mid.zip", 1, "application/zip", "other", 2);
    const b = s.stage("b.zip", 1, "application/zip", "shared", 3)!;
    const results = s.findByHash("shared");
    expect(results.map((r) => r.id)).toEqual([a.id, b.id]);
  });

  it("findByHash rejects empty hash", () => {
    const s = createPluginBrowserDragDropStaging();
    s.stage("a.zip", 1, "application/zip", "h", 1);
    expect(s.findByHash("")).toEqual([]);
  });
});

describe("createPluginBrowserDragDropStaging — remove", () => {
  it("removes an entry by id", () => {
    const s = createPluginBrowserDragDropStaging();
    const e = s.stage("a.zip", 1, "application/zip", "h", 1)!;
    expect(s.remove(e.id)).toBe(true);
    expect(s.get(e.id)).toBeUndefined();
    expect(s.count()).toBe(0);
  });

  it("returns false for unknown id / non-finite id", () => {
    const s = createPluginBrowserDragDropStaging();
    expect(s.remove(999)).toBe(false);
    expect(s.remove(Number.NaN)).toBe(false);
  });

  it("removes terminal entries too", () => {
    const s = createPluginBrowserDragDropStaging();
    const e = s.stage("a.zip", 1, "application/zip", "h", 1)!;
    s.setStatus(e.id, "rejected", "no");
    expect(s.remove(e.id)).toBe(true);
    expect(s.count()).toBe(0);
  });
});

describe("createPluginBrowserDragDropStaging — all / byStatus / active", () => {
  it("all returns insertion order", () => {
    const s = createPluginBrowserDragDropStaging();
    const a = s.stage("a.zip", 1, "application/zip", "ha", 1)!;
    const b = s.stage("b.zip", 1, "application/zip", "hb", 2)!;
    const c = s.stage("c.zip", 1, "application/zip", "hc", 3)!;
    expect(s.all().map((e) => e.id)).toEqual([a.id, b.id, c.id]);
  });

  it("byStatus filters correctly", () => {
    const s = createPluginBrowserDragDropStaging();
    const a = s.stage("a.zip", 1, "application/zip", "ha", 1)!;
    const b = s.stage("b.zip", 1, "application/zip", "hb", 2)!;
    const c = s.stage("c.zip", 1, "application/zip", "hc", 3)!;
    s.setStatus(b.id, "queued");
    s.setStatus(c.id, "queued");
    s.setStatus(c.id, "processing");
    expect(s.byStatus("staged").map((e) => e.id)).toEqual([a.id]);
    expect(s.byStatus("queued").map((e) => e.id)).toEqual([b.id]);
    expect(s.byStatus("processing").map((e) => e.id)).toEqual([c.id]);
    expect(s.byStatus("installed")).toEqual([]);
    expect(s.byStatus("rejected")).toEqual([]);
  });

  it("byStatus rejects invalid status", () => {
    const s = createPluginBrowserDragDropStaging();
    s.stage("a.zip", 1, "application/zip", "h", 1);
    expect(s.byStatus("bogus" as unknown as "staged")).toEqual([]);
  });

  it("active excludes terminal entries", () => {
    const s = createPluginBrowserDragDropStaging();
    const a = s.stage("a.zip", 1, "application/zip", "ha", 1)!;
    const b = s.stage("b.zip", 1, "application/zip", "hb", 2)!;
    const c = s.stage("c.zip", 1, "application/zip", "hc", 3)!;
    const d = s.stage("d.zip", 1, "application/zip", "hd", 4)!;
    s.setStatus(b.id, "queued");
    s.setStatus(c.id, "rejected", "nope");
    s.setStatus(d.id, "queued");
    s.setStatus(d.id, "processing");
    s.setStatus(d.id, "installed");
    expect(s.active().map((e) => e.id)).toEqual([a.id, b.id]);
  });

  it("snapshot isolation — mutating returned array does not affect ledger", () => {
    const s = createPluginBrowserDragDropStaging();
    s.stage("a.zip", 1, "application/zip", "h", 1);
    const snapshot = s.all() as unknown as unknown[];
    snapshot.length = 0;
    expect(s.count()).toBe(1);
  });
});

describe("createPluginBrowserDragDropStaging — count / countByStatus", () => {
  it("count tracks all entries including terminal", () => {
    const s = createPluginBrowserDragDropStaging();
    const a = s.stage("a.zip", 1, "application/zip", "ha", 1)!;
    s.stage("b.zip", 1, "application/zip", "hb", 2);
    s.setStatus(a.id, "rejected", "bad");
    expect(s.count()).toBe(2);
  });

  it("countByStatus counts precisely", () => {
    const s = createPluginBrowserDragDropStaging();
    const a = s.stage("a.zip", 1, "application/zip", "ha", 1)!;
    const b = s.stage("b.zip", 1, "application/zip", "hb", 2)!;
    s.stage("c.zip", 1, "application/zip", "hc", 3);
    s.setStatus(a.id, "queued");
    s.setStatus(b.id, "rejected");
    expect(s.countByStatus("staged")).toBe(1);
    expect(s.countByStatus("queued")).toBe(1);
    expect(s.countByStatus("rejected")).toBe(1);
    expect(s.countByStatus("installed")).toBe(0);
  });

  it("countByStatus returns 0 for invalid status", () => {
    const s = createPluginBrowserDragDropStaging();
    s.stage("a.zip", 1, "application/zip", "h", 1);
    expect(s.countByStatus("bogus" as unknown as "staged")).toBe(0);
  });
});

describe("createPluginBrowserDragDropStaging — clear", () => {
  it("wipes every entry including terminals", () => {
    const s = createPluginBrowserDragDropStaging();
    const a = s.stage("a.zip", 1, "application/zip", "ha", 1)!;
    s.stage("b.zip", 1, "application/zip", "hb", 2);
    s.setStatus(a.id, "rejected", "nope");
    s.clear();
    expect(s.count()).toBe(0);
    expect(s.all()).toEqual([]);
  });

  it("is safe on empty ledger", () => {
    const s = createPluginBrowserDragDropStaging();
    expect(() => s.clear()).not.toThrow();
  });

  it("does not reset id counter (monotonic across clear)", () => {
    const s = createPluginBrowserDragDropStaging();
    const a = s.stage("a.zip", 1, "application/zip", "ha", 1)!;
    s.clear();
    const b = s.stage("b.zip", 1, "application/zip", "hb", 2)!;
    expect(b.id).toBeGreaterThan(a.id);
  });
});

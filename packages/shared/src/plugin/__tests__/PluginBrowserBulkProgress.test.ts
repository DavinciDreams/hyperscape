import { describe, expect, it } from "vitest";
import { createPluginBrowserBulkProgress } from "../PluginBrowserBulkProgress.js";

describe("createPluginBrowserBulkProgress — defaults", () => {
  it("starts empty", () => {
    const b = createPluginBrowserBulkProgress();
    expect(b.batches()).toEqual([]);
    expect(b.activeBatches()).toEqual([]);
    expect(b.getBatch(1)).toBeUndefined();
    expect(b.isComplete(1)).toBe(false);
    expect(b.completion(1)).toBeUndefined();
    expect(b.percentage(1)).toBeUndefined();
  });
});

describe("createPluginBrowserBulkProgress — start", () => {
  it("creates a batch with items in pending state", () => {
    const b = createPluginBrowserBulkProgress();
    const batch = b.start("update", ["a", "b", "c"]);
    expect(batch?.id).toBe(1);
    expect(batch?.kind).toBe("update");
    expect(batch?.items).toEqual([
      { pluginId: "a", status: "pending" },
      { pluginId: "b", status: "pending" },
      { pluginId: "c", status: "pending" },
    ]);
  });

  it("uses monotonic ids across batches", () => {
    const b = createPluginBrowserBulkProgress();
    const b1 = b.start("update", ["a"]);
    const b2 = b.start("remove", ["b"]);
    expect(b2!.id).toBe(b1!.id + 1);
  });

  it("dedups duplicate pluginIds", () => {
    const b = createPluginBrowserBulkProgress();
    const batch = b.start("update", ["a", "b", "a"]);
    expect(batch?.items).toHaveLength(2);
  });

  it("rejects empty kind / empty pluginIds / empty id", () => {
    const b = createPluginBrowserBulkProgress();
    expect(b.start("", ["a"])).toBeUndefined();
    expect(b.start("update", [])).toBeUndefined();
    expect(b.start("update", ["a", ""])).toBeUndefined();
    expect(b.batches()).toEqual([]);
  });
});

describe("createPluginBrowserBulkProgress — setItemStatus", () => {
  it("updates an item's status", () => {
    const b = createPluginBrowserBulkProgress();
    const batch = b.start("update", ["a", "b"])!;
    expect(b.setItemStatus(batch.id, "a", "active")).toBe(true);
    expect(b.getItemStatus(batch.id, "a")).toBe("active");
  });

  it("is idempotent on unchanged", () => {
    const b = createPluginBrowserBulkProgress();
    const batch = b.start("update", ["a"])!;
    b.setItemStatus(batch.id, "a", "active");
    expect(b.setItemStatus(batch.id, "a", "active")).toBe(false);
  });

  it("rejects invalid status / unknown plugin / unknown batch", () => {
    const b = createPluginBrowserBulkProgress();
    const batch = b.start("update", ["a"])!;
    expect(b.setItemStatus(batch.id, "a", "bogus" as unknown as "active")).toBe(
      false,
    );
    expect(b.setItemStatus(batch.id, "nope", "active")).toBe(false);
    expect(b.setItemStatus(999, "a", "active")).toBe(false);
  });

  it("rejects empty pluginId", () => {
    const b = createPluginBrowserBulkProgress();
    const batch = b.start("update", ["a"])!;
    expect(b.setItemStatus(batch.id, "", "active")).toBe(false);
  });
});

describe("createPluginBrowserBulkProgress — completion + isComplete", () => {
  it("counts each state separately", () => {
    const b = createPluginBrowserBulkProgress();
    const batch = b.start("update", ["a", "b", "c", "d", "e"])!;
    b.setItemStatus(batch.id, "a", "succeeded");
    b.setItemStatus(batch.id, "b", "failed");
    b.setItemStatus(batch.id, "c", "canceled");
    b.setItemStatus(batch.id, "d", "active");
    // e stays pending
    const c = b.completion(batch.id)!;
    expect(c).toEqual({
      total: 5,
      pending: 1,
      active: 1,
      succeeded: 1,
      failed: 1,
      canceled: 1,
      terminal: 3,
    });
  });

  it("isComplete only when every item is terminal", () => {
    const b = createPluginBrowserBulkProgress();
    const batch = b.start("update", ["a", "b"])!;
    expect(b.isComplete(batch.id)).toBe(false);
    b.setItemStatus(batch.id, "a", "succeeded");
    expect(b.isComplete(batch.id)).toBe(false);
    b.setItemStatus(batch.id, "b", "failed");
    expect(b.isComplete(batch.id)).toBe(true);
  });

  it("percentage = terminal / total", () => {
    const b = createPluginBrowserBulkProgress();
    const batch = b.start("update", ["a", "b", "c", "d"])!;
    b.setItemStatus(batch.id, "a", "succeeded");
    b.setItemStatus(batch.id, "b", "failed");
    expect(b.percentage(batch.id)).toBeCloseTo(0.5);
  });
});

describe("createPluginBrowserBulkProgress — remove", () => {
  it("refuses to remove non-complete batches", () => {
    const b = createPluginBrowserBulkProgress();
    const batch = b.start("update", ["a", "b"])!;
    b.setItemStatus(batch.id, "a", "succeeded");
    expect(b.remove(batch.id)).toBe(false);
    expect(b.getBatch(batch.id)).toBeDefined();
  });

  it("removes complete batches", () => {
    const b = createPluginBrowserBulkProgress();
    const batch = b.start("update", ["a"])!;
    b.setItemStatus(batch.id, "a", "succeeded");
    expect(b.remove(batch.id)).toBe(true);
    expect(b.getBatch(batch.id)).toBeUndefined();
  });

  it("unknown batch returns false", () => {
    const b = createPluginBrowserBulkProgress();
    expect(b.remove(999)).toBe(false);
  });
});

describe("createPluginBrowserBulkProgress — batches / activeBatches", () => {
  it("activeBatches excludes complete ones", () => {
    const b = createPluginBrowserBulkProgress();
    const a = b.start("update", ["a"])!;
    const b2 = b.start("update", ["b"])!;
    b.setItemStatus(a.id, "a", "succeeded");
    const active = b.activeBatches();
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe(b2.id);
  });

  it("batches preserves insertion order", () => {
    const b = createPluginBrowserBulkProgress();
    const x = b.start("update", ["x"])!;
    const y = b.start("update", ["y"])!;
    const z = b.start("update", ["z"])!;
    expect(b.batches().map((b) => b.id)).toEqual([x.id, y.id, z.id]);
  });
});

describe("createPluginBrowserBulkProgress — clear", () => {
  it("wipes all batches including non-complete", () => {
    const b = createPluginBrowserBulkProgress();
    b.start("update", ["a"]);
    b.start("update", ["b"]);
    b.clear();
    expect(b.batches()).toEqual([]);
  });
});

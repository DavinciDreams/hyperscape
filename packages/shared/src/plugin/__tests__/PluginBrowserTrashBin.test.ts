import { describe, expect, it } from "vitest";
import { createPluginBrowserTrashBin } from "../PluginBrowserTrashBin.js";

interface Snap {
  version: string;
  settings?: Record<string, unknown>;
}

describe("createPluginBrowserTrashBin — defaults", () => {
  it("starts empty with default capacity 20", () => {
    const t = createPluginBrowserTrashBin<Snap>();
    expect(t.capacity()).toBe(20);
    expect(t.size()).toBe(0);
    expect(t.isEmpty()).toBe(true);
    expect(t.entries()).toEqual([]);
  });

  it("accepts a custom capacity", () => {
    const t = createPluginBrowserTrashBin<Snap>(5);
    expect(t.capacity()).toBe(5);
  });

  it("falls back to 20 on invalid capacity", () => {
    expect(createPluginBrowserTrashBin<Snap>(0).capacity()).toBe(20);
    expect(createPluginBrowserTrashBin<Snap>(-1).capacity()).toBe(20);
    expect(createPluginBrowserTrashBin<Snap>(Number.NaN).capacity()).toBe(20);
    expect(
      createPluginBrowserTrashBin<Snap>(Number.POSITIVE_INFINITY).capacity(),
    ).toBe(20);
  });

  it("floors fractional capacity", () => {
    expect(createPluginBrowserTrashBin<Snap>(5.7).capacity()).toBe(5);
  });
});

describe("createPluginBrowserTrashBin — push", () => {
  it("records entries with monotonic ids", () => {
    const t = createPluginBrowserTrashBin<Snap>();
    const a = t.push("a", { version: "1.0" }, 100);
    const b = t.push("b", { version: "2.0" }, 101);
    expect(a?.id).toBe(1);
    expect(b?.id).toBe(2);
    expect(t.size()).toBe(2);
  });

  it("rejects empty id", () => {
    const t = createPluginBrowserTrashBin<Snap>();
    expect(t.push("", { version: "1" }, 0)).toBeUndefined();
    expect(t.size()).toBe(0);
  });

  it("rejects non-finite timestamp", () => {
    const t = createPluginBrowserTrashBin<Snap>();
    expect(t.push("a", { version: "1" }, Number.NaN)).toBeUndefined();
    expect(
      t.push("a", { version: "1" }, Number.POSITIVE_INFINITY),
    ).toBeUndefined();
  });

  it("evicts oldest when at capacity", () => {
    const t = createPluginBrowserTrashBin<Snap>(3);
    t.push("a", { version: "1" }, 1);
    t.push("b", { version: "2" }, 2);
    t.push("c", { version: "3" }, 3);
    t.push("d", { version: "4" }, 4);
    expect(t.size()).toBe(3);
    expect(t.findForPlugin("a")).toEqual([]);
    expect(t.entries().map((e) => e.pluginId)).toEqual(["b", "c", "d"]);
  });
});

describe("createPluginBrowserTrashBin — lookup", () => {
  it("get / hasId by id", () => {
    const t = createPluginBrowserTrashBin<Snap>();
    const a = t.push("a", { version: "1" }, 100);
    expect(t.get(a!.id)).toEqual(a);
    expect(t.hasId(a!.id)).toBe(true);
    expect(t.hasId(999)).toBe(false);
    expect(t.get(999)).toBeUndefined();
  });

  it("findForPlugin returns all entries for a plugin", () => {
    const t = createPluginBrowserTrashBin<Snap>();
    t.push("a", { version: "1" }, 1);
    t.push("b", { version: "1" }, 2);
    t.push("a", { version: "2" }, 3);
    const matches = t.findForPlugin("a");
    expect(matches).toHaveLength(2);
    expect(matches.map((e) => e.snapshot.version)).toEqual(["1", "2"]);
  });

  it("findLatestForPlugin returns most recent", () => {
    const t = createPluginBrowserTrashBin<Snap>();
    t.push("a", { version: "1" }, 1);
    t.push("a", { version: "2" }, 2);
    expect(t.findLatestForPlugin("a")?.snapshot.version).toBe("2");
  });

  it("find* on unknown/empty returns empty/undefined", () => {
    const t = createPluginBrowserTrashBin<Snap>();
    expect(t.findForPlugin("x")).toEqual([]);
    expect(t.findForPlugin("")).toEqual([]);
    expect(t.findLatestForPlugin("x")).toBeUndefined();
    expect(t.findLatestForPlugin("")).toBeUndefined();
  });
});

describe("createPluginBrowserTrashBin — restore + remove", () => {
  it("restore returns + removes entry", () => {
    const t = createPluginBrowserTrashBin<Snap>();
    const a = t.push("a", { version: "1" }, 1);
    const restored = t.restore(a!.id);
    expect(restored).toEqual(a);
    expect(t.hasId(a!.id)).toBe(false);
    expect(t.size()).toBe(0);
  });

  it("restore unknown id returns undefined", () => {
    const t = createPluginBrowserTrashBin<Snap>();
    expect(t.restore(999)).toBeUndefined();
  });

  it("remove returns boolean", () => {
    const t = createPluginBrowserTrashBin<Snap>();
    const a = t.push("a", { version: "1" }, 1);
    expect(t.remove(a!.id)).toBe(true);
    expect(t.remove(a!.id)).toBe(false);
  });
});

describe("createPluginBrowserTrashBin — expire", () => {
  it("drops entries older than cutoff", () => {
    const t = createPluginBrowserTrashBin<Snap>();
    t.push("a", { version: "1" }, 100);
    t.push("b", { version: "2" }, 200);
    t.push("c", { version: "3" }, 300);
    // nowMs = 500; olderThanMs = 250 → keep entries with (500 - ts) < 250 → ts > 250
    const removed = t.expire(250, 500);
    expect(removed).toBe(2);
    expect(t.entries().map((e) => e.pluginId)).toEqual(["c"]);
  });

  it("keeps entries exactly at boundary (>=)", () => {
    const t = createPluginBrowserTrashBin<Snap>();
    t.push("a", { version: "1" }, 100);
    // nowMs = 200; olderThanMs = 100 → (200 - 100) = 100 >= 100 → evict
    expect(t.expire(100, 200)).toBe(1);
  });

  it("returns 0 on invalid input", () => {
    const t = createPluginBrowserTrashBin<Snap>();
    t.push("a", { version: "1" }, 100);
    expect(t.expire(-1, 200)).toBe(0);
    expect(t.expire(Number.NaN, 200)).toBe(0);
    expect(t.expire(100, Number.NaN)).toBe(0);
    expect(t.size()).toBe(1);
  });

  it("returns 0 when nothing expires", () => {
    const t = createPluginBrowserTrashBin<Snap>();
    t.push("a", { version: "1" }, 1000);
    expect(t.expire(500, 1100)).toBe(0);
  });
});

describe("createPluginBrowserTrashBin — clear + entries", () => {
  it("entries preserves insertion order", () => {
    const t = createPluginBrowserTrashBin<Snap>();
    t.push("c", { version: "1" }, 1);
    t.push("a", { version: "2" }, 2);
    t.push("b", { version: "3" }, 3);
    expect(t.entries().map((e) => e.pluginId)).toEqual(["c", "a", "b"]);
  });

  it("clear wipes everything", () => {
    const t = createPluginBrowserTrashBin<Snap>();
    t.push("a", { version: "1" }, 1);
    t.push("b", { version: "2" }, 2);
    expect(t.clear()).toBe(true);
    expect(t.size()).toBe(0);
  });

  it("clear on empty returns false", () => {
    const t = createPluginBrowserTrashBin<Snap>();
    expect(t.clear()).toBe(false);
  });

  it("ids continue monotonically after clear", () => {
    const t = createPluginBrowserTrashBin<Snap>();
    const a = t.push("a", { version: "1" }, 1);
    t.clear();
    const b = t.push("b", { version: "2" }, 2);
    expect(b!.id).toBe(a!.id + 1);
  });
});

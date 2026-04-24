import { describe, expect, it } from "vitest";
import { createPluginBrowserColumnOrder } from "../PluginBrowserColumnOrder.js";

const COLS = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }] as const;

describe("createPluginBrowserColumnOrder — authored baseline", () => {
  it("defaults to authored order", () => {
    const o = createPluginBrowserColumnOrder({ columns: COLS });
    expect(o.orderedIds()).toEqual(["a", "b", "c", "d"]);
    expect(o.authoredIds()).toEqual(["a", "b", "c", "d"]);
  });

  it("dedupes duplicates (first wins)", () => {
    const o = createPluginBrowserColumnOrder({
      columns: [{ id: "a" }, { id: "b" }, { id: "a" }, { id: "c" }],
    });
    expect(o.authoredIds()).toEqual(["a", "b", "c"]);
  });

  it("drops empty id entries", () => {
    const o = createPluginBrowserColumnOrder({
      columns: [{ id: "a" }, { id: "" }, { id: "b" }],
    });
    expect(o.authoredIds()).toEqual(["a", "b"]);
  });
});

describe("createPluginBrowserColumnOrder — initialOrder", () => {
  it("honors a persisted override", () => {
    const o = createPluginBrowserColumnOrder({
      columns: COLS,
      initialOrder: ["c", "a", "b", "d"],
    });
    expect(o.orderedIds()).toEqual(["c", "a", "b", "d"]);
  });

  it("appends missing authored ids in authored order", () => {
    const o = createPluginBrowserColumnOrder({
      columns: COLS,
      initialOrder: ["c", "a"],
    });
    expect(o.orderedIds()).toEqual(["c", "a", "b", "d"]);
  });

  it("ignores unknown ids in override", () => {
    const o = createPluginBrowserColumnOrder({
      columns: COLS,
      initialOrder: ["c", "zzz", "a"],
    });
    expect(o.orderedIds()).toEqual(["c", "a", "b", "d"]);
  });

  it("dedupes the override", () => {
    const o = createPluginBrowserColumnOrder({
      columns: COLS,
      initialOrder: ["c", "a", "c", "b"],
    });
    expect(o.orderedIds()).toEqual(["c", "a", "b", "d"]);
  });

  it("empty override falls back to authored order", () => {
    const o = createPluginBrowserColumnOrder({
      columns: COLS,
      initialOrder: [],
    });
    expect(o.orderedIds()).toEqual(["a", "b", "c", "d"]);
  });
});

describe("createPluginBrowserColumnOrder — indexOf", () => {
  it("returns the current position", () => {
    const o = createPluginBrowserColumnOrder({ columns: COLS });
    expect(o.indexOf("a")).toBe(0);
    expect(o.indexOf("d")).toBe(3);
  });

  it("returns -1 for unknown ids", () => {
    const o = createPluginBrowserColumnOrder({ columns: COLS });
    expect(o.indexOf("zzz")).toBe(-1);
  });

  it("returns -1 for empty id", () => {
    const o = createPluginBrowserColumnOrder({ columns: COLS });
    expect(o.indexOf("")).toBe(-1);
  });
});

describe("createPluginBrowserColumnOrder — move", () => {
  it("moves forward", () => {
    const o = createPluginBrowserColumnOrder({ columns: COLS });
    o.move("a", 2);
    expect(o.orderedIds()).toEqual(["b", "c", "a", "d"]);
  });

  it("moves backward", () => {
    const o = createPluginBrowserColumnOrder({ columns: COLS });
    o.move("d", 0);
    expect(o.orderedIds()).toEqual(["d", "a", "b", "c"]);
  });

  it("clamps negative index to 0", () => {
    const o = createPluginBrowserColumnOrder({ columns: COLS });
    o.move("c", -5);
    expect(o.orderedIds()).toEqual(["c", "a", "b", "d"]);
  });

  it("clamps index past end to last slot", () => {
    const o = createPluginBrowserColumnOrder({ columns: COLS });
    o.move("a", 99);
    expect(o.orderedIds()).toEqual(["b", "c", "d", "a"]);
  });

  it("is a no-op when newIndex equals current index", () => {
    const o = createPluginBrowserColumnOrder({ columns: COLS });
    o.move("b", 1);
    expect(o.orderedIds()).toEqual(["a", "b", "c", "d"]);
  });

  it("is a no-op on unknown id", () => {
    const o = createPluginBrowserColumnOrder({ columns: COLS });
    o.move("zzz", 0);
    expect(o.orderedIds()).toEqual(["a", "b", "c", "d"]);
  });

  it("is a no-op on empty id", () => {
    const o = createPluginBrowserColumnOrder({ columns: COLS });
    o.move("", 0);
    expect(o.orderedIds()).toEqual(["a", "b", "c", "d"]);
  });

  it("truncates fractional indices", () => {
    const o = createPluginBrowserColumnOrder({ columns: COLS });
    o.move("a", 2.7);
    expect(o.orderedIds()).toEqual(["b", "c", "a", "d"]);
  });

  it("handles non-finite index as 0", () => {
    const o = createPluginBrowserColumnOrder({ columns: COLS });
    o.move("d", Number.NaN);
    expect(o.orderedIds()).toEqual(["d", "a", "b", "c"]);
  });
});

describe("createPluginBrowserColumnOrder — moveUp / moveDown", () => {
  it("moveUp swaps with previous", () => {
    const o = createPluginBrowserColumnOrder({ columns: COLS });
    o.moveUp("c");
    expect(o.orderedIds()).toEqual(["a", "c", "b", "d"]);
  });

  it("moveUp is a no-op on first column", () => {
    const o = createPluginBrowserColumnOrder({ columns: COLS });
    o.moveUp("a");
    expect(o.orderedIds()).toEqual(["a", "b", "c", "d"]);
  });

  it("moveUp is a no-op on unknown id", () => {
    const o = createPluginBrowserColumnOrder({ columns: COLS });
    o.moveUp("zzz");
    expect(o.orderedIds()).toEqual(["a", "b", "c", "d"]);
  });

  it("moveDown swaps with next", () => {
    const o = createPluginBrowserColumnOrder({ columns: COLS });
    o.moveDown("b");
    expect(o.orderedIds()).toEqual(["a", "c", "b", "d"]);
  });

  it("moveDown is a no-op on last column", () => {
    const o = createPluginBrowserColumnOrder({ columns: COLS });
    o.moveDown("d");
    expect(o.orderedIds()).toEqual(["a", "b", "c", "d"]);
  });

  it("moveDown is a no-op on unknown id", () => {
    const o = createPluginBrowserColumnOrder({ columns: COLS });
    o.moveDown("zzz");
    expect(o.orderedIds()).toEqual(["a", "b", "c", "d"]);
  });
});

describe("createPluginBrowserColumnOrder — reset", () => {
  it("restores authored order after moves", () => {
    const o = createPluginBrowserColumnOrder({ columns: COLS });
    o.move("a", 3);
    o.move("d", 0);
    o.reset();
    expect(o.orderedIds()).toEqual(["a", "b", "c", "d"]);
  });

  it("restores authored order after initialOrder override", () => {
    const o = createPluginBrowserColumnOrder({
      columns: COLS,
      initialOrder: ["c", "a"],
    });
    o.reset();
    expect(o.orderedIds()).toEqual(["a", "b", "c", "d"]);
  });
});

describe("createPluginBrowserColumnOrder — orderedIds isolation", () => {
  it("returned slice does not mutate internal state", () => {
    const o = createPluginBrowserColumnOrder({ columns: COLS });
    const snap = o.orderedIds() as string[];
    snap.reverse();
    expect(o.orderedIds()).toEqual(["a", "b", "c", "d"]);
  });
});

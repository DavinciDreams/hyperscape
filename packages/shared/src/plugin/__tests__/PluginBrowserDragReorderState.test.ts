import { describe, expect, it } from "vitest";
import { createPluginBrowserDragReorderState } from "../PluginBrowserDragReorderState.js";

describe("createPluginBrowserDragReorderState — defaults", () => {
  it("starts idle", () => {
    const d = createPluginBrowserDragReorderState();
    expect(d.isDragging()).toBe(false);
    expect(d.source()).toBeUndefined();
    expect(d.over()).toBeUndefined();
    expect(d.startedAtMs()).toBeUndefined();
    expect(d.snapshot()).toEqual({
      isDragging: false,
      source: undefined,
      over: undefined,
      startedAtMs: undefined,
    });
  });
});

describe("createPluginBrowserDragReorderState — beginDrag", () => {
  it("opens a gesture on valid input", () => {
    const d = createPluginBrowserDragReorderState();
    expect(d.beginDrag(2, 100)).toBe(true);
    expect(d.isDragging()).toBe(true);
    expect(d.source()).toBe(2);
    expect(d.startedAtMs()).toBe(100);
  });

  it("rejects negative index", () => {
    const d = createPluginBrowserDragReorderState();
    expect(d.beginDrag(-1, 100)).toBe(false);
    expect(d.isDragging()).toBe(false);
  });

  it("rejects non-integer index", () => {
    const d = createPluginBrowserDragReorderState();
    expect(d.beginDrag(1.5, 100)).toBe(false);
  });

  it("rejects non-finite index", () => {
    const d = createPluginBrowserDragReorderState();
    expect(d.beginDrag(Number.NaN, 100)).toBe(false);
    expect(d.beginDrag(Number.POSITIVE_INFINITY, 100)).toBe(false);
  });

  it("rejects non-finite nowMs", () => {
    const d = createPluginBrowserDragReorderState();
    expect(d.beginDrag(0, Number.NaN)).toBe(false);
    expect(d.beginDrag(0, Number.POSITIVE_INFINITY)).toBe(false);
  });

  it("replaces an existing gesture", () => {
    const d = createPluginBrowserDragReorderState();
    d.beginDrag(1, 10);
    d.moveOver(3);
    expect(d.beginDrag(5, 200)).toBe(true);
    expect(d.source()).toBe(5);
    expect(d.over()).toBeUndefined();
    expect(d.startedAtMs()).toBe(200);
  });
});

describe("createPluginBrowserDragReorderState — moveOver", () => {
  it("sets the drop target", () => {
    const d = createPluginBrowserDragReorderState();
    d.beginDrag(0, 1);
    expect(d.moveOver(3)).toBe(true);
    expect(d.over()).toBe(3);
  });

  it("no-op when same index", () => {
    const d = createPluginBrowserDragReorderState();
    d.beginDrag(0, 1);
    d.moveOver(3);
    expect(d.moveOver(3)).toBe(false);
  });

  it("no-op when no gesture open", () => {
    const d = createPluginBrowserDragReorderState();
    expect(d.moveOver(3)).toBe(false);
  });

  it("clears drop target on invalid index", () => {
    const d = createPluginBrowserDragReorderState();
    d.beginDrag(0, 1);
    d.moveOver(3);
    expect(d.moveOver(-1)).toBe(true);
    expect(d.over()).toBeUndefined();
  });

  it("noop when already cleared + invalid incoming", () => {
    const d = createPluginBrowserDragReorderState();
    d.beginDrag(0, 1);
    expect(d.moveOver(-1)).toBe(false);
    expect(d.moveOver(Number.NaN)).toBe(false);
  });
});

describe("createPluginBrowserDragReorderState — commit", () => {
  it("returns {from,to} on valid drop", () => {
    const d = createPluginBrowserDragReorderState();
    d.beginDrag(0, 1);
    d.moveOver(3);
    expect(d.commit()).toEqual({ from: 0, to: 3 });
    expect(d.isDragging()).toBe(false);
    expect(d.source()).toBeUndefined();
    expect(d.over()).toBeUndefined();
  });

  it("returns undefined when no drop target set", () => {
    const d = createPluginBrowserDragReorderState();
    d.beginDrag(0, 1);
    expect(d.commit()).toBeUndefined();
    expect(d.isDragging()).toBe(false);
  });

  it("returns undefined on identity drop (from === to)", () => {
    const d = createPluginBrowserDragReorderState();
    d.beginDrag(2, 1);
    d.moveOver(2);
    expect(d.commit()).toBeUndefined();
    expect(d.isDragging()).toBe(false);
  });

  it("returns undefined when no gesture", () => {
    const d = createPluginBrowserDragReorderState();
    expect(d.commit()).toBeUndefined();
  });
});

describe("createPluginBrowserDragReorderState — cancel", () => {
  it("aborts and returns true when gesture was open", () => {
    const d = createPluginBrowserDragReorderState();
    d.beginDrag(0, 1);
    d.moveOver(2);
    expect(d.cancel()).toBe(true);
    expect(d.isDragging()).toBe(false);
    expect(d.source()).toBeUndefined();
    expect(d.over()).toBeUndefined();
    expect(d.startedAtMs()).toBeUndefined();
  });

  it("returns false when no gesture", () => {
    const d = createPluginBrowserDragReorderState();
    expect(d.cancel()).toBe(false);
  });
});

describe("createPluginBrowserDragReorderState — snapshot", () => {
  it("reflects active gesture", () => {
    const d = createPluginBrowserDragReorderState();
    d.beginDrag(1, 77);
    d.moveOver(4);
    expect(d.snapshot()).toEqual({
      isDragging: true,
      source: 1,
      over: 4,
      startedAtMs: 77,
    });
  });

  it("reflects cleared state after commit", () => {
    const d = createPluginBrowserDragReorderState();
    d.beginDrag(0, 10);
    d.moveOver(2);
    d.commit();
    expect(d.snapshot()).toEqual({
      isDragging: false,
      source: undefined,
      over: undefined,
      startedAtMs: undefined,
    });
  });
});

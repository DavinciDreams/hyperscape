import { describe, expect, it } from "vitest";
import { createPluginBrowserContextMenu } from "../PluginBrowserContextMenuTarget.js";

describe("createPluginBrowserContextMenu — defaults", () => {
  it("starts closed", () => {
    const m = createPluginBrowserContextMenu();
    expect(m.isOpen()).toBe(false);
    expect(m.target()).toBeUndefined();
    expect(m.position()).toBeUndefined();
  });

  it("snapshot reflects closed state", () => {
    const m = createPluginBrowserContextMenu();
    expect(m.snapshot()).toEqual({
      isOpen: false,
      target: undefined,
      position: undefined,
    });
  });
});

describe("createPluginBrowserContextMenu — open row", () => {
  it("opens at a row target", () => {
    const m = createPluginBrowserContextMenu();
    const ok = m.open({ kind: "row", pluginId: "hello" }, { xPx: 10, yPx: 20 });
    expect(ok).toBe(true);
    expect(m.isOpen()).toBe(true);
    expect(m.target()).toEqual({
      kind: "row",
      pluginId: "hello",
    });
    expect(m.position()).toEqual({ xPx: 10, yPx: 20 });
  });

  it("rejects empty pluginId", () => {
    const m = createPluginBrowserContextMenu();
    const ok = m.open({ kind: "row", pluginId: "" }, { xPx: 10, yPx: 20 });
    expect(ok).toBe(false);
    expect(m.isOpen()).toBe(false);
  });
});

describe("createPluginBrowserContextMenu — open header", () => {
  it("opens at a header target", () => {
    const m = createPluginBrowserContextMenu();
    const ok = m.open(
      { kind: "header", columnId: "name" },
      { xPx: 50, yPx: 0 },
    );
    expect(ok).toBe(true);
    expect(m.target()).toEqual({
      kind: "header",
      columnId: "name",
    });
  });

  it("rejects empty columnId", () => {
    const m = createPluginBrowserContextMenu();
    const ok = m.open({ kind: "header", columnId: "" }, { xPx: 0, yPx: 0 });
    expect(ok).toBe(false);
  });
});

describe("createPluginBrowserContextMenu — open blank", () => {
  it("opens on blank space without target id", () => {
    const m = createPluginBrowserContextMenu();
    const ok = m.open({ kind: "blank" }, { xPx: 100, yPx: 200 });
    expect(ok).toBe(true);
    expect(m.target()).toEqual({ kind: "blank" });
  });
});

describe("createPluginBrowserContextMenu — open sidebar", () => {
  it("opens on a sidebar section", () => {
    const m = createPluginBrowserContextMenu();
    const ok = m.open(
      { kind: "sidebar", sectionId: "recent" },
      { xPx: 5, yPx: 5 },
    );
    expect(ok).toBe(true);
    expect(m.target()).toEqual({
      kind: "sidebar",
      sectionId: "recent",
    });
  });

  it("rejects empty sectionId", () => {
    const m = createPluginBrowserContextMenu();
    const ok = m.open({ kind: "sidebar", sectionId: "" }, { xPx: 0, yPx: 0 });
    expect(ok).toBe(false);
  });
});

describe("createPluginBrowserContextMenu — invalid position", () => {
  it("rejects NaN x", () => {
    const m = createPluginBrowserContextMenu();
    const ok = m.open({ kind: "blank" }, { xPx: Number.NaN, yPx: 0 });
    expect(ok).toBe(false);
    expect(m.isOpen()).toBe(false);
  });

  it("rejects Infinity y", () => {
    const m = createPluginBrowserContextMenu();
    const ok = m.open(
      { kind: "blank" },
      { xPx: 0, yPx: Number.POSITIVE_INFINITY },
    );
    expect(ok).toBe(false);
  });

  it("closes an open menu when replacement is invalid", () => {
    const m = createPluginBrowserContextMenu();
    m.open({ kind: "row", pluginId: "a" }, { xPx: 1, yPx: 1 });
    m.open({ kind: "row", pluginId: "" }, { xPx: 2, yPx: 2 });
    expect(m.isOpen()).toBe(false);
  });

  it("closes on unknown kind", () => {
    const m = createPluginBrowserContextMenu();
    m.open({ kind: "row", pluginId: "a" }, { xPx: 1, yPx: 1 });
    m.open({ kind: "mystery" as unknown as "blank" }, { xPx: 2, yPx: 2 });
    expect(m.isOpen()).toBe(false);
  });
});

describe("createPluginBrowserContextMenu — open replaces open", () => {
  it("replaces existing target on second open", () => {
    const m = createPluginBrowserContextMenu();
    m.open({ kind: "row", pluginId: "a" }, { xPx: 10, yPx: 10 });
    m.open({ kind: "row", pluginId: "b" }, { xPx: 99, yPx: 50 });
    expect(m.target()).toEqual({ kind: "row", pluginId: "b" });
    expect(m.position()).toEqual({ xPx: 99, yPx: 50 });
  });
});

describe("createPluginBrowserContextMenu — close", () => {
  it("closes an open menu and returns true", () => {
    const m = createPluginBrowserContextMenu();
    m.open({ kind: "row", pluginId: "a" }, { xPx: 0, yPx: 0 });
    expect(m.close()).toBe(true);
    expect(m.isOpen()).toBe(false);
    expect(m.target()).toBeUndefined();
    expect(m.position()).toBeUndefined();
  });

  it("is a no-op on already-closed menu, returns false", () => {
    const m = createPluginBrowserContextMenu();
    expect(m.close()).toBe(false);
  });
});

describe("createPluginBrowserContextMenu — snapshot isolation", () => {
  it("snapshot position is a fresh object", () => {
    const m = createPluginBrowserContextMenu();
    m.open({ kind: "blank" }, { xPx: 10, yPx: 20 });
    const snap = m.snapshot();
    if (snap.position) {
      (snap.position as PluginBrowserContextMenuPositionWritable).xPx = 999;
    }
    expect(m.position()).toEqual({ xPx: 10, yPx: 20 });
  });
});

type PluginBrowserContextMenuPositionWritable = {
  xPx: number;
  yPx: number;
};

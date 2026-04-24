import { describe, expect, it } from "vitest";
import { createPluginBrowserNotes } from "../PluginBrowserNotes.js";

describe("createPluginBrowserNotes — defaults", () => {
  it("starts empty", () => {
    const n = createPluginBrowserNotes();
    expect(n.getNote("a")).toBeUndefined();
    expect(n.hasNote("a")).toBe(false);
    expect(n.pluginsWithNotes()).toEqual([]);
    expect(n.noteCount()).toBe(0);
    expect(n.entries()).toEqual([]);
  });
});

describe("createPluginBrowserNotes — setNote", () => {
  it("stores a note", () => {
    const n = createPluginBrowserNotes();
    expect(n.setNote("a", "hello")).toBe(true);
    expect(n.getNote("a")).toBe("hello");
    expect(n.hasNote("a")).toBe(true);
  });

  it("is idempotent on same text", () => {
    const n = createPluginBrowserNotes();
    n.setNote("a", "hello");
    expect(n.setNote("a", "hello")).toBe(false);
  });

  it("overwrites on different text", () => {
    const n = createPluginBrowserNotes();
    n.setNote("a", "hello");
    expect(n.setNote("a", "world")).toBe(true);
    expect(n.getNote("a")).toBe("world");
  });

  it("empty string clears existing note", () => {
    const n = createPluginBrowserNotes();
    n.setNote("a", "hello");
    expect(n.setNote("a", "")).toBe(true);
    expect(n.hasNote("a")).toBe(false);
  });

  it("empty string on no-note returns false", () => {
    const n = createPluginBrowserNotes();
    expect(n.setNote("a", "")).toBe(false);
  });

  it("rejects empty id", () => {
    const n = createPluginBrowserNotes();
    expect(n.setNote("", "hello")).toBe(false);
    expect(n.pluginsWithNotes()).toEqual([]);
  });

  it("rejects non-string note", () => {
    const n = createPluginBrowserNotes();
    expect(n.setNote("a", 42 as unknown as string)).toBe(false);
  });

  it("accepts whitespace-only note (treated as content)", () => {
    const n = createPluginBrowserNotes();
    expect(n.setNote("a", "   ")).toBe(true);
    expect(n.getNote("a")).toBe("   ");
  });
});

describe("createPluginBrowserNotes — clearNote", () => {
  it("removes an existing note", () => {
    const n = createPluginBrowserNotes();
    n.setNote("a", "hello");
    expect(n.clearNote("a")).toBe(true);
    expect(n.hasNote("a")).toBe(false);
  });

  it("returns false when no note", () => {
    const n = createPluginBrowserNotes();
    expect(n.clearNote("a")).toBe(false);
  });

  it("rejects empty id", () => {
    const n = createPluginBrowserNotes();
    expect(n.clearNote("")).toBe(false);
  });
});

describe("createPluginBrowserNotes — projection", () => {
  it("preserves insertion order", () => {
    const n = createPluginBrowserNotes();
    n.setNote("c", "c-note");
    n.setNote("a", "a-note");
    n.setNote("b", "b-note");
    expect(n.pluginsWithNotes()).toEqual(["c", "a", "b"]);
  });

  it("entries snapshots in insertion order", () => {
    const n = createPluginBrowserNotes();
    n.setNote("a", "a-note");
    n.setNote("b", "b-note");
    expect(n.entries()).toEqual([
      { pluginId: "a", note: "a-note" },
      { pluginId: "b", note: "b-note" },
    ]);
  });

  it("getNote on unknown returns undefined", () => {
    const n = createPluginBrowserNotes();
    expect(n.getNote("nope")).toBeUndefined();
  });

  it("getNote on empty id returns undefined", () => {
    const n = createPluginBrowserNotes();
    expect(n.getNote("")).toBeUndefined();
  });

  it("hasNote on empty id is false", () => {
    const n = createPluginBrowserNotes();
    expect(n.hasNote("")).toBe(false);
  });
});

describe("createPluginBrowserNotes — clearAll", () => {
  it("clears every note", () => {
    const n = createPluginBrowserNotes();
    n.setNote("a", "x");
    n.setNote("b", "y");
    expect(n.clearAll()).toBe(true);
    expect(n.noteCount()).toBe(0);
  });

  it("returns false when empty", () => {
    const n = createPluginBrowserNotes();
    expect(n.clearAll()).toBe(false);
  });
});

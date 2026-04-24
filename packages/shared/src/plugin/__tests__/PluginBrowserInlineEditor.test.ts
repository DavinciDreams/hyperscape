import { describe, expect, it } from "vitest";
import { createPluginBrowserInlineEditor } from "../PluginBrowserInlineEditor.js";

describe("createPluginBrowserInlineEditor — defaults", () => {
  it("starts closed", () => {
    const e = createPluginBrowserInlineEditor<number>();
    expect(e.isOpen()).toBe(false);
    expect(e.current()).toBeUndefined();
    expect(e.isEditing("a", "port")).toBe(false);
  });
});

describe("createPluginBrowserInlineEditor — open", () => {
  it("opens an editor with initial draft", () => {
    const e = createPluginBrowserInlineEditor<number>();
    expect(e.open("a", "port", 8080)).toBe(true);
    expect(e.isOpen()).toBe(true);
    expect(e.current()).toEqual({
      pluginId: "a",
      fieldPath: "port",
      draft: 8080,
    });
    expect(e.isEditing("a", "port")).toBe(true);
  });

  it("rejects empty pluginId / fieldPath", () => {
    const e = createPluginBrowserInlineEditor<number>();
    expect(e.open("", "port", 1)).toBe(false);
    expect(e.open("a", "", 1)).toBe(false);
    expect(e.isOpen()).toBe(false);
  });

  it("opening a second editor silently replaces the first", () => {
    const e = createPluginBrowserInlineEditor<number>();
    e.open("a", "port", 1);
    e.open("b", "host", 2);
    expect(e.current()).toEqual({
      pluginId: "b",
      fieldPath: "host",
      draft: 2,
    });
    expect(e.isEditing("a", "port")).toBe(false);
  });

  it("preserves existing session when open is rejected", () => {
    const e = createPluginBrowserInlineEditor<number>();
    e.open("a", "port", 1);
    e.open("", "x", 999);
    expect(e.current()).toEqual({
      pluginId: "a",
      fieldPath: "port",
      draft: 1,
    });
  });
});

describe("createPluginBrowserInlineEditor — setDraft", () => {
  it("updates the draft when open", () => {
    const e = createPluginBrowserInlineEditor<number>();
    e.open("a", "port", 1);
    expect(e.setDraft(42)).toBe(true);
    expect(e.current()?.draft).toBe(42);
  });

  it("is idempotent when value is unchanged", () => {
    const e = createPluginBrowserInlineEditor<number>();
    e.open("a", "port", 1);
    expect(e.setDraft(1)).toBe(false);
  });

  it("returns false when no editor is open", () => {
    const e = createPluginBrowserInlineEditor<number>();
    expect(e.setDraft(1)).toBe(false);
  });

  it("treats NaN setDraft(NaN) as idempotent via Object.is", () => {
    const e = createPluginBrowserInlineEditor<number>();
    e.open("a", "port", Number.NaN);
    expect(e.setDraft(Number.NaN)).toBe(false);
  });

  it("preserves pluginId/fieldPath on draft change", () => {
    const e = createPluginBrowserInlineEditor<number>();
    e.open("a", "port", 1);
    e.setDraft(99);
    expect(e.current()?.pluginId).toBe("a");
    expect(e.current()?.fieldPath).toBe("port");
  });
});

describe("createPluginBrowserInlineEditor — commit", () => {
  it("returns the session and closes", () => {
    const e = createPluginBrowserInlineEditor<number>();
    e.open("a", "port", 8080);
    e.setDraft(9090);
    expect(e.commit()).toEqual({
      pluginId: "a",
      fieldPath: "port",
      draft: 9090,
    });
    expect(e.isOpen()).toBe(false);
  });

  it("returns undefined when closed", () => {
    const e = createPluginBrowserInlineEditor<number>();
    expect(e.commit()).toBeUndefined();
  });

  it("is non-idempotent — second commit is undefined", () => {
    const e = createPluginBrowserInlineEditor<number>();
    e.open("a", "port", 1);
    expect(e.commit()).toBeDefined();
    expect(e.commit()).toBeUndefined();
  });
});

describe("createPluginBrowserInlineEditor — cancel", () => {
  it("returns the discarded session and closes", () => {
    const e = createPluginBrowserInlineEditor<number>();
    e.open("a", "port", 1);
    e.setDraft(99);
    expect(e.cancel()).toEqual({
      pluginId: "a",
      fieldPath: "port",
      draft: 99,
    });
    expect(e.isOpen()).toBe(false);
  });

  it("returns undefined when closed", () => {
    const e = createPluginBrowserInlineEditor<number>();
    expect(e.cancel()).toBeUndefined();
  });
});

describe("createPluginBrowserInlineEditor — isEditing", () => {
  it("rejects empty ids", () => {
    const e = createPluginBrowserInlineEditor<number>();
    e.open("a", "port", 1);
    expect(e.isEditing("", "port")).toBe(false);
    expect(e.isEditing("a", "")).toBe(false);
  });

  it("returns false after commit / cancel", () => {
    const e = createPluginBrowserInlineEditor<number>();
    e.open("a", "port", 1);
    e.commit();
    expect(e.isEditing("a", "port")).toBe(false);
  });
});

describe("createPluginBrowserInlineEditor — generic draft type", () => {
  it("threads a structured draft through", () => {
    type Range = { min: number; max: number };
    const e = createPluginBrowserInlineEditor<Range>();
    e.open("a", "hpRange", { min: 0, max: 100 });
    expect(e.setDraft({ min: 10, max: 200 })).toBe(true);
    expect(e.current()?.draft).toEqual({ min: 10, max: 200 });
  });
});

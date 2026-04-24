import { describe, expect, it } from "vitest";
import { createPluginBrowserDirtyState } from "../PluginBrowserDirtyState.js";

describe("createPluginBrowserDirtyState — defaults", () => {
  it("starts clean", () => {
    const d = createPluginBrowserDirtyState();
    expect(d.isDirty("a")).toBe(false);
    expect(d.isFieldDirty("a", "settings.port")).toBe(false);
    expect(d.dirtyFields("a")).toEqual([]);
    expect(d.dirtyPlugins()).toEqual([]);
    expect(d.totalDirtyFields()).toBe(0);
    expect(d.dirtyPluginCount()).toBe(0);
    expect(d.entries()).toEqual([]);
  });
});

describe("createPluginBrowserDirtyState — markDirty", () => {
  it("marks a field dirty", () => {
    const d = createPluginBrowserDirtyState();
    expect(d.markDirty("a", "settings.port")).toBe(true);
    expect(d.isDirty("a")).toBe(true);
    expect(d.isFieldDirty("a", "settings.port")).toBe(true);
  });

  it("is idempotent on re-mark", () => {
    const d = createPluginBrowserDirtyState();
    d.markDirty("a", "settings.port");
    expect(d.markDirty("a", "settings.port")).toBe(false);
  });

  it("preserves insertion order across fields", () => {
    const d = createPluginBrowserDirtyState();
    d.markDirty("a", "port");
    d.markDirty("a", "host");
    d.markDirty("a", "tls");
    expect(d.dirtyFields("a")).toEqual(["port", "host", "tls"]);
  });

  it("rejects empty ids", () => {
    const d = createPluginBrowserDirtyState();
    expect(d.markDirty("", "port")).toBe(false);
    expect(d.markDirty("a", "")).toBe(false);
    expect(d.dirtyPlugins()).toEqual([]);
  });
});

describe("createPluginBrowserDirtyState — markClean", () => {
  it("cleans a single field", () => {
    const d = createPluginBrowserDirtyState();
    d.markDirty("a", "port");
    d.markDirty("a", "host");
    expect(d.markClean("a", "port")).toBe(true);
    expect(d.isFieldDirty("a", "port")).toBe(false);
    expect(d.isFieldDirty("a", "host")).toBe(true);
    expect(d.isDirty("a")).toBe(true);
  });

  it("drops plugin entry when last field cleaned", () => {
    const d = createPluginBrowserDirtyState();
    d.markDirty("a", "port");
    d.markClean("a", "port");
    expect(d.isDirty("a")).toBe(false);
    expect(d.dirtyPlugins()).toEqual([]);
  });

  it("returns false on unknown field", () => {
    const d = createPluginBrowserDirtyState();
    expect(d.markClean("a", "port")).toBe(false);
  });

  it("returns false on empty ids", () => {
    const d = createPluginBrowserDirtyState();
    expect(d.markClean("", "port")).toBe(false);
    expect(d.markClean("a", "")).toBe(false);
  });
});

describe("createPluginBrowserDirtyState — markAllClean", () => {
  it("drops every field for a plugin", () => {
    const d = createPluginBrowserDirtyState();
    d.markDirty("a", "port");
    d.markDirty("a", "host");
    expect(d.markAllClean("a")).toBe(true);
    expect(d.isDirty("a")).toBe(false);
  });

  it("returns false when plugin had nothing dirty", () => {
    const d = createPluginBrowserDirtyState();
    expect(d.markAllClean("nope")).toBe(false);
  });
});

describe("createPluginBrowserDirtyState — cross-plugin", () => {
  it("tracks multiple plugins in insertion order", () => {
    const d = createPluginBrowserDirtyState();
    d.markDirty("a", "port");
    d.markDirty("b", "host");
    d.markDirty("c", "tls");
    expect(d.dirtyPlugins()).toEqual(["a", "b", "c"]);
    expect(d.dirtyPluginCount()).toBe(3);
    expect(d.totalDirtyFields()).toBe(3);
  });

  it("reports accurate totalDirtyFields", () => {
    const d = createPluginBrowserDirtyState();
    d.markDirty("a", "one");
    d.markDirty("a", "two");
    d.markDirty("a", "three");
    d.markDirty("b", "x");
    expect(d.totalDirtyFields()).toBe(4);
  });

  it("clearing one plugin preserves others", () => {
    const d = createPluginBrowserDirtyState();
    d.markDirty("a", "port");
    d.markDirty("b", "host");
    d.markAllClean("a");
    expect(d.dirtyPlugins()).toEqual(["b"]);
  });
});

describe("createPluginBrowserDirtyState — clear + entries", () => {
  it("clear wipes everything", () => {
    const d = createPluginBrowserDirtyState();
    d.markDirty("a", "port");
    d.markDirty("b", "host");
    d.clear();
    expect(d.dirtyPlugins()).toEqual([]);
    expect(d.totalDirtyFields()).toBe(0);
  });

  it("entries snapshots per-plugin dirty fields", () => {
    const d = createPluginBrowserDirtyState();
    d.markDirty("a", "port");
    d.markDirty("a", "host");
    d.markDirty("b", "tls");
    expect(d.entries()).toEqual([
      { pluginId: "a", dirtyFields: ["port", "host"] },
      { pluginId: "b", dirtyFields: ["tls"] },
    ]);
  });

  it("entries array is decoupled", () => {
    const d = createPluginBrowserDirtyState();
    d.markDirty("a", "port");
    const snap = d.entries();
    (snap[0]!.dirtyFields as string[]).push("mutation");
    expect(d.dirtyFields("a")).toEqual(["port"]);
  });
});

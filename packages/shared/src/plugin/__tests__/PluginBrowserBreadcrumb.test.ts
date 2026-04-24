import { describe, expect, it } from "vitest";
import { createPluginBrowserBreadcrumb } from "../PluginBrowserBreadcrumb.js";

describe("createPluginBrowserBreadcrumb — defaults", () => {
  it("starts empty", () => {
    const b = createPluginBrowserBreadcrumb();
    expect(b.path()).toEqual([]);
    expect(b.tip()).toBeUndefined();
    expect(b.depth()).toBe(0);
    expect(b.pop()).toBeUndefined();
    expect(b.includes("anything")).toBe(false);
  });
});

describe("createPluginBrowserBreadcrumb — root", () => {
  it("sets the root crumb", () => {
    const b = createPluginBrowserBreadcrumb();
    expect(b.root({ id: "all", label: "All Plugins" })).toBe(true);
    expect(b.depth()).toBe(1);
    expect(b.tip()?.id).toBe("all");
  });

  it("replaces the entire path", () => {
    const b = createPluginBrowserBreadcrumb();
    b.root({ id: "all", label: "All" });
    b.push({ id: "social", label: "Social" });
    b.push({ id: "chat", label: "Chat" });
    expect(b.root({ id: "new", label: "New" })).toBe(true);
    expect(b.depth()).toBe(1);
    expect(b.tip()?.id).toBe("new");
  });

  it("rejects empty id / label", () => {
    const b = createPluginBrowserBreadcrumb();
    expect(b.root({ id: "", label: "x" })).toBe(false);
    expect(b.root({ id: "x", label: "" })).toBe(false);
    expect(b.depth()).toBe(0);
  });
});

describe("createPluginBrowserBreadcrumb — push", () => {
  it("appends a crumb after root", () => {
    const b = createPluginBrowserBreadcrumb();
    b.root({ id: "all", label: "All" });
    expect(b.push({ id: "social", label: "Social" })).toBe(true);
    expect(b.depth()).toBe(2);
    expect(b.tip()?.id).toBe("social");
  });

  it("rejects push when path empty (must call root first)", () => {
    const b = createPluginBrowserBreadcrumb();
    expect(b.push({ id: "a", label: "A" })).toBe(false);
  });

  it("rejects duplicate segment id", () => {
    const b = createPluginBrowserBreadcrumb();
    b.root({ id: "all", label: "All" });
    b.push({ id: "social", label: "Social" });
    expect(b.push({ id: "social", label: "Social v2" })).toBe(false);
    expect(b.depth()).toBe(2);
  });

  it("rejects empty id / label", () => {
    const b = createPluginBrowserBreadcrumb();
    b.root({ id: "all", label: "All" });
    expect(b.push({ id: "", label: "A" })).toBe(false);
    expect(b.push({ id: "a", label: "" })).toBe(false);
  });
});

describe("createPluginBrowserBreadcrumb — pop", () => {
  it("removes deepest crumb", () => {
    const b = createPluginBrowserBreadcrumb();
    b.root({ id: "all", label: "All" });
    b.push({ id: "social", label: "Social" });
    b.push({ id: "chat", label: "Chat" });
    const popped = b.pop();
    expect(popped?.id).toBe("chat");
    expect(b.depth()).toBe(2);
    expect(b.tip()?.id).toBe("social");
  });

  it("refuses to pop the root (returns undefined, keeps depth=1)", () => {
    const b = createPluginBrowserBreadcrumb();
    b.root({ id: "all", label: "All" });
    expect(b.pop()).toBeUndefined();
    expect(b.depth()).toBe(1);
  });

  it("returns undefined on empty", () => {
    const b = createPluginBrowserBreadcrumb();
    expect(b.pop()).toBeUndefined();
  });
});

describe("createPluginBrowserBreadcrumb — jumpTo", () => {
  it("truncates deeper segments, keeping target inclusive", () => {
    const b = createPluginBrowserBreadcrumb();
    b.root({ id: "all", label: "All" });
    b.push({ id: "social", label: "Social" });
    b.push({ id: "chat", label: "Chat" });
    b.push({ id: "moderation", label: "Moderation" });
    expect(b.jumpTo("social")).toBe(true);
    expect(b.path().map((c) => c.id)).toEqual(["all", "social"]);
  });

  it("no-ops when target is already tip", () => {
    const b = createPluginBrowserBreadcrumb();
    b.root({ id: "all", label: "All" });
    b.push({ id: "social", label: "Social" });
    expect(b.jumpTo("social")).toBe(false);
    expect(b.depth()).toBe(2);
  });

  it("returns false for unknown segment / empty id", () => {
    const b = createPluginBrowserBreadcrumb();
    b.root({ id: "all", label: "All" });
    b.push({ id: "social", label: "Social" });
    expect(b.jumpTo("unknown")).toBe(false);
    expect(b.jumpTo("")).toBe(false);
    expect(b.depth()).toBe(2);
  });

  it("jumping to root truncates everything else", () => {
    const b = createPluginBrowserBreadcrumb();
    b.root({ id: "all", label: "All" });
    b.push({ id: "social", label: "Social" });
    b.push({ id: "chat", label: "Chat" });
    expect(b.jumpTo("all")).toBe(true);
    expect(b.depth()).toBe(1);
    expect(b.tip()?.id).toBe("all");
  });
});

describe("createPluginBrowserBreadcrumb — path / includes", () => {
  it("path snapshot is safe to mutate", () => {
    const b = createPluginBrowserBreadcrumb();
    b.root({ id: "all", label: "All" });
    b.push({ id: "social", label: "Social" });
    const snap = b.path() as unknown as unknown[];
    snap.length = 0;
    expect(b.depth()).toBe(2);
  });

  it("includes true for members, false otherwise", () => {
    const b = createPluginBrowserBreadcrumb();
    b.root({ id: "all", label: "All" });
    b.push({ id: "social", label: "Social" });
    expect(b.includes("all")).toBe(true);
    expect(b.includes("social")).toBe(true);
    expect(b.includes("chat")).toBe(false);
    expect(b.includes("")).toBe(false);
  });
});

describe("createPluginBrowserBreadcrumb — clear", () => {
  it("wipes every segment including root", () => {
    const b = createPluginBrowserBreadcrumb();
    b.root({ id: "all", label: "All" });
    b.push({ id: "social", label: "Social" });
    b.clear();
    expect(b.depth()).toBe(0);
    expect(b.tip()).toBeUndefined();
    expect(b.path()).toEqual([]);
  });

  it("is safe on empty path", () => {
    const b = createPluginBrowserBreadcrumb();
    expect(() => b.clear()).not.toThrow();
  });
});

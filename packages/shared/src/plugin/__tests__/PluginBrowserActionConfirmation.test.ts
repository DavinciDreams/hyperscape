import { describe, expect, it } from "vitest";
import { createPluginBrowserActionConfirmation } from "../PluginBrowserActionConfirmation.js";

type UninstallPayload = { kind: "uninstall"; pluginId: string };

describe("createPluginBrowserActionConfirmation — defaults", () => {
  it("starts empty", () => {
    const c = createPluginBrowserActionConfirmation<UninstallPayload>();
    expect(c.isPending()).toBe(false);
    expect(c.pending()).toBeUndefined();
    expect(c.isPendingFor(1)).toBe(false);
  });
});

describe("createPluginBrowserActionConfirmation — request", () => {
  it("opens a prompt and returns a positive id", () => {
    const c = createPluginBrowserActionConfirmation<UninstallPayload>();
    const id = c.request("Uninstall Combat Sounds?", {
      kind: "uninstall",
      pluginId: "combat-sounds",
    });
    expect(id).toBeGreaterThan(0);
    expect(c.isPending()).toBe(true);
    expect(c.pending()).toEqual({
      id,
      label: "Uninstall Combat Sounds?",
      payload: { kind: "uninstall", pluginId: "combat-sounds" },
    });
    expect(c.isPendingFor(id)).toBe(true);
  });

  it("hands out monotonically increasing ids", () => {
    const c = createPluginBrowserActionConfirmation<UninstallPayload>();
    const a = c.request("A", { kind: "uninstall", pluginId: "a" });
    const b = c.request("B", { kind: "uninstall", pluginId: "b" });
    expect(b).toBeGreaterThan(a);
  });

  it("second request silently replaces the first", () => {
    const c = createPluginBrowserActionConfirmation<UninstallPayload>();
    const a = c.request("A", { kind: "uninstall", pluginId: "a" });
    const b = c.request("B", { kind: "uninstall", pluginId: "b" });
    expect(c.isPendingFor(a)).toBe(false);
    expect(c.isPendingFor(b)).toBe(true);
  });

  it("rejects empty label", () => {
    const c = createPluginBrowserActionConfirmation<UninstallPayload>();
    expect(c.request("", { kind: "uninstall", pluginId: "a" })).toBe(-1);
    expect(c.isPending()).toBe(false);
  });

  it("preserves an earlier prompt when a new request has an empty label", () => {
    const c = createPluginBrowserActionConfirmation<UninstallPayload>();
    const a = c.request("A", { kind: "uninstall", pluginId: "a" });
    expect(c.request("", { kind: "uninstall", pluginId: "b" })).toBe(-1);
    expect(c.isPendingFor(a)).toBe(true);
  });
});

describe("createPluginBrowserActionConfirmation — confirm", () => {
  it("resolves with outcome=confirmed", () => {
    const c = createPluginBrowserActionConfirmation<UninstallPayload>();
    const id = c.request("Go?", { kind: "uninstall", pluginId: "a" });
    expect(c.confirm()).toEqual({
      id,
      label: "Go?",
      payload: { kind: "uninstall", pluginId: "a" },
      outcome: "confirmed",
    });
    expect(c.isPending()).toBe(false);
  });

  it("returns undefined when nothing pending", () => {
    const c = createPluginBrowserActionConfirmation<UninstallPayload>();
    expect(c.confirm()).toBeUndefined();
  });

  it("is non-idempotent — second confirm is undefined", () => {
    const c = createPluginBrowserActionConfirmation<UninstallPayload>();
    c.request("x", { kind: "uninstall", pluginId: "a" });
    expect(c.confirm()).toBeDefined();
    expect(c.confirm()).toBeUndefined();
  });
});

describe("createPluginBrowserActionConfirmation — cancel", () => {
  it("resolves with outcome=canceled", () => {
    const c = createPluginBrowserActionConfirmation<UninstallPayload>();
    const id = c.request("Stop?", { kind: "uninstall", pluginId: "a" });
    expect(c.cancel()).toEqual({
      id,
      label: "Stop?",
      payload: { kind: "uninstall", pluginId: "a" },
      outcome: "canceled",
    });
    expect(c.isPending()).toBe(false);
  });

  it("returns undefined when nothing pending", () => {
    const c = createPluginBrowserActionConfirmation<UninstallPayload>();
    expect(c.cancel()).toBeUndefined();
  });
});

describe("createPluginBrowserActionConfirmation — clear", () => {
  it("drops a pending prompt silently", () => {
    const c = createPluginBrowserActionConfirmation<UninstallPayload>();
    c.request("x", { kind: "uninstall", pluginId: "a" });
    c.clear();
    expect(c.isPending()).toBe(false);
    expect(c.confirm()).toBeUndefined();
    expect(c.cancel()).toBeUndefined();
  });

  it("is a no-op when nothing pending", () => {
    const c = createPluginBrowserActionConfirmation<UninstallPayload>();
    expect(() => c.clear()).not.toThrow();
    expect(c.isPending()).toBe(false);
  });
});

describe("createPluginBrowserActionConfirmation — isPendingFor", () => {
  it("only returns true for the active id", () => {
    const c = createPluginBrowserActionConfirmation<UninstallPayload>();
    const a = c.request("A", { kind: "uninstall", pluginId: "a" });
    const b = c.request("B", { kind: "uninstall", pluginId: "b" });
    expect(c.isPendingFor(a)).toBe(false);
    expect(c.isPendingFor(b)).toBe(true);
  });

  it("returns false after confirm", () => {
    const c = createPluginBrowserActionConfirmation<UninstallPayload>();
    const a = c.request("A", { kind: "uninstall", pluginId: "a" });
    c.confirm();
    expect(c.isPendingFor(a)).toBe(false);
  });

  it("returns false for nonsense ids", () => {
    const c = createPluginBrowserActionConfirmation<UninstallPayload>();
    c.request("A", { kind: "uninstall", pluginId: "a" });
    expect(c.isPendingFor(0)).toBe(false);
    expect(c.isPendingFor(-1)).toBe(false);
    expect(c.isPendingFor(9999)).toBe(false);
  });
});

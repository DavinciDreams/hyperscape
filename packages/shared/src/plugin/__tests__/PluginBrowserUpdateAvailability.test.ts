import { describe, expect, it } from "vitest";
import { createPluginBrowserUpdateAvailability } from "../PluginBrowserUpdateAvailability.js";

describe("createPluginBrowserUpdateAvailability — defaults", () => {
  it("starts empty", () => {
    const u = createPluginBrowserUpdateAvailability();
    expect(u.all()).toEqual([]);
    expect(u.visible()).toEqual([]);
    expect(u.count()).toBe(0);
    expect(u.visibleCount()).toBe(0);
    expect(u.get("p")).toBeUndefined();
    expect(u.isDismissed("p")).toBe(false);
  });
});

describe("createPluginBrowserUpdateAvailability — setAvailable", () => {
  it("records a new entry", () => {
    const u = createPluginBrowserUpdateAvailability();
    expect(u.setAvailable("p", "1.0.0", "1.1.0")).toBe(true);
    expect(u.get("p")).toEqual({
      pluginId: "p",
      currentVersion: "1.0.0",
      availableVersion: "1.1.0",
      dismissed: false,
    });
  });

  it("preserves release notes when given", () => {
    const u = createPluginBrowserUpdateAvailability();
    u.setAvailable("p", "1.0.0", "1.1.0", "fixes");
    expect(u.get("p")?.releaseNotes).toBe("fixes");
  });

  it("drops empty release notes", () => {
    const u = createPluginBrowserUpdateAvailability();
    u.setAvailable("p", "1.0.0", "1.1.0", "");
    expect(u.get("p")?.releaseNotes).toBeUndefined();
  });

  it("replaces prior entry and resets dismissed", () => {
    const u = createPluginBrowserUpdateAvailability();
    u.setAvailable("p", "1.0.0", "1.1.0");
    u.dismiss("p");
    expect(u.isDismissed("p")).toBe(true);
    u.setAvailable("p", "1.0.0", "1.2.0");
    expect(u.get("p")?.availableVersion).toBe("1.2.0");
    expect(u.isDismissed("p")).toBe(false);
  });

  it("preserves insertion order across distinct plugins", () => {
    const u = createPluginBrowserUpdateAvailability();
    u.setAvailable("a", "1", "2");
    u.setAvailable("b", "1", "2");
    u.setAvailable("c", "1", "2");
    expect(u.all().map((e) => e.pluginId)).toEqual(["a", "b", "c"]);
  });

  it("rejects empty id / empty versions", () => {
    const u = createPluginBrowserUpdateAvailability();
    expect(u.setAvailable("", "1", "2")).toBe(false);
    expect(u.setAvailable("p", "", "2")).toBe(false);
    expect(u.setAvailable("p", "1", "")).toBe(false);
    expect(u.count()).toBe(0);
  });
});

describe("createPluginBrowserUpdateAvailability — dismiss / restore", () => {
  it("dismisses a visible entry", () => {
    const u = createPluginBrowserUpdateAvailability();
    u.setAvailable("p", "1", "2");
    expect(u.dismiss("p")).toBe(true);
    expect(u.isDismissed("p")).toBe(true);
  });

  it("dismiss is idempotent on already-dismissed", () => {
    const u = createPluginBrowserUpdateAvailability();
    u.setAvailable("p", "1", "2");
    u.dismiss("p");
    expect(u.dismiss("p")).toBe(false);
  });

  it("restores a dismissed entry", () => {
    const u = createPluginBrowserUpdateAvailability();
    u.setAvailable("p", "1", "2");
    u.dismiss("p");
    expect(u.restore("p")).toBe(true);
    expect(u.isDismissed("p")).toBe(false);
  });

  it("restore is idempotent on already-visible", () => {
    const u = createPluginBrowserUpdateAvailability();
    u.setAvailable("p", "1", "2");
    expect(u.restore("p")).toBe(false);
  });

  it("dismiss / restore on unknown plugin returns false", () => {
    const u = createPluginBrowserUpdateAvailability();
    expect(u.dismiss("nope")).toBe(false);
    expect(u.restore("nope")).toBe(false);
  });
});

describe("createPluginBrowserUpdateAvailability — visible / count", () => {
  it("visible excludes dismissed entries", () => {
    const u = createPluginBrowserUpdateAvailability();
    u.setAvailable("a", "1", "2");
    u.setAvailable("b", "1", "2");
    u.setAvailable("c", "1", "2");
    u.dismiss("b");
    const visible = u.visible();
    expect(visible.map((e) => e.pluginId)).toEqual(["a", "c"]);
  });

  it("count includes dismissed; visibleCount excludes them", () => {
    const u = createPluginBrowserUpdateAvailability();
    u.setAvailable("a", "1", "2");
    u.setAvailable("b", "1", "2");
    u.dismiss("b");
    expect(u.count()).toBe(2);
    expect(u.visibleCount()).toBe(1);
  });
});

describe("createPluginBrowserUpdateAvailability — clear / clearAll", () => {
  it("clear removes a single entry", () => {
    const u = createPluginBrowserUpdateAvailability();
    u.setAvailable("a", "1", "2");
    u.setAvailable("b", "1", "2");
    expect(u.clear("a")).toBe(true);
    expect(u.get("a")).toBeUndefined();
    expect(u.count()).toBe(1);
  });

  it("clear on unknown returns false", () => {
    const u = createPluginBrowserUpdateAvailability();
    expect(u.clear("nope")).toBe(false);
  });

  it("clearAll wipes everything", () => {
    const u = createPluginBrowserUpdateAvailability();
    u.setAvailable("a", "1", "2");
    u.setAvailable("b", "1", "2");
    u.clearAll();
    expect(u.count()).toBe(0);
    expect(u.all()).toEqual([]);
  });
});

describe("createPluginBrowserUpdateAvailability — empty-id guards", () => {
  it("all query methods reject empty id", () => {
    const u = createPluginBrowserUpdateAvailability();
    u.setAvailable("p", "1", "2");
    expect(u.get("")).toBeUndefined();
    expect(u.isDismissed("")).toBe(false);
    expect(u.dismiss("")).toBe(false);
    expect(u.restore("")).toBe(false);
    expect(u.clear("")).toBe(false);
  });
});

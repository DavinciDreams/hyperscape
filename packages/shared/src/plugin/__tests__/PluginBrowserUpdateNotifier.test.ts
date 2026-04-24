import { describe, expect, it } from "vitest";
import { createPluginBrowserUpdateNotifier } from "../PluginBrowserUpdateNotifier.js";

describe("createPluginBrowserUpdateNotifier — defaults", () => {
  it("starts empty", () => {
    const u = createPluginBrowserUpdateNotifier();
    expect(u.hasAdvertisement("a")).toBe(false);
    expect(u.hasPendingUpdate("a")).toBe(false);
    expect(u.isDismissed("a")).toBe(false);
    expect(u.getAdvertisement("a")).toBeUndefined();
    expect(u.advertisedPlugins()).toEqual([]);
    expect(u.pluginsWithPendingUpdates()).toEqual([]);
    expect(u.advertisementCount()).toBe(0);
    expect(u.pendingUpdateCount()).toBe(0);
    expect(u.entries()).toEqual([]);
  });
});

describe("createPluginBrowserUpdateNotifier — advertise", () => {
  it("creates a new advertisement", () => {
    const u = createPluginBrowserUpdateNotifier();
    expect(u.advertise("a", "1.0.0", "1.1.0")).toBe(true);
    expect(u.hasAdvertisement("a")).toBe(true);
    expect(u.hasPendingUpdate("a")).toBe(true);
    expect(u.getAdvertisement("a")).toEqual({
      pluginId: "a",
      currentVersion: "1.0.0",
      availableVersion: "1.1.0",
      dismissed: false,
    });
  });

  it("is idempotent when availableVersion is unchanged", () => {
    const u = createPluginBrowserUpdateNotifier();
    u.advertise("a", "1.0.0", "1.1.0");
    expect(u.advertise("a", "1.0.0", "1.1.0")).toBe(false);
  });

  it("silently overwrites currentVersion without reporting change", () => {
    const u = createPluginBrowserUpdateNotifier();
    u.advertise("a", "1.0.0", "1.1.0");
    expect(u.advertise("a", "1.0.1", "1.1.0")).toBe(false);
    expect(u.getAdvertisement("a")?.currentVersion).toBe("1.0.1");
  });

  it("returns true for a new availableVersion", () => {
    const u = createPluginBrowserUpdateNotifier();
    u.advertise("a", "1.0.0", "1.1.0");
    expect(u.advertise("a", "1.0.0", "1.2.0")).toBe(true);
    expect(u.getAdvertisement("a")?.availableVersion).toBe("1.2.0");
  });

  it("auto-clears dismissal on new availableVersion", () => {
    const u = createPluginBrowserUpdateNotifier();
    u.advertise("a", "1.0.0", "1.1.0");
    u.dismiss("a");
    expect(u.isDismissed("a")).toBe(true);
    u.advertise("a", "1.0.0", "1.2.0");
    expect(u.isDismissed("a")).toBe(false);
    expect(u.hasPendingUpdate("a")).toBe(true);
  });

  it("same availableVersion does NOT clear dismissal", () => {
    const u = createPluginBrowserUpdateNotifier();
    u.advertise("a", "1.0.0", "1.1.0");
    u.dismiss("a");
    expect(u.advertise("a", "1.0.0", "1.1.0")).toBe(false);
    expect(u.isDismissed("a")).toBe(true);
  });

  it("rejects empty pluginId / versions", () => {
    const u = createPluginBrowserUpdateNotifier();
    expect(u.advertise("", "1.0.0", "1.1.0")).toBe(false);
    expect(u.advertise("a", "", "1.1.0")).toBe(false);
    expect(u.advertise("a", "1.0.0", "")).toBe(false);
    expect(u.advertisedPlugins()).toEqual([]);
  });
});

describe("createPluginBrowserUpdateNotifier — dismiss / undismiss", () => {
  it("dismiss flips flag and returns true", () => {
    const u = createPluginBrowserUpdateNotifier();
    u.advertise("a", "1.0.0", "1.1.0");
    expect(u.dismiss("a")).toBe(true);
    expect(u.isDismissed("a")).toBe(true);
    expect(u.hasPendingUpdate("a")).toBe(false);
  });

  it("dismiss is idempotent", () => {
    const u = createPluginBrowserUpdateNotifier();
    u.advertise("a", "1.0.0", "1.1.0");
    u.dismiss("a");
    expect(u.dismiss("a")).toBe(false);
  });

  it("dismiss returns false for unknown plugin", () => {
    const u = createPluginBrowserUpdateNotifier();
    expect(u.dismiss("nope")).toBe(false);
  });

  it("undismiss flips flag and returns true", () => {
    const u = createPluginBrowserUpdateNotifier();
    u.advertise("a", "1.0.0", "1.1.0");
    u.dismiss("a");
    expect(u.undismiss("a")).toBe(true);
    expect(u.isDismissed("a")).toBe(false);
  });

  it("undismiss is idempotent", () => {
    const u = createPluginBrowserUpdateNotifier();
    u.advertise("a", "1.0.0", "1.1.0");
    expect(u.undismiss("a")).toBe(false);
  });

  it("dismiss rejects empty id", () => {
    const u = createPluginBrowserUpdateNotifier();
    expect(u.dismiss("")).toBe(false);
    expect(u.undismiss("")).toBe(false);
  });
});

describe("createPluginBrowserUpdateNotifier — clearAdvertisement", () => {
  it("removes the advertisement", () => {
    const u = createPluginBrowserUpdateNotifier();
    u.advertise("a", "1.0.0", "1.1.0");
    expect(u.clearAdvertisement("a")).toBe(true);
    expect(u.hasAdvertisement("a")).toBe(false);
  });

  it("returns false when no ad exists", () => {
    const u = createPluginBrowserUpdateNotifier();
    expect(u.clearAdvertisement("a")).toBe(false);
  });
});

describe("createPluginBrowserUpdateNotifier — cross-plugin", () => {
  it("tracks advertised vs pending counts correctly", () => {
    const u = createPluginBrowserUpdateNotifier();
    u.advertise("a", "1", "2");
    u.advertise("b", "1", "2");
    u.advertise("c", "1", "2");
    u.dismiss("b");
    expect(u.advertisementCount()).toBe(3);
    expect(u.pendingUpdateCount()).toBe(2);
    expect(u.advertisedPlugins()).toEqual(["a", "b", "c"]);
    expect(u.pluginsWithPendingUpdates()).toEqual(["a", "c"]);
  });

  it("preserves insertion order across adds", () => {
    const u = createPluginBrowserUpdateNotifier();
    u.advertise("c", "1", "2");
    u.advertise("a", "1", "2");
    u.advertise("b", "1", "2");
    expect(u.advertisedPlugins()).toEqual(["c", "a", "b"]);
  });
});

describe("createPluginBrowserUpdateNotifier — clear + entries", () => {
  it("clear wipes everything", () => {
    const u = createPluginBrowserUpdateNotifier();
    u.advertise("a", "1", "2");
    u.advertise("b", "1", "2");
    u.dismiss("a");
    u.clear();
    expect(u.advertisedPlugins()).toEqual([]);
    expect(u.advertisementCount()).toBe(0);
  });

  it("entries snapshots per-plugin advertisements", () => {
    const u = createPluginBrowserUpdateNotifier();
    u.advertise("a", "1.0.0", "1.1.0");
    u.advertise("b", "2.0.0", "2.1.0");
    u.dismiss("a");
    expect(u.entries()).toEqual([
      {
        pluginId: "a",
        currentVersion: "1.0.0",
        availableVersion: "1.1.0",
        dismissed: true,
      },
      {
        pluginId: "b",
        currentVersion: "2.0.0",
        availableVersion: "2.1.0",
        dismissed: false,
      },
    ]);
  });
});

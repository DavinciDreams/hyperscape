import { describe, expect, it } from "vitest";
import { createPluginBrowserReleaseChannel } from "../PluginBrowserReleaseChannel.js";

describe("createPluginBrowserReleaseChannel — defaults", () => {
  it("defaults to stable", () => {
    const r = createPluginBrowserReleaseChannel();
    expect(r.defaultChannel()).toBe("stable");
    expect(r.getChannel("a")).toBe("stable");
    expect(r.hasOverride("a")).toBe(false);
    expect(r.overrideCount()).toBe(0);
    expect(r.entries()).toEqual([]);
  });

  it("accepts a custom initial default", () => {
    const r = createPluginBrowserReleaseChannel("nightly");
    expect(r.defaultChannel()).toBe("nightly");
  });

  it("falls back to stable on invalid initial default", () => {
    expect(createPluginBrowserReleaseChannel("").defaultChannel()).toBe(
      "stable",
    );
  });
});

describe("createPluginBrowserReleaseChannel — setDefault", () => {
  it("changes the global default", () => {
    const r = createPluginBrowserReleaseChannel();
    expect(r.setDefault("beta")).toBe(true);
    expect(r.defaultChannel()).toBe("beta");
    expect(r.getChannel("a")).toBe("beta");
  });

  it("is idempotent when value unchanged", () => {
    const r = createPluginBrowserReleaseChannel();
    expect(r.setDefault("stable")).toBe(false);
  });

  it("rejects empty channel", () => {
    const r = createPluginBrowserReleaseChannel();
    expect(r.setDefault("")).toBe(false);
    expect(r.defaultChannel()).toBe("stable");
  });

  it("does not touch existing overrides", () => {
    const r = createPluginBrowserReleaseChannel();
    r.setChannel("a", "beta");
    r.setDefault("nightly");
    expect(r.getOverride("a")).toBe("beta");
    expect(r.getChannel("a")).toBe("beta");
  });
});

describe("createPluginBrowserReleaseChannel — setChannel", () => {
  it("sets a new override", () => {
    const r = createPluginBrowserReleaseChannel();
    expect(r.setChannel("a", "beta")).toBe(true);
    expect(r.hasOverride("a")).toBe(true);
    expect(r.getOverride("a")).toBe("beta");
    expect(r.getChannel("a")).toBe("beta");
  });

  it("is idempotent when override unchanged", () => {
    const r = createPluginBrowserReleaseChannel();
    r.setChannel("a", "beta");
    expect(r.setChannel("a", "beta")).toBe(false);
  });

  it("accepts custom channel names", () => {
    const r = createPluginBrowserReleaseChannel();
    expect(r.setChannel("a", "experimental-42")).toBe(true);
    expect(r.getChannel("a")).toBe("experimental-42");
  });

  it("setting to default clears the override", () => {
    const r = createPluginBrowserReleaseChannel();
    r.setChannel("a", "beta");
    expect(r.setChannel("a", "stable")).toBe(true); // drop override
    expect(r.hasOverride("a")).toBe(false);
    expect(r.getChannel("a")).toBe("stable");
  });

  it("setting to default on a plugin without override is a no-op", () => {
    const r = createPluginBrowserReleaseChannel();
    expect(r.setChannel("a", "stable")).toBe(false);
    expect(r.hasOverride("a")).toBe(false);
  });

  it("rejects empty pluginId / channel", () => {
    const r = createPluginBrowserReleaseChannel();
    expect(r.setChannel("", "beta")).toBe(false);
    expect(r.setChannel("a", "")).toBe(false);
    expect(r.overrideCount()).toBe(0);
  });
});

describe("createPluginBrowserReleaseChannel — resetToDefault / resetAll", () => {
  it("resetToDefault removes an existing override", () => {
    const r = createPluginBrowserReleaseChannel();
    r.setChannel("a", "beta");
    expect(r.resetToDefault("a")).toBe(true);
    expect(r.hasOverride("a")).toBe(false);
  });

  it("resetToDefault returns false when no override", () => {
    const r = createPluginBrowserReleaseChannel();
    expect(r.resetToDefault("a")).toBe(false);
  });

  it("resetToDefault rejects empty id", () => {
    const r = createPluginBrowserReleaseChannel();
    expect(r.resetToDefault("")).toBe(false);
  });

  it("resetAll clears every override and returns count", () => {
    const r = createPluginBrowserReleaseChannel();
    r.setChannel("a", "beta");
    r.setChannel("b", "nightly");
    r.setChannel("c", "beta");
    expect(r.resetAll()).toBe(3);
    expect(r.pluginsWithOverrides()).toEqual([]);
  });

  it("resetAll returns 0 when empty", () => {
    const r = createPluginBrowserReleaseChannel();
    expect(r.resetAll()).toBe(0);
  });
});

describe("createPluginBrowserReleaseChannel — projection", () => {
  it("preserves insertion order across overrides", () => {
    const r = createPluginBrowserReleaseChannel();
    r.setChannel("c", "beta");
    r.setChannel("a", "nightly");
    r.setChannel("b", "beta");
    expect(r.pluginsWithOverrides()).toEqual(["c", "a", "b"]);
  });

  it("entries snapshots in insertion order", () => {
    const r = createPluginBrowserReleaseChannel();
    r.setChannel("a", "beta");
    r.setChannel("b", "nightly");
    expect(r.entries()).toEqual([
      { pluginId: "a", channel: "beta" },
      { pluginId: "b", channel: "nightly" },
    ]);
  });

  it("getChannel on unknown id returns default", () => {
    const r = createPluginBrowserReleaseChannel("beta");
    expect(r.getChannel("unknown")).toBe("beta");
  });

  it("getChannel on empty id returns default", () => {
    const r = createPluginBrowserReleaseChannel("beta");
    expect(r.getChannel("")).toBe("beta");
  });
});

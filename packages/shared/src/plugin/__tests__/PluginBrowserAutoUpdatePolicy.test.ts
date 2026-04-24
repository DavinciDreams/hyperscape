import { describe, expect, it } from "vitest";
import { createPluginBrowserAutoUpdatePolicyLedger } from "../PluginBrowserAutoUpdatePolicy.js";

describe("createPluginBrowserAutoUpdatePolicyLedger — defaults", () => {
  it("defaults to manual", () => {
    const l = createPluginBrowserAutoUpdatePolicyLedger();
    expect(l.defaultPolicy()).toBe("manual");
    expect(l.getPolicy("a")).toBe("manual");
    expect(l.hasOverride("a")).toBe(false);
    expect(l.overrideCount()).toBe(0);
    expect(l.entries()).toEqual([]);
    expect(l.pluginsWithOverrides()).toEqual([]);
  });

  it("accepts a custom initial default", () => {
    const l = createPluginBrowserAutoUpdatePolicyLedger("all");
    expect(l.defaultPolicy()).toBe("all");
  });

  it("falls back to manual on invalid initial default", () => {
    const l = createPluginBrowserAutoUpdatePolicyLedger(
      "nonsense" as unknown as "manual",
    );
    expect(l.defaultPolicy()).toBe("manual");
  });
});

describe("createPluginBrowserAutoUpdatePolicyLedger — setDefault", () => {
  it("changes the global default", () => {
    const l = createPluginBrowserAutoUpdatePolicyLedger();
    expect(l.setDefault("all")).toBe(true);
    expect(l.defaultPolicy()).toBe("all");
    expect(l.getPolicy("a")).toBe("all");
  });

  it("is idempotent when unchanged", () => {
    const l = createPluginBrowserAutoUpdatePolicyLedger();
    expect(l.setDefault("manual")).toBe(false);
  });

  it("rejects invalid policy", () => {
    const l = createPluginBrowserAutoUpdatePolicyLedger();
    expect(l.setDefault("bogus" as unknown as "manual")).toBe(false);
    expect(l.defaultPolicy()).toBe("manual");
  });

  it("does not touch existing overrides", () => {
    const l = createPluginBrowserAutoUpdatePolicyLedger();
    l.setPolicy("a", "security-only");
    l.setDefault("all");
    expect(l.getOverride("a")).toBe("security-only");
    expect(l.getPolicy("a")).toBe("security-only");
  });
});

describe("createPluginBrowserAutoUpdatePolicyLedger — setPolicy", () => {
  it("stores an override", () => {
    const l = createPluginBrowserAutoUpdatePolicyLedger();
    expect(l.setPolicy("a", "all")).toBe(true);
    expect(l.hasOverride("a")).toBe(true);
    expect(l.getOverride("a")).toBe("all");
    expect(l.getPolicy("a")).toBe("all");
  });

  it("is idempotent when unchanged", () => {
    const l = createPluginBrowserAutoUpdatePolicyLedger();
    l.setPolicy("a", "all");
    expect(l.setPolicy("a", "all")).toBe(false);
  });

  it("setting to default drops the override", () => {
    const l = createPluginBrowserAutoUpdatePolicyLedger();
    l.setPolicy("a", "all");
    expect(l.setPolicy("a", "manual")).toBe(true); // == default, drop
    expect(l.hasOverride("a")).toBe(false);
    expect(l.getPolicy("a")).toBe("manual");
  });

  it("setting default on plugin without override is a no-op", () => {
    const l = createPluginBrowserAutoUpdatePolicyLedger();
    expect(l.setPolicy("a", "manual")).toBe(false);
    expect(l.hasOverride("a")).toBe(false);
  });

  it("rejects invalid policy / empty id", () => {
    const l = createPluginBrowserAutoUpdatePolicyLedger();
    expect(l.setPolicy("", "all")).toBe(false);
    expect(l.setPolicy("a", "bogus" as unknown as "all")).toBe(false);
    expect(l.overrideCount()).toBe(0);
  });
});

describe("createPluginBrowserAutoUpdatePolicyLedger — reset", () => {
  it("resetToDefault removes an override", () => {
    const l = createPluginBrowserAutoUpdatePolicyLedger();
    l.setPolicy("a", "all");
    expect(l.resetToDefault("a")).toBe(true);
    expect(l.hasOverride("a")).toBe(false);
  });

  it("resetToDefault returns false when no override", () => {
    const l = createPluginBrowserAutoUpdatePolicyLedger();
    expect(l.resetToDefault("a")).toBe(false);
  });

  it("resetToDefault rejects empty id", () => {
    const l = createPluginBrowserAutoUpdatePolicyLedger();
    expect(l.resetToDefault("")).toBe(false);
  });

  it("resetAll clears every override and returns count", () => {
    const l = createPluginBrowserAutoUpdatePolicyLedger();
    l.setPolicy("a", "all");
    l.setPolicy("b", "security-only");
    l.setPolicy("c", "all");
    expect(l.resetAll()).toBe(3);
    expect(l.pluginsWithOverrides()).toEqual([]);
  });

  it("resetAll returns 0 when empty", () => {
    const l = createPluginBrowserAutoUpdatePolicyLedger();
    expect(l.resetAll()).toBe(0);
  });
});

describe("createPluginBrowserAutoUpdatePolicyLedger — projection", () => {
  it("preserves insertion order", () => {
    const l = createPluginBrowserAutoUpdatePolicyLedger();
    l.setPolicy("c", "all");
    l.setPolicy("a", "security-only");
    l.setPolicy("b", "all");
    expect(l.pluginsWithOverrides()).toEqual(["c", "a", "b"]);
  });

  it("entries snapshots in insertion order", () => {
    const l = createPluginBrowserAutoUpdatePolicyLedger();
    l.setPolicy("a", "all");
    l.setPolicy("b", "security-only");
    expect(l.entries()).toEqual([
      { pluginId: "a", policy: "all" },
      { pluginId: "b", policy: "security-only" },
    ]);
  });

  it("getPolicy on unknown id returns default", () => {
    const l = createPluginBrowserAutoUpdatePolicyLedger("security-only");
    expect(l.getPolicy("unknown")).toBe("security-only");
  });

  it("getPolicy on empty id returns default", () => {
    const l = createPluginBrowserAutoUpdatePolicyLedger("security-only");
    expect(l.getPolicy("")).toBe("security-only");
  });

  it("getOverride on empty id returns undefined", () => {
    const l = createPluginBrowserAutoUpdatePolicyLedger();
    expect(l.getOverride("")).toBeUndefined();
  });

  it("hasOverride on empty id is false", () => {
    const l = createPluginBrowserAutoUpdatePolicyLedger();
    expect(l.hasOverride("")).toBe(false);
  });
});

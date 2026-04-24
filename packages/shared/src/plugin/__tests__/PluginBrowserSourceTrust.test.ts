import { describe, expect, it } from "vitest";
import { createPluginBrowserSourceTrust } from "../PluginBrowserSourceTrust.js";

describe("createPluginBrowserSourceTrust — defaults", () => {
  it("starts empty", () => {
    const t = createPluginBrowserSourceTrust();
    expect(t.all()).toEqual([]);
    expect(t.trustedSources()).toEqual([]);
    expect(t.blockedSources()).toEqual([]);
    expect(t.count()).toBe(0);
  });

  it("unset source reads as unverified", () => {
    const t = createPluginBrowserSourceTrust();
    expect(t.getTrust("unknown")).toBe("unverified");
    expect(t.isTrusted("unknown")).toBe(false);
    expect(t.isBlocked("unknown")).toBe(false);
  });
});

describe("createPluginBrowserSourceTrust — setTrust", () => {
  it("registers trusted / blocked entries", () => {
    const t = createPluginBrowserSourceTrust();
    expect(t.setTrust("good.example", "trusted")).toBe(true);
    expect(t.setTrust("evil.example", "blocked")).toBe(true);
    expect(t.getTrust("good.example")).toBe("trusted");
    expect(t.getTrust("evil.example")).toBe("blocked");
  });

  it("replaces a prior level", () => {
    const t = createPluginBrowserSourceTrust();
    t.setTrust("s", "trusted");
    t.setTrust("s", "blocked");
    expect(t.getTrust("s")).toBe("blocked");
    expect(t.count()).toBe(1);
  });

  it("rejects setting 'unverified' (use clear instead)", () => {
    const t = createPluginBrowserSourceTrust();
    expect(t.setTrust("s", "unverified" as unknown as "trusted")).toBe(false);
    expect(t.count()).toBe(0);
  });

  it("rejects empty id / unknown level", () => {
    const t = createPluginBrowserSourceTrust();
    expect(t.setTrust("", "trusted")).toBe(false);
    expect(t.setTrust("s", "bogus" as unknown as "trusted")).toBe(false);
    expect(t.count()).toBe(0);
  });

  it("preserves insertion order across distinct sources", () => {
    const t = createPluginBrowserSourceTrust();
    t.setTrust("a", "trusted");
    t.setTrust("b", "blocked");
    t.setTrust("c", "trusted");
    expect(t.all().map((e) => e.sourceId)).toEqual(["a", "b", "c"]);
  });
});

describe("createPluginBrowserSourceTrust — clear", () => {
  it("returns source to unverified", () => {
    const t = createPluginBrowserSourceTrust();
    t.setTrust("s", "trusted");
    expect(t.clear("s")).toBe(true);
    expect(t.getTrust("s")).toBe("unverified");
  });

  it("unknown returns false", () => {
    const t = createPluginBrowserSourceTrust();
    expect(t.clear("nope")).toBe(false);
  });

  it("empty id rejected", () => {
    const t = createPluginBrowserSourceTrust();
    t.setTrust("s", "trusted");
    expect(t.clear("")).toBe(false);
    expect(t.isTrusted("s")).toBe(true);
  });
});

describe("createPluginBrowserSourceTrust — trustedSources / blockedSources", () => {
  it("filter by level and preserve insertion order", () => {
    const t = createPluginBrowserSourceTrust();
    t.setTrust("a", "trusted");
    t.setTrust("b", "blocked");
    t.setTrust("c", "trusted");
    t.setTrust("d", "blocked");
    expect(t.trustedSources()).toEqual(["a", "c"]);
    expect(t.blockedSources()).toEqual(["b", "d"]);
  });
});

describe("createPluginBrowserSourceTrust — reset", () => {
  it("wipes all entries", () => {
    const t = createPluginBrowserSourceTrust();
    t.setTrust("a", "trusted");
    t.setTrust("b", "blocked");
    t.reset();
    expect(t.count()).toBe(0);
    expect(t.all()).toEqual([]);
  });
});

describe("createPluginBrowserSourceTrust — empty-id guards", () => {
  it("query methods default-return safely", () => {
    const t = createPluginBrowserSourceTrust();
    expect(t.getTrust("")).toBe("unverified");
    expect(t.isTrusted("")).toBe(false);
    expect(t.isBlocked("")).toBe(false);
  });
});

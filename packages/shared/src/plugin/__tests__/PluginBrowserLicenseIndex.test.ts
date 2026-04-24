import { describe, expect, it } from "vitest";
import { createPluginBrowserLicenseIndex } from "../PluginBrowserLicenseIndex.js";

describe("createPluginBrowserLicenseIndex — defaults", () => {
  it("starts empty", () => {
    const i = createPluginBrowserLicenseIndex();
    expect(i.all()).toEqual([]);
    expect(i.size()).toBe(0);
    expect(i.licenses()).toEqual([]);
    expect(i.groups()).toEqual([]);
  });
});

describe("createPluginBrowserLicenseIndex — set", () => {
  it("stores a new entry", () => {
    const i = createPluginBrowserLicenseIndex();
    expect(i.set("p", "MIT")).toBe(true);
    expect(i.licenseOf("p")).toBe("MIT");
  });

  it("updates an existing entry with new license", () => {
    const i = createPluginBrowserLicenseIndex();
    i.set("p", "MIT");
    expect(i.set("p", "Apache-2.0")).toBe(true);
    expect(i.licenseOf("p")).toBe("Apache-2.0");
  });

  it("idempotent on unchanged license", () => {
    const i = createPluginBrowserLicenseIndex();
    i.set("p", "MIT");
    expect(i.set("p", "MIT")).toBe(false);
  });

  it("rejects empty pluginId / empty licenseId", () => {
    const i = createPluginBrowserLicenseIndex();
    expect(i.set("", "MIT")).toBe(false);
    expect(i.set("p", "")).toBe(false);
  });

  it("is case-sensitive on license id", () => {
    const i = createPluginBrowserLicenseIndex();
    i.set("p", "MIT");
    expect(i.set("p", "mit")).toBe(true);
    expect(i.licenseOf("p")).toBe("mit");
  });
});

describe("createPluginBrowserLicenseIndex — reading", () => {
  it("get / licenseOf / has return consistently", () => {
    const i = createPluginBrowserLicenseIndex();
    i.set("p", "MIT");
    expect(i.get("p")).toEqual({ pluginId: "p", licenseId: "MIT" });
    expect(i.licenseOf("p")).toBe("MIT");
    expect(i.has("p")).toBe(true);
    expect(i.get("unknown")).toBeUndefined();
    expect(i.licenseOf("unknown")).toBeUndefined();
    expect(i.has("unknown")).toBe(false);
  });

  it("reject empty pluginId on readers", () => {
    const i = createPluginBrowserLicenseIndex();
    i.set("p", "MIT");
    expect(i.get("")).toBeUndefined();
    expect(i.licenseOf("")).toBeUndefined();
    expect(i.has("")).toBe(false);
  });

  it("all returns insertion order (snapshot-isolated)", () => {
    const i = createPluginBrowserLicenseIndex();
    i.set("a", "MIT");
    i.set("b", "Apache-2.0");
    i.set("c", "MIT");
    const snap = i.all() as unknown as unknown[];
    snap.length = 0;
    expect(i.size()).toBe(3);
    expect(i.all().map((e) => e.pluginId)).toEqual(["a", "b", "c"]);
  });
});

describe("createPluginBrowserLicenseIndex — licenses / pluginsWithLicense", () => {
  it("licenses lists uniques in first-occurrence order", () => {
    const i = createPluginBrowserLicenseIndex();
    i.set("a", "MIT");
    i.set("b", "Apache-2.0");
    i.set("c", "MIT");
    i.set("d", "GPL-3.0");
    expect(i.licenses()).toEqual(["MIT", "Apache-2.0", "GPL-3.0"]);
  });

  it("pluginsWithLicense filters + preserves order", () => {
    const i = createPluginBrowserLicenseIndex();
    i.set("a", "MIT");
    i.set("b", "Apache-2.0");
    i.set("c", "MIT");
    expect(i.pluginsWithLicense("MIT")).toEqual(["a", "c"]);
    expect(i.pluginsWithLicense("Apache-2.0")).toEqual(["b"]);
    expect(i.pluginsWithLicense("unknown")).toEqual([]);
    expect(i.pluginsWithLicense("")).toEqual([]);
  });
});

describe("createPluginBrowserLicenseIndex — groups", () => {
  it("groups by license, sorted by count descending", () => {
    const i = createPluginBrowserLicenseIndex();
    i.set("a", "MIT");
    i.set("b", "Apache-2.0");
    i.set("c", "MIT");
    i.set("d", "GPL-3.0");
    i.set("e", "MIT");
    const groups = i.groups();
    expect(groups[0].licenseId).toBe("MIT");
    expect(groups[0].pluginIds).toEqual(["a", "c", "e"]);
    expect(groups[1].licenseId).toBe("Apache-2.0");
    expect(groups[2].licenseId).toBe("GPL-3.0");
  });

  it("ties broken by first-occurrence insertion order", () => {
    const i = createPluginBrowserLicenseIndex();
    i.set("a", "Z-FIRST");
    i.set("b", "A-SECOND");
    // both 1 entry each → tie → first-occurrence wins
    expect(i.groups().map((g) => g.licenseId)).toEqual(["Z-FIRST", "A-SECOND"]);
  });
});

describe("createPluginBrowserLicenseIndex — remove / clear", () => {
  it("remove returns true on hit, false on miss", () => {
    const i = createPluginBrowserLicenseIndex();
    i.set("a", "MIT");
    expect(i.remove("a")).toBe(true);
    expect(i.remove("a")).toBe(false);
    expect(i.remove("")).toBe(false);
  });

  it("clear wipes every entry", () => {
    const i = createPluginBrowserLicenseIndex();
    i.set("a", "MIT");
    i.set("b", "Apache-2.0");
    i.clear();
    expect(i.size()).toBe(0);
    expect(i.licenses()).toEqual([]);
  });
});

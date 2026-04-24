/**
 * Tests for the TooltipsProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { tooltipsProvider } from "../TooltipsProvider";

beforeEach(() => {
  tooltipsProvider.unload();
});
afterEach(() => {
  tooltipsProvider.unload();
});

const validEntry = {
  id: "inventory.tab",
  bodyLocalizationKey: "tooltip.inventory.tab.body",
};

describe("TooltipsProvider", () => {
  it("starts unloaded", () => {
    expect(tooltipsProvider.isLoaded()).toBe(false);
    expect(tooltipsProvider.getManifest()).toBeNull();
  });

  it("loadRaw() accepts baseline {enabled:false}", () => {
    const parsed = tooltipsProvider.loadRaw({ enabled: false });
    expect(parsed.enabled).toBe(false);
    expect(parsed.entries).toEqual([]);
    expect(tooltipsProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() accepts a valid entry", () => {
    const parsed = tooltipsProvider.loadRaw({ entries: [validEntry] });
    expect(parsed.entries.length).toBe(1);
    expect(parsed.entries[0].id).toBe("inventory.tab");
  });

  it("loadRaw() rejects duplicate entry ids", () => {
    expect(() =>
      tooltipsProvider.loadRaw({
        entries: [validEntry, { ...validEntry }],
      }),
    ).toThrow();
  });

  it("loadRaw() rejects entry with missing bodyLocalizationKey", () => {
    expect(() =>
      tooltipsProvider.loadRaw({
        entries: [{ id: "something", bodyLocalizationKey: "" }],
      }),
    ).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = tooltipsProvider.loadRaw({ enabled: false });
    tooltipsProvider.unload();
    tooltipsProvider.load(parsed);
    expect(tooltipsProvider.isLoaded()).toBe(true);
  });

  it("hotReload() replaces the manifest", () => {
    tooltipsProvider.loadRaw({ entries: [validEntry] });
    const parsed = tooltipsProvider.loadRaw({ enabled: false });
    tooltipsProvider.hotReload(parsed);
    expect(tooltipsProvider.getManifest()?.enabled).toBe(false);
  });

  it("hotReload(null) clears the manifest", () => {
    tooltipsProvider.loadRaw({ enabled: false });
    tooltipsProvider.hotReload(null);
    expect(tooltipsProvider.isLoaded()).toBe(false);
  });

  it("unload() clears a loaded manifest", () => {
    tooltipsProvider.loadRaw({ enabled: false });
    tooltipsProvider.unload();
    expect(tooltipsProvider.isLoaded()).toBe(false);
  });
});

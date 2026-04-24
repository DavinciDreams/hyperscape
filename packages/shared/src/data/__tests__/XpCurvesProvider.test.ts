/**
 * Tests for the XpCurvesProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { xpCurvesProvider } from "../XpCurvesProvider";

beforeEach(() => {
  xpCurvesProvider.unload();
});
afterEach(() => {
  xpCurvesProvider.unload();
});

const validManifest = [
  {
    id: "combat-standard",
    name: "Combat (Classic RS)",
    description: "",
    kind: "formula" as const,
    formula: "rs-classic" as const,
    maxLevel: 99,
    params: {},
  },
  {
    id: "gathering-short",
    name: "Gathering (Short)",
    description: "",
    kind: "lookup" as const,
    xp: [83, 174, 276, 388],
  },
];

describe("XpCurvesProvider", () => {
  it("starts unloaded with an empty curve list", () => {
    expect(xpCurvesProvider.isLoaded()).toBe(false);
    expect(xpCurvesProvider.getCurves()).toEqual([]);
    expect(xpCurvesProvider.getManifest()).toBeNull();
  });

  it("load() installs an already-validated manifest", () => {
    xpCurvesProvider.load(validManifest);
    expect(xpCurvesProvider.isLoaded()).toBe(true);
    expect(xpCurvesProvider.getCurves()).toEqual(validManifest);
  });

  it("loadRaw() rejects invalid payloads (duplicate ids)", () => {
    const dup = [validManifest[0], validManifest[0]];
    expect(() => xpCurvesProvider.loadRaw(dup)).toThrow();
    expect(xpCurvesProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects invalid payloads (non-monotonic lookup xp)", () => {
    const bad = [
      {
        id: "bad-lookup",
        name: "Bad Lookup",
        description: "",
        kind: "lookup",
        xp: [0, 100, 50],
      },
    ];
    expect(() => xpCurvesProvider.loadRaw(bad)).toThrow();
    expect(xpCurvesProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() accepts valid payload and returns parsed manifest", () => {
    const parsed = xpCurvesProvider.loadRaw(validManifest);
    expect(parsed).toEqual(validManifest);
    expect(xpCurvesProvider.isLoaded()).toBe(true);
  });

  it("hotReload(manifest) replaces the current manifest", () => {
    xpCurvesProvider.load(validManifest);
    const replacement = [validManifest[1]];
    xpCurvesProvider.hotReload(replacement);
    expect(xpCurvesProvider.getCurves()).toEqual(replacement);
  });

  it("hotReload(null) clears", () => {
    xpCurvesProvider.load(validManifest);
    xpCurvesProvider.hotReload(null);
    expect(xpCurvesProvider.isLoaded()).toBe(false);
    expect(xpCurvesProvider.getCurves()).toEqual([]);
  });

  it("unload() resets to default empty state", () => {
    xpCurvesProvider.load(validManifest);
    xpCurvesProvider.unload();
    expect(xpCurvesProvider.isLoaded()).toBe(false);
    expect(xpCurvesProvider.getManifest()).toBeNull();
  });

  it("getCurves() returns [] (not null) when unloaded — safe to iterate", () => {
    const curves = xpCurvesProvider.getCurves();
    expect(Array.isArray(curves)).toBe(true);
    expect(curves.length).toBe(0);
  });
});

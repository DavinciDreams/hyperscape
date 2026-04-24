/**
 * End-to-end vertical-slice integration proof for the xp-curves
 * manifest pipeline.
 *
 * This is the first integration test that walks a real authored
 * manifest file through every link in the chain:
 *
 *   packages/server/world/assets/manifests/xp-curves.json
 *       ↓ parse via xpCurvesProvider.loadRaw   (edge validation)
 *   xpCurvesProvider (singleton)
 *       ↓ xpCurveRegistry.load(provider.getCurves())   (registry seed)
 *   xpCurveRegistry (singleton)
 *       ↓ xpCurveRegistry.xpForLevel(id, L)            (consumer query)
 *   canonical OSRS spot-check: xp(99) === 13_034_431
 *
 * This is the exact chain DataManager.ts runs on boot
 * (both browser fetch path @ line 2085-2089 and Node fs path @
 * line ~4730-4735) and that PIEEditorSession.ts runs on every editor
 * save (@ line 1579). Any regression here breaks level-up resolution
 * across the entire game.
 *
 * When a consumer (`SkillsSystem.generateXPTable`) starts reading
 * through `xpCurveRegistry`, this same test file should grow a
 * per-consumer section — the integration contract is one test per
 * end-to-end slice, not one test per consumer.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { XpCurvesManifest } from "@hyperforge/manifest-schema";

import { xpCurvesProvider } from "../XpCurvesProvider";
import { xpCurveRegistry } from "../../progression/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = path.resolve(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "server",
  "world",
  "assets",
  "manifests",
  "xp-curves.json",
);

/**
 * Canonical OSRS XP spot-checks. These are the values the official
 * Old-School RuneScape wiki publishes and that the existing
 * XPCurveRegistry unit test already asserts. If the file-on-disk
 * diverges from these, everybody's level-up thresholds shift.
 */
const OSRS_SPOT_CHECKS: ReadonlyArray<{ level: number; xp: number }> = [
  { level: 1, xp: 0 },
  { level: 2, xp: 83 },
  { level: 10, xp: 1154 },
  { level: 50, xp: 101_333 },
  { level: 99, xp: 13_034_431 },
];

beforeEach(() => {
  xpCurvesProvider.unload();
  // `xpCurveRegistry.load([])` clears the internal Map;
  // this leaves `isLoaded()` reporting false (empty map).
  xpCurveRegistry.load([]);
});

afterEach(() => {
  xpCurvesProvider.unload();
  xpCurveRegistry.load([]);
});

describe("xp-curves end-to-end pipeline", () => {
  it("authored xp-curves.json parses through the Zod schema via loadRaw", async () => {
    const raw = JSON.parse(await readFile(MANIFEST_PATH, "utf8")) as unknown;
    const parsed = xpCurvesProvider.loadRaw(raw);
    expect(xpCurvesProvider.isLoaded()).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
  });

  it("authored xp-curves.json ships an `osrs-classic` rs-classic curve", async () => {
    const raw = JSON.parse(await readFile(MANIFEST_PATH, "utf8")) as unknown;
    const parsed = xpCurvesProvider.loadRaw(raw);
    const osrs = parsed.find((c) => c.id === "osrs-classic");
    expect(osrs).toBeDefined();
    expect(osrs!.kind).toBe("formula");
    if (osrs!.kind === "formula") {
      expect(osrs!.formula).toBe("rs-classic");
      expect(osrs!.maxLevel).toBe(99);
    }
  });

  it("boot path: file → provider → registry produces canonical OSRS xp values", async () => {
    // Mirrors DataManager.ts @ lines 2085-2089 (browser fetch path)
    // and lines ~4730-4735 (Node fs path):
    //    const parsed = xpCurvesProvider.loadRaw(raw);
    //    xpCurveRegistry.load(parsed);
    const raw = JSON.parse(await readFile(MANIFEST_PATH, "utf8")) as unknown;
    const parsed = xpCurvesProvider.loadRaw(raw);
    xpCurveRegistry.load(parsed);

    expect(xpCurveRegistry.isLoaded()).toBe(true);
    expect(xpCurveRegistry.has("osrs-classic")).toBe(true);
    expect(xpCurveRegistry.maxLevel("osrs-classic")).toBe(99);

    for (const { level, xp } of OSRS_SPOT_CHECKS) {
      expect(xpCurveRegistry.xpForLevel("osrs-classic", level)).toBe(xp);
    }
  });

  it("boot path: levelForXp is symmetric with xpForLevel", async () => {
    const raw = JSON.parse(await readFile(MANIFEST_PATH, "utf8")) as unknown;
    xpCurveRegistry.load(xpCurvesProvider.loadRaw(raw));

    for (const { level, xp } of OSRS_SPOT_CHECKS) {
      // Exactly at threshold → that level.
      expect(xpCurveRegistry.levelForXp("osrs-classic", xp)).toBe(level);
      // One below threshold → previous level (except at L1).
      if (level > 1) {
        expect(xpCurveRegistry.levelForXp("osrs-classic", xp - 1)).toBe(
          level - 1,
        );
      }
    }
  });

  it("unloaded path: registry reports not-loaded so consumers can fall back", () => {
    // No loadRaw called — this mirrors a world where the JSON file
    // is missing or malformed. DataManager logs a warning and leaves
    // the registry untouched; consumers must detect this and fall
    // back to their hardcoded tables.
    expect(xpCurvesProvider.isLoaded()).toBe(false);
    expect(xpCurveRegistry.isLoaded()).toBe(false);
    expect(xpCurveRegistry.has("osrs-classic")).toBe(false);
  });
});

describe("xp-curves PIE hot-reload path", () => {
  /**
   * Mirrors PIEEditorSession.ts @ line 1579:
   *    xpCurvesProvider.hotReload(partial.xpCurves);
   *    xpCurveRegistry.load(partial.xpCurves);
   *
   * The editor publishes an entire new manifest on save. After the
   * round-trip, the registry must reflect the new thresholds without
   * any server restart.
   */
  it("hot-reload replaces the authored curve and the registry updates live", async () => {
    // Boot-load the canonical file first.
    const raw = JSON.parse(await readFile(MANIFEST_PATH, "utf8")) as unknown;
    xpCurveRegistry.load(xpCurvesProvider.loadRaw(raw));
    expect(xpCurveRegistry.xpForLevel("osrs-classic", 99)).toBe(13_034_431);

    // Simulate an editor save that swaps the rs-classic formula for
    // a linear curve with a dramatically different shape.
    const hotManifest: XpCurvesManifest = [
      {
        id: "osrs-classic",
        name: "Linear (editor override)",
        description: "Authored-replacement for hot-reload proof",
        kind: "formula",
        formula: "linear",
        maxLevel: 99,
        params: { base: 100, growth: 50 },
      },
    ];
    xpCurvesProvider.hotReload(hotManifest);
    xpCurveRegistry.load(hotManifest);

    // The new curve must be resolvable under the same id
    // without restart.
    expect(xpCurveRegistry.has("osrs-classic")).toBe(true);
    const beforeXp99 = 13_034_431;
    const afterXp99 = xpCurveRegistry.xpForLevel("osrs-classic", 99);
    expect(afterXp99).not.toBe(beforeXp99);
    // Linear formula with base=100, growth=50 at L99 is a small
    // well-defined value — much less than rs-classic at L99.
    expect(afterXp99).toBeLessThan(1_000_000);
  });

  it("hot-reload of a second curve id does not wipe pre-existing ids", async () => {
    // This is the case where an editor adds a NEW curve without
    // touching the existing one — the registry must end up with
    // BOTH ids resolvable. The PIE path publishes the full manifest
    // each time, so "add" and "edit" look identical to the registry.
    const raw = JSON.parse(await readFile(MANIFEST_PATH, "utf8")) as unknown;
    xpCurveRegistry.load(xpCurvesProvider.loadRaw(raw));

    const combined: XpCurvesManifest = [
      ...xpCurvesProvider.getCurves(),
      {
        id: "mining-custom",
        name: "Mining (Custom Lookup)",
        description: "",
        kind: "lookup",
        xp: [83, 174, 276, 388, 512, 650],
      },
    ];
    xpCurvesProvider.hotReload(combined);
    xpCurveRegistry.load(combined);

    expect(xpCurveRegistry.has("osrs-classic")).toBe(true);
    expect(xpCurveRegistry.has("mining-custom")).toBe(true);
    expect(xpCurveRegistry.xpForLevel("osrs-classic", 99)).toBe(13_034_431);
    expect(xpCurveRegistry.xpForLevel("mining-custom", 2)).toBe(83);
    expect(xpCurveRegistry.xpForLevel("mining-custom", 7)).toBe(650);
    expect(xpCurveRegistry.maxLevel("mining-custom")).toBe(7);
  });

  it("hot-reload with empty array clears every registered curve", () => {
    xpCurveRegistry.load([
      {
        id: "osrs-classic",
        name: "OSRS Classic",
        description: "",
        kind: "formula",
        formula: "rs-classic",
        maxLevel: 99,
        params: {},
      },
    ]);
    expect(xpCurveRegistry.has("osrs-classic")).toBe(true);

    xpCurveRegistry.load([]);
    expect(xpCurveRegistry.isLoaded()).toBe(false);
    expect(xpCurveRegistry.has("osrs-classic")).toBe(false);
  });
});

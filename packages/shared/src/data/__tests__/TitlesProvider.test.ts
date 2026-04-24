/**
 * Tests for the TitlesProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { titlesProvider } from "../TitlesProvider";

beforeEach(() => {
  titlesProvider.unload();
});
afterEach(() => {
  titlesProvider.unload();
});

const validTitle = {
  id: "dragonslayer",
  name: "Dragonslayer",
  displayKey: "title.dragonslayer",
  displayMode: "suffix" as const,
  rarity: "rare" as const,
  unlockConditions: [
    { kind: "bossKillCount" as const, npcId: "elderDragon", requiredKills: 1 },
  ],
};

describe("TitlesProvider", () => {
  it("starts unloaded", () => {
    expect(titlesProvider.isLoaded()).toBe(false);
    expect(titlesProvider.getManifest()).toBeNull();
  });

  it("loadRaw() accepts empty array baseline", () => {
    const parsed = titlesProvider.loadRaw([]);
    expect(parsed).toEqual([]);
    expect(titlesProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() accepts valid title", () => {
    const parsed = titlesProvider.loadRaw([validTitle]);
    expect(parsed.length).toBe(1);
    expect(parsed[0].id).toBe("dragonslayer");
  });

  it("loadRaw() rejects duplicate title ids", () => {
    expect(() =>
      titlesProvider.loadRaw([validTitle, { ...validTitle, name: "Dup" }]),
    ).toThrow();
  });

  it("loadRaw() rejects title with empty unlockConditions", () => {
    expect(() =>
      titlesProvider.loadRaw([{ ...validTitle, unlockConditions: [] }]),
    ).toThrow();
  });

  it("loadRaw() rejects duplicate unlock-condition kinds", () => {
    expect(() =>
      titlesProvider.loadRaw([
        {
          ...validTitle,
          unlockConditions: [
            {
              kind: "bossKillCount" as const,
              npcId: "dragonA",
              requiredKills: 1,
            },
            {
              kind: "bossKillCount" as const,
              npcId: "dragonB",
              requiredKills: 1,
            },
          ],
        },
      ]),
    ).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = titlesProvider.loadRaw([validTitle]);
    titlesProvider.unload();
    titlesProvider.load(parsed);
    expect(titlesProvider.isLoaded()).toBe(true);
  });

  it("hotReload() replaces the manifest", () => {
    titlesProvider.loadRaw([validTitle]);
    const parsed = titlesProvider.loadRaw([]);
    titlesProvider.hotReload(parsed);
    expect(titlesProvider.getManifest()).toEqual([]);
  });

  it("hotReload(null) clears the manifest", () => {
    titlesProvider.loadRaw([validTitle]);
    titlesProvider.hotReload(null);
    expect(titlesProvider.isLoaded()).toBe(false);
  });

  it("unload() clears a loaded manifest", () => {
    titlesProvider.loadRaw([validTitle]);
    titlesProvider.unload();
    expect(titlesProvider.isLoaded()).toBe(false);
  });
});

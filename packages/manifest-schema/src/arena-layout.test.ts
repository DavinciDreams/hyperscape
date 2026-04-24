import { describe, expect, it } from "vitest";

import {
  ArenaLayoutManifestSchema,
  type ArenaLayoutManifest,
} from "./arena-layout.js";

const hyperscapeArenaLayout: ArenaLayoutManifest = {
  $schema: "hyperforge.arena-layout.v1",
  arenaGrid: {
    baseX: 340,
    baseZ: 394,
    baseY: 0.42,
    width: 20,
    length: 24,
    gap: 4,
    columns: 2,
    rows: 3,
    count: 6,
    spawnOffset: 8,
  },
  lobby: {
    centerX: 385,
    centerZ: 376,
    width: 40,
    length: 25,
  },
  hospital: {
    centerX: 345,
    centerZ: 376,
    width: 28,
    length: 23,
  },
  lobbySpawn: {
    x: 385,
    y: 0.42,
    z: 374,
  },
};

describe("ArenaLayoutManifestSchema", () => {
  it("parses the Hyperscape reference manifest cleanly", () => {
    const result = ArenaLayoutManifestSchema.safeParse(hyperscapeArenaLayout);
    if (!result.success) {
      throw new Error(
        `Hyperscape arena-layout manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("rejects zero arena width", () => {
    const bad = {
      ...hyperscapeArenaLayout,
      arenaGrid: { ...hyperscapeArenaLayout.arenaGrid, width: 0 },
    };
    expect(ArenaLayoutManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects non-integer arena columns", () => {
    const bad = {
      ...hyperscapeArenaLayout,
      arenaGrid: { ...hyperscapeArenaLayout.arenaGrid, columns: 2.5 },
    };
    expect(ArenaLayoutManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects wrong schema tag", () => {
    const bad = { ...hyperscapeArenaLayout, $schema: "wrong.tag.v1" };
    expect(ArenaLayoutManifestSchema.safeParse(bad).success).toBe(false);
  });
});

/**
 * Faithfulness test: the duel-arenas manifest shape (arenas grid +
 * lobby/hospital + visual constants) MUST parse cleanly.
 */

import { describe, expect, it } from "vitest";

import {
  DuelArenasManifestSchema,
  type DuelArenasManifest,
} from "./duel-arenas.js";

const reference: DuelArenasManifest = {
  arenas: [
    {
      arenaId: 1,
      center: { x: 0, z: 0 },
      size: 20,
      spawnPoints: [
        { x: -5, y: 0, z: 0 },
        { x: 5, y: 0, z: 0 },
      ],
      trapdoorPositions: [
        { x: -8, z: 0 },
        { x: 8, z: 0 },
      ],
    },
    {
      arenaId: 2,
      center: { x: 40, z: 0 },
      size: 20,
      spawnPoints: [{ x: 40, y: 0, z: 0 }],
      trapdoorPositions: [],
    },
  ],
  lobby: {
    center: { x: 0, z: -40 },
    size: { width: 20, depth: 20 },
    spawnPoint: { x: 0, y: 0, z: -40 },
  },
  hospital: {
    center: { x: 0, z: 40 },
    size: { width: 10, depth: 10 },
    spawnPoint: { x: 0, y: 0, z: 40 },
  },
  constants: {
    arenaSize: 20,
    wallHeight: 3,
    wallThickness: 0.5,
    floorColor: "#3a3a3a",
    wallColor: "#555555",
    trapdoorColor: "#222222",
  },
};

describe("DuelArenasManifestSchema", () => {
  it("parses the reference manifest cleanly", () => {
    const result = DuelArenasManifestSchema.safeParse(reference);
    if (!result.success) {
      throw new Error(
        `Reference manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("rejects empty arenas array", () => {
    const bad = { ...reference, arenas: [] };
    const result = DuelArenasManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects an arena with zero spawn points", () => {
    const bad: DuelArenasManifest = {
      ...reference,
      arenas: [{ ...reference.arenas[0], spawnPoints: [] as never }],
    };
    const result = DuelArenasManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects non-positive arena size", () => {
    const bad: DuelArenasManifest = {
      ...reference,
      arenas: [{ ...reference.arenas[0], size: 0 }],
    };
    const result = DuelArenasManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects non-positive wallHeight in constants", () => {
    const bad: DuelArenasManifest = {
      ...reference,
      constants: { ...reference.constants, wallHeight: 0 },
    };
    const result = DuelArenasManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});

/**
 * Faithfulness test: a representative music manifest (intro theme, ambient
 * overworld, combat sting) MUST parse cleanly.
 */

import { describe, expect, it } from "vitest";

import { MusicManifestSchema, type MusicManifest } from "./music.js";

const reference: MusicManifest = [
  {
    id: "theme_intro",
    name: "Hyperscape Theme",
    type: "theme",
    category: "intro",
    path: "asset://music/theme_intro.ogg",
    description: "Main menu theme",
    duration: 124,
    mood: "heroic",
  },
  {
    id: "ambient_forest",
    name: "Forest Wander",
    type: "ambient",
    category: "normal",
    path: "asset://music/ambient_forest.ogg",
    description: "Woodland ambient loop",
    duration: 180,
    mood: "serene",
  },
  {
    id: "combat_sting_a",
    name: "Combat Sting A",
    type: "combat",
    category: "combat",
    path: "asset://music/combat_sting_a.ogg",
    description: "Short stinger at engagement",
    duration: 8,
    mood: "tense",
  },
];

describe("MusicManifestSchema", () => {
  it("parses the reference manifest cleanly", () => {
    const result = MusicManifestSchema.safeParse(reference);
    if (!result.success) {
      throw new Error(
        `Reference manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("rejects unknown track type", () => {
    const bad = [{ ...reference[0], type: "jingle" }];
    const result = MusicManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects unknown category", () => {
    const bad = [{ ...reference[0], category: "boss" }];
    const result = MusicManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects negative duration", () => {
    const bad = [{ ...reference[0], duration: -1 }];
    const result = MusicManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects empty path", () => {
    const bad = [{ ...reference[0], path: "" }];
    const result = MusicManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});

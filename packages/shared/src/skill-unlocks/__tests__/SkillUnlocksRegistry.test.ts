import { SkillUnlocksManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import {
  SkillUnlocksNotLoadedError,
  SkillUnlocksRegistry,
} from "../SkillUnlocksRegistry.js";

function manifest() {
  return SkillUnlocksManifestSchema.parse({
    skills: {
      woodcutting: [
        { level: 1, description: "Chop normal trees", type: "activity" },
        { level: 15, description: "Chop oak trees", type: "activity" },
        { level: 30, description: "Chop willow trees", type: "activity" },
      ],
      attack: [
        { level: 20, description: "Wield mithril weapons", type: "item" },
      ],
    },
  });
}

describe("SkillUnlocksRegistry — not loaded", () => {
  it("throws pre-load", () => {
    expect(() => new SkillUnlocksRegistry().manifest).toThrow(
      SkillUnlocksNotLoadedError,
    );
  });
});

describe("SkillUnlocksRegistry — lookup", () => {
  it("returns unlocks for known skill", () => {
    const r = new SkillUnlocksRegistry(manifest());
    expect(r.forSkill("woodcutting").length).toBe(3);
    expect(r.hasSkill("attack")).toBe(true);
  });

  it("returns empty array for unknown", () => {
    const r = new SkillUnlocksRegistry(manifest());
    expect(r.forSkill("ghost")).toEqual([]);
    expect(r.hasSkill("ghost")).toBe(false);
  });
});

describe("SkillUnlocksRegistry — filters", () => {
  it("atLevel returns exact matches", () => {
    const r = new SkillUnlocksRegistry(manifest());
    expect(r.atLevel("woodcutting", 15).map((e) => e.description)).toEqual([
      "Chop oak trees",
    ]);
    expect(r.atLevel("woodcutting", 2)).toEqual([]);
  });

  it("upToLevel returns cumulative", () => {
    const r = new SkillUnlocksRegistry(manifest());
    expect(r.upToLevel("woodcutting", 20).map((e) => e.level)).toEqual([1, 15]);
  });

  it("nextUnlock returns next upcoming", () => {
    const r = new SkillUnlocksRegistry(manifest());
    expect(r.nextUnlock("woodcutting", 15)?.level).toBe(30);
    expect(r.nextUnlock("woodcutting", 30)).toBeNull();
    expect(r.nextUnlock("woodcutting", 0)?.level).toBe(1);
  });
});

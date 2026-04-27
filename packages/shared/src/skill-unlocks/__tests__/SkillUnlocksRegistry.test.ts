import { SkillUnlocksManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it, vi } from "vitest";
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

describe("SkillUnlocksRegistry — onReloaded", () => {
  it("fires after every successful load()", () => {
    const r = new SkillUnlocksRegistry();
    const cb = vi.fn();
    r.onReloaded(cb);
    r.load(manifest());
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("returned unsubscribe stops further notifications", () => {
    const r = new SkillUnlocksRegistry();
    const cb = vi.fn();
    const off = r.onReloaded(cb);
    r.load(manifest());
    off();
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("a throwing listener does not break subsequent listeners", () => {
    const r = new SkillUnlocksRegistry();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const bad = vi.fn(() => {
      throw new Error("listener boom");
    });
    const good = vi.fn();
    r.onReloaded(bad);
    r.onReloaded(good);
    r.load(manifest());
    expect(bad).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

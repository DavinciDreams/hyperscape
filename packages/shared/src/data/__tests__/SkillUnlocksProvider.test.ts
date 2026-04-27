/**
 * Tests for the SkillUnlocksProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { skillUnlocksProvider } from "../SkillUnlocksProvider";

beforeEach(() => {
  skillUnlocksProvider.unload();
});
afterEach(() => {
  skillUnlocksProvider.unload();
});

const baseline = {
  skills: {},
};

describe("SkillUnlocksProvider", () => {
  it("starts unloaded", () => {
    expect(skillUnlocksProvider.isLoaded()).toBe(false);
    expect(skillUnlocksProvider.getManifest()).toBeNull();
  });

  it("loadRaw() accepts empty skills baseline", () => {
    const parsed = skillUnlocksProvider.loadRaw(baseline);
    expect(parsed.skills).toEqual({});
  });

  it("loadRaw() accepts $schema + _comment passthrough fields", () => {
    const parsed = skillUnlocksProvider.loadRaw({
      $schema: "hyperforge.skill-unlocks.v1",
      _comment: "tile-based-MMORPG-style level unlocks",
      skills: {},
    });
    expect(parsed.$schema).toBe("hyperforge.skill-unlocks.v1");
    expect(parsed._comment).toBe("tile-based-MMORPG-style level unlocks");
  });

  it("loadRaw() accepts skill unlock entries", () => {
    const parsed = skillUnlocksProvider.loadRaw({
      skills: {
        attack: [
          { level: 10, description: "Can wield steel weapons", type: "item" },
          { level: 50, description: "Unlock dual-wield", type: "ability" },
        ],
      },
    });
    expect(parsed.skills.attack!.length).toBe(2);
    expect(parsed.skills.attack![0].type).toBe("item");
  });

  it("loadRaw() rejects level below 1", () => {
    expect(() =>
      skillUnlocksProvider.loadRaw({
        skills: {
          attack: [{ level: 0, description: "bad", type: "item" }],
        },
      }),
    ).toThrow();
  });

  it("loadRaw() rejects invalid unlock type", () => {
    expect(() =>
      skillUnlocksProvider.loadRaw({
        skills: {
          attack: [{ level: 5, description: "bad", type: "unknown" }],
        },
      }),
    ).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = skillUnlocksProvider.loadRaw(baseline);
    skillUnlocksProvider.unload();
    skillUnlocksProvider.load(parsed);
    expect(skillUnlocksProvider.isLoaded()).toBe(true);
  });

  it("hotReload(null) clears the manifest", () => {
    skillUnlocksProvider.loadRaw(baseline);
    skillUnlocksProvider.hotReload(null);
    expect(skillUnlocksProvider.isLoaded()).toBe(false);
  });

  it("singleton returns the same instance", () => {
    expect(skillUnlocksProvider).toBe(skillUnlocksProvider);
  });
});

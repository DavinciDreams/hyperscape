/**
 * Hot-reload tests for `skill-unlocks`.
 *
 * Verifies that calling `loadSkillUnlocks(manifest)` after a prior
 * load clears the previous entries and re-populates from the new
 * manifest — the semantics `PIEEditorSession.updateManifests` relies
 * on to push editor edits into a running PIE session without a
 * Stop → Play cycle.
 */

import { describe, expect, it } from "vitest";

import type { SkillUnlocksManifest } from "@hyperforge/manifest-schema";

import {
  loadSkillUnlocks,
  getUnlocksForSkill,
  isSkillUnlocksLoaded,
} from "../skill-unlocks.js";

// The runtime schema requires `type` on every entry (one of
// "item"|"ability"|"area"|"quest"|"activity"). Fixtures default it to
// "ability" unless overridden — the normalization + sort logic is
// independent of the `type` value.
const fixture = (
  skills: Record<
    string,
    Array<{
      level: number;
      description: string;
      type?: "item" | "ability" | "area" | "quest" | "activity";
    }>
  >,
): SkillUnlocksManifest => ({
  skills: Object.fromEntries(
    Object.entries(skills).map(([skill, entries]) => [
      skill,
      entries.map((e) => ({
        level: e.level,
        description: e.description,
        type: e.type ?? "ability",
      })),
    ]),
  ),
});

describe("skill-unlocks hot-reload", () => {
  it("loadSkillUnlocks replaces the prior unlock set", () => {
    loadSkillUnlocks(
      fixture({
        attack: [{ level: 5, description: "Can equip bronze dagger" }],
      }),
    );
    expect(isSkillUnlocksLoaded()).toBe(true);
    expect(getUnlocksForSkill("attack")).toHaveLength(1);
    expect(getUnlocksForSkill("attack")[0].description).toBe(
      "Can equip bronze dagger",
    );

    // Reload with a manifest that does not include "attack" — the prior
    // entry must vanish, not linger.
    loadSkillUnlocks(
      fixture({
        strength: [{ level: 10, description: "Strength unlock" }],
      }),
    );
    expect(getUnlocksForSkill("attack")).toEqual([]);
    expect(getUnlocksForSkill("strength")).toHaveLength(1);
  });

  it("same-skill reload overwrites levels + descriptions", () => {
    loadSkillUnlocks(
      fixture({
        mining: [
          { level: 1, description: "Can mine copper" },
          { level: 15, description: "Can mine iron" },
        ],
      }),
    );
    expect(getUnlocksForSkill("mining")).toHaveLength(2);

    loadSkillUnlocks(
      fixture({
        mining: [{ level: 15, description: "REWRITTEN: Can mine iron" }],
      }),
    );
    const after = getUnlocksForSkill("mining");
    expect(after).toHaveLength(1);
    expect(after[0].description).toBe("REWRITTEN: Can mine iron");
  });

  it("British→American defence→defense normalization runs on every reload", () => {
    loadSkillUnlocks(
      fixture({
        defence: [{ level: 5, description: "Can equip bronze shield" }],
      }),
    );
    // British key is moved under the American key on load. Both queries
    // hit the same underlying entries via case-insensitive lookup; the
    // American-spelled lookup is the supported public API.
    expect(getUnlocksForSkill("defense")).toHaveLength(1);
    expect(getUnlocksForSkill("defense")[0].description).toBe(
      "Can equip bronze shield",
    );

    // Reload with pure British again — normalization must re-apply;
    // state should NOT retain the previous load's American entry now
    // that the new manifest reshaped the data.
    loadSkillUnlocks(
      fixture({
        defence: [{ level: 10, description: "Can equip iron shield" }],
      }),
    );
    expect(getUnlocksForSkill("defense")).toHaveLength(1);
    expect(getUnlocksForSkill("defense")[0].description).toBe(
      "Can equip iron shield",
    );
  });

  it("entries are sorted ascending by level after load", () => {
    loadSkillUnlocks(
      fixture({
        woodcutting: [
          { level: 30, description: "Willow" },
          { level: 1, description: "Tree" },
          { level: 15, description: "Oak" },
        ],
      }),
    );
    const levels = getUnlocksForSkill("woodcutting").map((u) => u.level);
    expect(levels).toEqual([1, 15, 30]);
  });
});

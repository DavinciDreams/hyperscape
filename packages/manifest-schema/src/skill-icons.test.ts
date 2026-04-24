import { describe, expect, it } from "vitest";

import {
  SkillIconsManifestSchema,
  type SkillIconsManifest,
} from "./skill-icons.js";

const hyperscapeSkillIcons: SkillIconsManifest = {
  $schema: "hyperforge.skill-icons.v1",
  definitions: [
    {
      key: "attack",
      label: "Attack",
      icon: "sword",
      category: "combat",
      defaultLevel: 1,
    },
    {
      key: "constitution",
      label: "Constitution",
      icon: "heart",
      category: "combat",
      defaultLevel: 10,
    },
  ],
  icons: {
    attack: "sword",
    strength: "flex",
    defence: "shield",
    defense: "shield",
  },
  fallbackIcon: "star",
};

describe("SkillIconsManifestSchema", () => {
  it("parses a realistic manifest cleanly", () => {
    const result = SkillIconsManifestSchema.safeParse(hyperscapeSkillIcons);
    if (!result.success) {
      throw new Error(
        `Skill icons manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("rejects empty definitions", () => {
    const bad = { ...hyperscapeSkillIcons, definitions: [] };
    expect(SkillIconsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects out-of-range default level", () => {
    const bad = {
      ...hyperscapeSkillIcons,
      definitions: [
        {
          key: "attack",
          label: "Attack",
          icon: "sword",
          category: "combat" as const,
          defaultLevel: 150,
        },
      ],
    };
    expect(SkillIconsManifestSchema.safeParse(bad).success).toBe(false);
  });
});

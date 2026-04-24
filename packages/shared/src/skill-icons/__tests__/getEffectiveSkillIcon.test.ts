/**
 * getEffectiveSkillIcon — shared registry-prefer-fallback helper.
 *
 * Pure unit test. Consumer wiring (XPDropSystem, future HUD/skill-panel
 * rows) inherits these semantics — no need to drive the system stack
 * to assert the registry-prefer branch behaves correctly.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  SkillIconsManifestSchema,
  type SkillIconsManifest,
} from "@hyperforge/manifest-schema";

import { getEffectiveSkillIcon, skillIconsRegistry } from "../index.js";

function buildManifest(
  overrides?: Partial<SkillIconsManifest>,
): SkillIconsManifest {
  return SkillIconsManifestSchema.parse({
    $schema: "hyperforge.skill-icons.v1",
    fallbackIcon: "🎯",
    icons: {
      attack: "⚔️",
      magic: "🔮",
    },
    definitions: [
      {
        key: "attack",
        label: "Attack",
        category: "combat",
        icon: "⚔️",
        defaultLevel: 1,
      },
      {
        key: "magic",
        label: "Magic",
        category: "combat",
        icon: "🔮",
        defaultLevel: 1,
      },
    ],
    ...overrides,
  });
}

describe("getEffectiveSkillIcon", () => {
  beforeEach(() => {
    skillIconsRegistry._unloadForTests();
  });

  afterEach(() => {
    skillIconsRegistry._unloadForTests();
  });

  it("when registry loaded, returns the registry's icon for known skills", () => {
    skillIconsRegistry.load(buildManifest());
    expect(getEffectiveSkillIcon("attack")).toBe("⚔️");
    expect(getEffectiveSkillIcon("magic")).toBe("🔮");
  });

  it("normalizes skill key to lowercase before lookup", () => {
    skillIconsRegistry.load(buildManifest());
    expect(getEffectiveSkillIcon("Attack")).toBe("⚔️");
    expect(getEffectiveSkillIcon("MAGIC")).toBe("🔮");
  });

  it("when registry loaded but skill missing, returns the registry's fallbackIcon (NOT the legacy fallback)", () => {
    skillIconsRegistry.load(buildManifest({ fallbackIcon: "🎯" }));
    // Critical: a loaded-but-missing registry uses the AUTHORED
    // fallback, not whatever the legacy constant defaults to.
    expect(getEffectiveSkillIcon("not_a_skill")).toBe("🎯");
  });

  it("when registry unloaded, falls back to in-tree SKILL_ICONS + legacy fallbackIcon", () => {
    expect(skillIconsRegistry.isLoaded()).toBe(false);
    // The in-tree SKILL_ICONS is populated at module load from the
    // bundled JSON, so common skills resolve via the fallback.
    const icon = getEffectiveSkillIcon("attack");
    expect(typeof icon).toBe("string");
    expect(icon.length).toBeGreaterThan(0);
  });

  it("hot-reload: subsequent calls honor a re-loaded registry", () => {
    skillIconsRegistry.load(buildManifest());
    expect(getEffectiveSkillIcon("attack")).toBe("⚔️");

    // Author retheme: same key, new icon.
    skillIconsRegistry.load(
      SkillIconsManifestSchema.parse({
        $schema: "hyperforge.skill-icons.v1",
        fallbackIcon: "🎯",
        icons: { attack: "🗡️" },
        definitions: [
          {
            key: "attack",
            label: "Attack",
            category: "combat",
            icon: "🗡️",
            defaultLevel: 1,
          },
        ],
      }),
    );
    expect(getEffectiveSkillIcon("attack")).toBe("🗡️");
  });
});

/**
 * Tests for the SkillIconsProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { skillIconsProvider } from "../SkillIconsProvider";

beforeEach(() => {
  skillIconsProvider.unload();
});
afterEach(() => {
  skillIconsProvider.unload();
});

const baseline = {
  $schema: "hyperforge.skill-icons.v1" as const,
  definitions: [
    {
      key: "attack",
      label: "Attack",
      icon: "⚔️",
      category: "combat" as const,
      defaultLevel: 1,
    },
  ],
  icons: { attack: "⚔️" },
  fallbackIcon: "❓",
};

describe("SkillIconsProvider", () => {
  it("starts unloaded", () => {
    expect(skillIconsProvider.isLoaded()).toBe(false);
    expect(skillIconsProvider.getManifest()).toBeNull();
  });

  it("loadRaw() rejects {} baseline — $schema/definitions/icons/fallbackIcon required", () => {
    expect(() => skillIconsProvider.loadRaw({})).toThrow();
  });

  it("loadRaw() rejects empty definitions array", () => {
    expect(() =>
      skillIconsProvider.loadRaw({
        ...baseline,
        definitions: [],
      }),
    ).toThrow();
  });

  it("loadRaw() accepts a minimal valid manifest", () => {
    const parsed = skillIconsProvider.loadRaw(baseline);
    expect(parsed.$schema).toBe("hyperforge.skill-icons.v1");
    expect(parsed.definitions.length).toBe(1);
    expect(parsed.fallbackIcon).toBe("❓");
  });

  it("loadRaw() rejects defaultLevel out of range", () => {
    expect(() =>
      skillIconsProvider.loadRaw({
        ...baseline,
        definitions: [{ ...baseline.definitions[0], defaultLevel: 100 }],
      }),
    ).toThrow();
  });

  it("loadRaw() rejects invalid category", () => {
    expect(() =>
      skillIconsProvider.loadRaw({
        ...baseline,
        definitions: [{ ...baseline.definitions[0], category: "invalid" }],
      }),
    ).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = skillIconsProvider.loadRaw(baseline);
    skillIconsProvider.unload();
    skillIconsProvider.load(parsed);
    expect(skillIconsProvider.isLoaded()).toBe(true);
  });

  it("hotReload(null) clears the manifest", () => {
    skillIconsProvider.loadRaw(baseline);
    skillIconsProvider.hotReload(null);
    expect(skillIconsProvider.isLoaded()).toBe(false);
  });

  it("singleton returns the same instance", () => {
    expect(skillIconsProvider).toBe(skillIconsProvider);
  });
});

import { SkillIconsManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import {
  SkillIconsNotLoadedError,
  SkillIconsRegistry,
  UnknownSkillDefinitionError,
} from "../SkillIconsRegistry.js";

function manifest() {
  return SkillIconsManifestSchema.parse({
    $schema: "hyperforge.skill-icons.v1",
    definitions: [
      {
        key: "attack",
        label: "Attack",
        icon: "⚔️",
        category: "combat",
        defaultLevel: 1,
      },
      {
        key: "constitution",
        label: "Constitution",
        icon: "❤️",
        category: "combat",
        defaultLevel: 10,
      },
      {
        key: "woodcutting",
        label: "Woodcutting",
        icon: "🪓",
        category: "gathering",
        defaultLevel: 1,
      },
      {
        key: "smithing",
        label: "Smithing",
        icon: "🔨",
        category: "production",
        defaultLevel: 1,
      },
    ],
    icons: {
      attack: "⚔️",
      constitution: "❤️",
      hp: "❤️",
      woodcutting: "🪓",
      wc: "🪓",
    },
    fallbackIcon: "❓",
  });
}

describe("SkillIconsRegistry — not loaded", () => {
  it("throws pre-load", () => {
    expect(() => new SkillIconsRegistry().manifest).toThrow(
      SkillIconsNotLoadedError,
    );
  });
});

describe("SkillIconsRegistry — definitions", () => {
  it("looks up by key", () => {
    const r = new SkillIconsRegistry(manifest());
    expect(r.definition("constitution").defaultLevel).toBe(10);
    expect(r.hasDefinition("attack")).toBe(true);
  });

  it("throws on unknown", () => {
    const r = new SkillIconsRegistry(manifest());
    expect(() => r.definition("ghost")).toThrow(UnknownSkillDefinitionError);
  });

  it("filters by category", () => {
    const r = new SkillIconsRegistry(manifest());
    expect(r.byCategory("combat").map((d) => d.key)).toEqual([
      "attack",
      "constitution",
    ]);
    expect(r.byCategory("production").map((d) => d.key)).toEqual(["smithing"]);
  });
});

describe("SkillIconsRegistry — icons", () => {
  it("case-insensitive lookup", () => {
    const r = new SkillIconsRegistry(manifest());
    expect(r.iconFor("Attack")).toBe("⚔️");
    expect(r.iconFor("HP")).toBe("❤️");
  });

  it("falls back when unknown", () => {
    const r = new SkillIconsRegistry(manifest());
    expect(r.iconFor("madeUp")).toBe("❓");
    expect(r.fallbackIcon).toBe("❓");
  });
});

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

describe("SkillIconsRegistry — onReloaded() reload listeners", () => {
  it("fires after every load() and honors unsubscribe", () => {
    const r = new SkillIconsRegistry();
    let count = 0;
    const unsubscribe = r.onReloaded(() => {
      count += 1;
    });
    r.load(manifest());
    r.load(manifest());
    expect(count).toBe(2);
    unsubscribe();
    r.load(manifest());
    expect(count).toBe(2);
  });

  it("loadFromJson() also triggers the listener", () => {
    const r = new SkillIconsRegistry();
    let fired = false;
    r.onReloaded(() => {
      fired = true;
    });
    r.loadFromJson(manifest());
    expect(fired).toBe(true);
  });

  it("a throwing listener does not break sibling listeners", () => {
    const r = new SkillIconsRegistry();
    const seen: string[] = [];
    r.onReloaded(() => {
      throw new Error("boom");
    });
    r.onReloaded(() => seen.push("ok"));
    r.load(manifest());
    expect(seen).toEqual(["ok"]);
  });
});

import { ToolsManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it, vi } from "vitest";
import {
  ToolsNotLoadedError,
  ToolsRegistry,
  UnknownToolError,
} from "../ToolsRegistry.js";

function manifest() {
  return ToolsManifestSchema.parse([
    {
      itemId: "bronze_axe",
      skill: "woodcutting",
      tier: "bronze",
      levelRequired: 1,
      priority: 1,
    },
    {
      itemId: "iron_axe",
      skill: "woodcutting",
      tier: "iron",
      levelRequired: 1,
      priority: 2,
    },
    {
      itemId: "steel_axe",
      skill: "woodcutting",
      tier: "steel",
      levelRequired: 6,
      priority: 3,
    },
    {
      itemId: "mithril_axe",
      skill: "woodcutting",
      tier: "mithril",
      levelRequired: 21,
      priority: 4,
    },
    {
      itemId: "bronze_pickaxe",
      skill: "mining",
      tier: "bronze",
      levelRequired: 1,
      priority: 1,
    },
  ]);
}

describe("ToolsRegistry", () => {
  it("throws pre-load", () => {
    expect(() => new ToolsRegistry().manifest).toThrow(ToolsNotLoadedError);
  });

  it("indexes by itemId", () => {
    const r = new ToolsRegistry(manifest());
    expect(r.get("bronze_axe").tier).toBe("bronze");
    expect(r.has("iron_axe")).toBe(true);
    expect(() => r.get("ghost")).toThrow(UnknownToolError);
  });

  it("forSkill filters by skill", () => {
    const r = new ToolsRegistry(manifest());
    expect(r.forSkill("mining").map((t) => t.itemId)).toEqual([
      "bronze_pickaxe",
    ]);
    expect(r.forSkill("woodcutting")).toHaveLength(4);
  });

  it("usableAt respects level requirement", () => {
    const r = new ToolsRegistry(manifest());
    expect(
      r
        .usableAt("woodcutting", 1)
        .map((t) => t.itemId)
        .sort(),
    ).toEqual(["bronze_axe", "iron_axe"]);
    expect(
      r
        .usableAt("woodcutting", 10)
        .map((t) => t.itemId)
        .sort(),
    ).toEqual(["bronze_axe", "iron_axe", "steel_axe"]);
  });

  it("bestOwned picks highest-priority eligible tool", () => {
    const r = new ToolsRegistry(manifest());
    const owned = new Set(["bronze_axe", "iron_axe", "steel_axe"]);
    expect(r.bestOwned("woodcutting", 6, owned)?.itemId).toBe("steel_axe");
    // Level too low to use steel
    expect(r.bestOwned("woodcutting", 5, owned)?.itemId).toBe("iron_axe");
    // No owned tool
    expect(r.bestOwned("woodcutting", 99, new Set())).toBeUndefined();
  });
});

describe("ToolsRegistry — onReloaded", () => {
  it("fires after every successful load()", () => {
    const r = new ToolsRegistry();
    const cb = vi.fn();
    r.onReloaded(cb);
    r.load(manifest());
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("returned unsubscribe stops further notifications", () => {
    const r = new ToolsRegistry();
    const cb = vi.fn();
    const off = r.onReloaded(cb);
    r.load(manifest());
    off();
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("a throwing listener does not break subsequent listeners", () => {
    const r = new ToolsRegistry();
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

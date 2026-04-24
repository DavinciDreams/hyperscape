/**
 * Tests for NpcDialogueBindings manifest schema.
 */
import { describe, expect, it } from "vitest";

import { NpcDialogueBindingsManifestSchema } from "./npc-dialogue-bindings.js";

describe("NpcDialogueBindingsManifestSchema", () => {
  it("accepts an empty mapping", () => {
    const parsed = NpcDialogueBindingsManifestSchema.parse({});
    expect(parsed).toEqual({});
  });

  it("accepts a standard npcId → treeId map", () => {
    const input = {
      "guard.alpha": "guard-default",
      merchant_01: "merchant-intro",
      king: "throne-room-greeting",
    };
    const parsed = NpcDialogueBindingsManifestSchema.parse(input);
    expect(parsed).toEqual(input);
  });

  it("rejects empty npcId keys", () => {
    expect(() =>
      NpcDialogueBindingsManifestSchema.parse({ "": "tree" }),
    ).toThrow();
  });

  it("rejects empty treeId values", () => {
    expect(() =>
      NpcDialogueBindingsManifestSchema.parse({ guard: "" }),
    ).toThrow();
  });

  it("rejects non-string treeId values", () => {
    expect(() =>
      NpcDialogueBindingsManifestSchema.parse({ guard: 42 }),
    ).toThrow();
  });

  it("rejects arrays (not a record)", () => {
    expect(() =>
      NpcDialogueBindingsManifestSchema.parse(["guard", "tree"]),
    ).toThrow();
  });
});

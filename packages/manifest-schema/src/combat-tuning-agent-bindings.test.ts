import { describe, expect, it } from "vitest";

import { CombatTuningAgentBindingsManifestSchema } from "./combat-tuning-agent-bindings.js";

describe("CombatTuningAgentBindingsManifestSchema", () => {
  it("accepts an empty record", () => {
    const result = CombatTuningAgentBindingsManifestSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts string profile ids", () => {
    const result = CombatTuningAgentBindingsManifestSchema.safeParse({
      "char-1": "aggressive-melee",
      "char-2": "defensive-ranged",
    });
    expect(result.success).toBe(true);
  });

  it("accepts null to explicitly clear a binding", () => {
    const result = CombatTuningAgentBindingsManifestSchema.safeParse({
      "char-1": "aggressive-melee",
      "char-2": null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty characterId keys", () => {
    const result = CombatTuningAgentBindingsManifestSchema.safeParse({
      "": "profile-a",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty-string profileIds (use null to clear)", () => {
    const result = CombatTuningAgentBindingsManifestSchema.safeParse({
      "char-1": "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-string, non-null values", () => {
    const result = CombatTuningAgentBindingsManifestSchema.safeParse({
      "char-1": 42,
    });
    expect(result.success).toBe(false);
  });

  it("rejects array payloads", () => {
    const result = CombatTuningAgentBindingsManifestSchema.safeParse([
      "char-1",
      "profile-a",
    ]);
    expect(result.success).toBe(false);
  });
});

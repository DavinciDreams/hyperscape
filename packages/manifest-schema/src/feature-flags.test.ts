import { describe, expect, it } from "vitest";
import {
  BooleanFlagBodySchema,
  FeatureFlagSchema,
  FeatureFlagsManifestSchema,
  MutexGroupSchema,
  TargetingRuleSchema,
  VariantFlagBodySchema,
} from "./feature-flags.js";

describe("TargetingRuleSchema", () => {
  it("accepts a minimal rule", () => {
    const r = TargetingRuleSchema.parse({ id: "everyone" });
    expect(r.rolloutPercent).toBe(100);
    expect(r.platforms).toEqual([]);
  });

  it("rejects rolloutPercent > 100", () => {
    expect(() =>
      TargetingRuleSchema.parse({ id: "r", rolloutPercent: 200 }),
    ).toThrow();
  });

  it("accepts platform array", () => {
    const r = TargetingRuleSchema.parse({
      id: "mobileOnly",
      platforms: ["ios", "android"],
    });
    expect(r.platforms).toEqual(["ios", "android"]);
  });

  it("rejects unknown platform", () => {
    expect(() =>
      TargetingRuleSchema.parse({
        id: "r",
        platforms: ["playstation"],
      }),
    ).toThrow();
  });
});

describe("BooleanFlagBodySchema", () => {
  it("accepts a minimal boolean flag body", () => {
    const b = BooleanFlagBodySchema.parse({ kind: "boolean" });
    expect(b.defaultValue).toBe(false);
    expect(b.enabledValue).toBe(true);
  });
});

describe("VariantFlagBodySchema", () => {
  it("accepts valid variant body", () => {
    const b = VariantFlagBodySchema.parse({
      kind: "variant",
      variants: [{ value: "controlA" }, { value: "variantB" }],
      defaultVariantValue: "controlA",
      assignments: [{ ruleId: "betaCohort", variantValue: "variantB" }],
    });
    expect(b.assignments).toHaveLength(1);
  });

  it("rejects defaultVariantValue not in variants", () => {
    expect(() =>
      VariantFlagBodySchema.parse({
        kind: "variant",
        variants: [{ value: "a" }],
        defaultVariantValue: "ghost",
      }),
    ).toThrow(/defaultVariantValue/);
  });

  it("rejects duplicate variant values", () => {
    expect(() =>
      VariantFlagBodySchema.parse({
        kind: "variant",
        variants: [{ value: "a" }, { value: "a" }],
        defaultVariantValue: "a",
      }),
    ).toThrow(/unique/);
  });

  it("rejects assignment with unknown variantValue", () => {
    expect(() =>
      VariantFlagBodySchema.parse({
        kind: "variant",
        variants: [{ value: "a" }],
        defaultVariantValue: "a",
        assignments: [{ ruleId: "r1", variantValue: "zzz" }],
      }),
    ).toThrow(/declared in variants/);
  });

  it("rejects invalid variant value casing", () => {
    expect(() =>
      VariantFlagBodySchema.parse({
        kind: "variant",
        variants: [{ value: "ControlA" }],
        defaultVariantValue: "ControlA",
      }),
    ).toThrow(/lowerCamelCase/);
  });
});

describe("FeatureFlagSchema", () => {
  it("accepts a boolean flag", () => {
    const f = FeatureFlagSchema.parse({
      id: "newChatUi",
      name: "New Chat UI",
      body: { kind: "boolean" },
    });
    expect(f.enabled).toBe(true);
  });

  it("accepts a variant flag", () => {
    const f = FeatureFlagSchema.parse({
      id: "loadingScreen",
      name: "Loading Screen",
      body: {
        kind: "variant",
        variants: [{ value: "classic" }, { value: "modern" }],
        defaultVariantValue: "classic",
      },
    });
    expect(f.body.kind).toBe("variant");
  });
});

describe("MutexGroupSchema", () => {
  it("accepts a valid group", () => {
    const g = MutexGroupSchema.parse({
      id: "uiRedesigns",
      name: "UI Redesigns",
      flagIds: ["uiV2", "uiV3"],
    });
    expect(g.flagIds).toHaveLength(2);
  });

  it("rejects singleton group", () => {
    expect(() =>
      MutexGroupSchema.parse({
        id: "x",
        name: "x",
        flagIds: ["onlyOne"],
      }),
    ).toThrow();
  });

  it("rejects duplicate flagIds", () => {
    expect(() =>
      MutexGroupSchema.parse({
        id: "x",
        name: "x",
        flagIds: ["a", "a"],
      }),
    ).toThrow(/unique/);
  });
});

describe("FeatureFlagsManifestSchema", () => {
  it("accepts an empty disabled manifest", () => {
    const m = FeatureFlagsManifestSchema.parse({ enabled: false });
    expect(m.flags).toEqual([]);
  });

  it("accepts a manifest with flags + rules", () => {
    const m = FeatureFlagsManifestSchema.parse({
      rules: [{ id: "beta" }],
      flags: [
        {
          id: "newHud",
          name: "New HUD",
          body: {
            kind: "boolean",
            enabledForRuleIds: ["beta"],
          },
        },
      ],
    });
    expect(m.flags).toHaveLength(1);
  });

  it("rejects duplicate rule ids", () => {
    expect(() =>
      FeatureFlagsManifestSchema.parse({
        rules: [{ id: "r" }, { id: "r" }],
      }),
    ).toThrow(/rule ids/);
  });

  it("rejects duplicate flag ids", () => {
    expect(() =>
      FeatureFlagsManifestSchema.parse({
        flags: [
          { id: "dup", name: "A", body: { kind: "boolean" } },
          { id: "dup", name: "B", body: { kind: "boolean" } },
        ],
      }),
    ).toThrow(/flag ids/);
  });

  it("rejects boolean flag referencing unknown rule", () => {
    expect(() =>
      FeatureFlagsManifestSchema.parse({
        flags: [
          {
            id: "f",
            name: "F",
            body: { kind: "boolean", enabledForRuleIds: ["ghost"] },
          },
        ],
      }),
    ).toThrow(/rule references/);
  });

  it("rejects variant flag referencing unknown rule", () => {
    expect(() =>
      FeatureFlagsManifestSchema.parse({
        flags: [
          {
            id: "f",
            name: "F",
            body: {
              kind: "variant",
              variants: [{ value: "a" }, { value: "b" }],
              defaultVariantValue: "a",
              assignments: [{ ruleId: "ghost", variantValue: "b" }],
            },
          },
        ],
      }),
    ).toThrow(/rule references/);
  });

  it("rejects mutex group with unknown flag id", () => {
    expect(() =>
      FeatureFlagsManifestSchema.parse({
        flags: [{ id: "a", name: "A", body: { kind: "boolean" } }],
        mutexGroups: [{ id: "g", name: "G", flagIds: ["a", "ghost"] }],
      }),
    ).toThrow(/flagIds must resolve/);
  });

  it("rejects a flag in two mutex groups", () => {
    expect(() =>
      FeatureFlagsManifestSchema.parse({
        flags: [
          { id: "a", name: "A", body: { kind: "boolean" } },
          { id: "b", name: "B", body: { kind: "boolean" } },
          { id: "c", name: "C", body: { kind: "boolean" } },
        ],
        mutexGroups: [
          { id: "g1", name: "G1", flagIds: ["a", "b"] },
          { id: "g2", name: "G2", flagIds: ["a", "c"] },
        ],
      }),
    ).toThrow(/at most one mutex group/);
  });

  it("accepts a non-overlapping mutex topology", () => {
    const m = FeatureFlagsManifestSchema.parse({
      flags: [
        { id: "a", name: "A", body: { kind: "boolean" } },
        { id: "b", name: "B", body: { kind: "boolean" } },
        { id: "c", name: "C", body: { kind: "boolean" } },
        { id: "d", name: "D", body: { kind: "boolean" } },
      ],
      mutexGroups: [
        { id: "g1", name: "G1", flagIds: ["a", "b"] },
        { id: "g2", name: "G2", flagIds: ["c", "d"] },
      ],
    });
    expect(m.mutexGroups).toHaveLength(2);
  });
});

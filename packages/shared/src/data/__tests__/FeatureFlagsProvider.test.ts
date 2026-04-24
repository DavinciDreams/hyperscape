/**
 * Tests for the FeatureFlagsProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { featureFlagsProvider } from "../FeatureFlagsProvider";

beforeEach(() => {
  featureFlagsProvider.unload();
});
afterEach(() => {
  featureFlagsProvider.unload();
});

const validManifest = {
  enabled: true,
  rules: [
    {
      id: "allUsers",
      description: "everyone",
      rolloutPercent: 100,
    },
    {
      id: "insiders",
      description: "insider cohort",
      rolloutPercent: 10,
      minAccountAgeDays: 30,
      platforms: ["web" as const, "steam" as const],
    },
  ],
  flags: [
    {
      id: "newHud",
      name: "New HUD",
      body: {
        kind: "boolean" as const,
        defaultValue: false,
        enabledForRuleIds: ["insiders"],
      },
    },
    {
      id: "lootUi",
      name: "Loot UI Experiment",
      body: {
        kind: "variant" as const,
        variants: [
          { value: "control" },
          { value: "treatmentA" },
          { value: "treatmentB" },
        ],
        defaultVariantValue: "control",
        assignments: [{ ruleId: "insiders", variantValue: "treatmentA" }],
      },
    },
  ],
  mutexGroups: [
    {
      id: "hudExperiments",
      name: "HUD Experiments",
      flagIds: ["newHud", "lootUi"],
    },
  ],
};

describe("FeatureFlagsProvider", () => {
  it("starts unloaded", () => {
    expect(featureFlagsProvider.isLoaded()).toBe(false);
    expect(featureFlagsProvider.getManifest()).toBeNull();
  });

  it("loadRaw() accepts a valid manifest and fills defaults", () => {
    const parsed = featureFlagsProvider.loadRaw(validManifest);
    expect(parsed.enabled).toBe(true);
    expect(parsed.rules.length).toBe(2);
    expect(parsed.flags.length).toBe(2);
    expect(parsed.mutexGroups.length).toBe(1);
    expect(featureFlagsProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() accepts empty blob (all arrays default to [])", () => {
    const parsed = featureFlagsProvider.loadRaw({});
    expect(parsed.enabled).toBe(true);
    expect(parsed.rules.length).toBe(0);
    expect(parsed.flags.length).toBe(0);
    expect(featureFlagsProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() accepts disabled blob", () => {
    const parsed = featureFlagsProvider.loadRaw({ enabled: false });
    expect(parsed.enabled).toBe(false);
    expect(featureFlagsProvider.isLoaded()).toBe(true);
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = featureFlagsProvider.loadRaw(validManifest);
    featureFlagsProvider.unload();
    featureFlagsProvider.load(parsed);
    expect(featureFlagsProvider.isLoaded()).toBe(true);
    expect(featureFlagsProvider.getManifest()?.flags.length).toBe(2);
  });

  it("loadRaw() rejects duplicate rule ids", () => {
    const bad = {
      ...validManifest,
      rules: [validManifest.rules[0], { ...validManifest.rules[0] }],
    };
    expect(() => featureFlagsProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects duplicate flag ids", () => {
    const bad = {
      ...validManifest,
      flags: [validManifest.flags[0], { ...validManifest.flags[0] }],
      mutexGroups: [],
    };
    expect(() => featureFlagsProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects duplicate mutex group ids", () => {
    const bad = {
      ...validManifest,
      mutexGroups: [
        validManifest.mutexGroups[0],
        { ...validManifest.mutexGroups[0] },
      ],
    };
    expect(() => featureFlagsProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects boolean flag referencing undeclared rule", () => {
    const bad = {
      ...validManifest,
      flags: [
        {
          id: "orphan",
          name: "Orphan",
          body: {
            kind: "boolean" as const,
            enabledForRuleIds: ["nonexistent"],
          },
        },
      ],
      mutexGroups: [],
    };
    expect(() => featureFlagsProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects variant flag referencing undeclared rule", () => {
    const bad = {
      ...validManifest,
      flags: [
        {
          id: "variantOrphan",
          name: "Variant Orphan",
          body: {
            kind: "variant" as const,
            variants: [{ value: "control" }, { value: "treatment" }],
            defaultVariantValue: "control",
            assignments: [{ ruleId: "nonexistent", variantValue: "treatment" }],
          },
        },
      ],
      mutexGroups: [],
    };
    expect(() => featureFlagsProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects variant flag with duplicate variant values", () => {
    const bad = {
      ...validManifest,
      flags: [
        {
          id: "dup",
          name: "Dup Variants",
          body: {
            kind: "variant" as const,
            variants: [{ value: "a" }, { value: "a" }],
            defaultVariantValue: "a",
          },
        },
      ],
      mutexGroups: [],
    };
    expect(() => featureFlagsProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects variant defaultVariantValue that isn't declared", () => {
    const bad = {
      ...validManifest,
      flags: [
        {
          id: "dangles",
          name: "Dangling Default",
          body: {
            kind: "variant" as const,
            variants: [{ value: "a" }, { value: "b" }],
            defaultVariantValue: "c",
          },
        },
      ],
      mutexGroups: [],
    };
    expect(() => featureFlagsProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects variant assignment value not in variants", () => {
    const bad = {
      ...validManifest,
      flags: [
        {
          id: "bogus",
          name: "Bogus Assignment",
          body: {
            kind: "variant" as const,
            variants: [{ value: "a" }, { value: "b" }],
            defaultVariantValue: "a",
            assignments: [{ ruleId: "allUsers", variantValue: "nonexistent" }],
          },
        },
      ],
      mutexGroups: [],
    };
    expect(() => featureFlagsProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects mutex group referencing undeclared flag", () => {
    const bad = {
      ...validManifest,
      mutexGroups: [
        {
          id: "bogus",
          name: "Bogus",
          flagIds: ["newHud", "nonexistent"],
        },
      ],
    };
    expect(() => featureFlagsProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects flag belonging to more than one mutex group", () => {
    const bad = {
      ...validManifest,
      mutexGroups: [
        {
          id: "groupA",
          name: "A",
          flagIds: ["newHud", "lootUi"],
        },
        {
          id: "groupB",
          name: "B",
          flagIds: ["newHud", "lootUi"],
        },
      ],
    };
    expect(() => featureFlagsProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects mutex group with only 1 flag", () => {
    const bad = {
      ...validManifest,
      mutexGroups: [{ id: "solo", name: "Solo", flagIds: ["newHud"] }],
    };
    expect(() => featureFlagsProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects mutex group with duplicate flag ids", () => {
    const bad = {
      ...validManifest,
      mutexGroups: [
        {
          id: "dup",
          name: "Dup",
          flagIds: ["newHud", "newHud"],
        },
      ],
    };
    expect(() => featureFlagsProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects malformed flag id", () => {
    const bad = {
      ...validManifest,
      flags: [
        {
          id: "NotLowerCamel",
          name: "x",
          body: { kind: "boolean" as const },
        },
      ],
      mutexGroups: [],
    };
    expect(() => featureFlagsProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects rule rolloutPercent out of [0,100]", () => {
    const bad = {
      ...validManifest,
      rules: [{ id: "overshoot", rolloutPercent: 150 }],
      flags: [],
      mutexGroups: [],
    };
    expect(() => featureFlagsProvider.loadRaw(bad)).toThrow();
  });

  it("hotReload() replaces the manifest with a new one", () => {
    featureFlagsProvider.loadRaw(validManifest);
    const next = { ...validManifest, enabled: false };
    const parsed = featureFlagsProvider.loadRaw(next);
    featureFlagsProvider.hotReload(parsed);
    expect(featureFlagsProvider.getManifest()?.enabled).toBe(false);
  });

  it("hotReload(null) clears the manifest", () => {
    featureFlagsProvider.loadRaw(validManifest);
    featureFlagsProvider.hotReload(null);
    expect(featureFlagsProvider.isLoaded()).toBe(false);
  });

  it("unload() clears a loaded manifest", () => {
    featureFlagsProvider.loadRaw(validManifest);
    featureFlagsProvider.unload();
    expect(featureFlagsProvider.isLoaded()).toBe(false);
    expect(featureFlagsProvider.getManifest()).toBeNull();
  });
});

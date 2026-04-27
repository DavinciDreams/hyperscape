import { FeatureFlagsManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it, vi } from "vitest";
import {
  FeatureFlagRegistry,
  UnknownFlagError,
  hashBucket,
} from "../FeatureFlagRegistry.js";

function baseManifest() {
  return FeatureFlagsManifestSchema.parse({
    enabled: true,
    rules: [
      { id: "everyone", rolloutPercent: 100 },
      { id: "platformIos", platforms: ["ios"] },
      {
        id: "level50plus",
        minCharacterLevel: 50,
      },
      {
        id: "oldAccounts",
        minAccountAgeDays: 90,
      },
      {
        id: "regionUS",
        regionPrefixes: ["en-US"],
      },
      {
        id: "tenPercent",
        rolloutPercent: 10,
      },
      {
        id: "allowOnly",
        rolloutPercent: 0,
        allowAccountIds: ["vip-1"],
      },
      {
        id: "blockCheater",
        rolloutPercent: 100,
        blockAccountIds: ["cheater-1"],
      },
    ],
    flags: [
      {
        id: "newHud",
        name: "New HUD",
        body: {
          kind: "boolean",
          defaultValue: false,
          enabledForRuleIds: ["everyone"],
        },
      },
      {
        id: "iosOnly",
        name: "iOS-only",
        body: {
          kind: "boolean",
          defaultValue: false,
          enabledForRuleIds: ["platformIos"],
        },
      },
      {
        id: "endgameUnlock",
        name: "Endgame unlock",
        body: {
          kind: "boolean",
          defaultValue: false,
          enabledForRuleIds: ["level50plus"],
        },
      },
      {
        id: "uiTheme",
        name: "UI theme",
        body: {
          kind: "variant",
          variants: [
            { value: "classic" },
            { value: "modern" },
            { value: "neon" },
          ],
          defaultVariantValue: "classic",
          assignments: [
            { ruleId: "oldAccounts", variantValue: "neon" },
            { ruleId: "everyone", variantValue: "modern" },
          ],
        },
      },
      {
        id: "vipGift",
        name: "VIP gift",
        body: {
          kind: "boolean",
          defaultValue: false,
          enabledForRuleIds: ["allowOnly"],
        },
      },
      {
        id: "banHammer",
        name: "Ban hammer",
        body: {
          kind: "boolean",
          defaultValue: false,
          enabledForRuleIds: ["blockCheater"],
        },
      },
      {
        id: "redesignA",
        name: "Redesign A",
        body: {
          kind: "boolean",
          defaultValue: false,
          enabledForRuleIds: ["everyone"],
        },
      },
      {
        id: "redesignB",
        name: "Redesign B",
        body: {
          kind: "boolean",
          defaultValue: false,
          enabledForRuleIds: ["everyone"],
        },
      },
    ],
    mutexGroups: [
      {
        id: "redesignExperiment",
        name: "Redesign experiment",
        flagIds: ["redesignA", "redesignB"],
      },
    ],
  });
}

describe("FeatureFlagRegistry — boolean flags", () => {
  it("returns enabledValue when the rule matches everyone", () => {
    const reg = new FeatureFlagRegistry(baseManifest());
    expect(reg.evaluate("newHud", { accountId: "p1" })).toBe(true);
  });

  it("returns default when no rule matches", () => {
    const reg = new FeatureFlagRegistry(baseManifest());
    expect(reg.evaluate("iosOnly", { accountId: "p1", platform: "web" })).toBe(
      false,
    );
    expect(reg.evaluate("iosOnly", { accountId: "p1", platform: "ios" })).toBe(
      true,
    );
  });

  it("minCharacterLevel gates enablement", () => {
    const reg = new FeatureFlagRegistry(baseManifest());
    expect(
      reg.evaluate("endgameUnlock", { accountId: "p1", characterLevel: 10 }),
    ).toBe(false);
    expect(
      reg.evaluate("endgameUnlock", { accountId: "p1", characterLevel: 60 }),
    ).toBe(true);
  });

  it("allowAccountIds bypass percent=0", () => {
    const reg = new FeatureFlagRegistry(baseManifest());
    expect(reg.evaluate("vipGift", { accountId: "vip-1" })).toBe(true);
    expect(reg.evaluate("vipGift", { accountId: "nobody" })).toBe(false);
  });

  it("blockAccountIds always loses, even with percent=100", () => {
    const reg = new FeatureFlagRegistry(baseManifest());
    expect(reg.evaluate("banHammer", { accountId: "cheater-1" })).toBe(false);
    expect(reg.evaluate("banHammer", { accountId: "honest" })).toBe(true);
  });

  it("returns default when flag.enabled=false", () => {
    const m = baseManifest();
    m.flags[0].enabled = false;
    const reg = new FeatureFlagRegistry(m);
    expect(reg.evaluate("newHud", { accountId: "p1" })).toBe(false);
  });

  it("returns default when manifest.enabled=false", () => {
    const m = baseManifest();
    m.enabled = false;
    const reg = new FeatureFlagRegistry(m);
    expect(reg.evaluate("newHud", { accountId: "p1" })).toBe(false);
  });
});

describe("FeatureFlagRegistry — variant flags", () => {
  it("first matching assignment wins", () => {
    const reg = new FeatureFlagRegistry(baseManifest());
    // oldAccounts rule fires first → neon
    const r = reg.evaluate("uiTheme", {
      accountId: "p1",
      accountAgeDays: 120,
    });
    expect(r).toBe("neon");
  });

  it("falls through to later assignment", () => {
    const reg = new FeatureFlagRegistry(baseManifest());
    const r = reg.evaluate("uiTheme", {
      accountId: "p1",
      accountAgeDays: 10,
    });
    expect(r).toBe("modern"); // everyone rule
  });

  it("returns defaultVariantValue when no rules match", () => {
    const m = baseManifest();
    // Remove all assignments to force default.
    m.flags[3].body = {
      kind: "variant",
      variants: [
        { value: "classic", description: "" },
        { value: "modern", description: "" },
      ],
      defaultVariantValue: "classic",
      assignments: [],
    };
    const reg = new FeatureFlagRegistry(m);
    expect(reg.evaluate("uiTheme", { accountId: "p1" })).toBe("classic");
  });
});

describe("FeatureFlagRegistry — mutex groups", () => {
  it("locks losing sibling to default when earlier sibling wins", () => {
    const reg = new FeatureFlagRegistry(baseManifest());
    // redesignA is enabled for everyone; it wins because it's first
    // in the group's flagIds — redesignB should be locked to default.
    expect(reg.evaluate("redesignA", { accountId: "p1" })).toBe(true);
    expect(reg.evaluate("redesignB", { accountId: "p1" })).toBe(false);
  });
});

describe("FeatureFlagRegistry — rollout bucketing", () => {
  it("10% rule enables for some players and disables for others", () => {
    const m = baseManifest();
    m.flags.push({
      id: "tenPercentFlag",
      name: "10%",
      enabled: true,
      ownerTeamTag: "",
      staleAfterIso: "",
      description: "",
      body: {
        kind: "boolean",
        enabledValue: true,
        defaultValue: false,
        enabledForRuleIds: ["tenPercent"],
      },
    });
    const reg = new FeatureFlagRegistry(m);
    let hits = 0;
    for (let i = 0; i < 1000; i++) {
      const r = reg.evaluate("tenPercentFlag", { accountId: `p${i}` });
      if (r === true) hits++;
    }
    // Should be roughly 10% = 100, allow wide deterministic margin.
    expect(hits).toBeGreaterThan(50);
    expect(hits).toBeLessThan(200);
  });

  it("same principal+flag returns stable result across calls", () => {
    const reg = new FeatureFlagRegistry(baseManifest());
    const a = reg.evaluate("newHud", { accountId: "stable" });
    const b = reg.evaluate("newHud", { accountId: "stable" });
    expect(a).toBe(b);
  });
});

describe("FeatureFlagRegistry — API surface", () => {
  it("get/has/size work", () => {
    const reg = new FeatureFlagRegistry(baseManifest());
    expect(reg.size).toBeGreaterThan(0);
    expect(reg.has("newHud")).toBe(true);
    expect(reg.get("newHud").name).toBe("New HUD");
    expect(() => reg.get("ghost")).toThrow(UnknownFlagError);
  });

  it("evaluate throws for unknown flag", () => {
    const reg = new FeatureFlagRegistry(baseManifest());
    expect(() => reg.evaluate("ghost", { accountId: "p1" })).toThrow(
      UnknownFlagError,
    );
  });

  it("loadFromJson validates before loading", () => {
    const reg = new FeatureFlagRegistry();
    reg.loadFromJson({
      enabled: true,
      rules: [],
      flags: [],
      mutexGroups: [],
    });
    expect(reg.size).toBe(0);
  });

  it("hashBucket is stable + in [0,100)", () => {
    const a = hashBucket("foo|bar");
    const b = hashBucket("foo|bar");
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(100);
  });
});

describe("FeatureFlagRegistry — onReloaded", () => {
  it("fires after every successful load()", () => {
    const r = new FeatureFlagRegistry();
    const cb = vi.fn();
    r.onReloaded(cb);
    r.load(baseManifest());
    r.load(baseManifest());
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("returned unsubscribe stops further notifications", () => {
    const r = new FeatureFlagRegistry();
    const cb = vi.fn();
    const off = r.onReloaded(cb);
    r.load(baseManifest());
    off();
    r.load(baseManifest());
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("a throwing listener does not break subsequent listeners", () => {
    const r = new FeatureFlagRegistry();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const bad = vi.fn(() => {
      throw new Error("listener boom");
    });
    const good = vi.fn();
    r.onReloaded(bad);
    r.onReloaded(good);
    r.load(baseManifest());
    expect(bad).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

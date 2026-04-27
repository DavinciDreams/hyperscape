import { ModerationManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it, vi } from "vitest";
import {
  ModerationNotLoadedError,
  ModerationRegistry,
  UnknownFilterRuleError,
  UnknownReportCategoryError,
} from "../ModerationRegistry.js";

function manifest() {
  return ModerationManifestSchema.parse({
    enabled: true,
    reportCategories: [
      {
        id: "spam",
        name: "Spam",
        defaultAction: "warn",
        priority: 30,
      },
      {
        id: "harassment",
        name: "Harassment",
        defaultAction: "mute",
        priority: 80,
      },
      {
        id: "cheating",
        name: "Cheating",
        defaultAction: "ban",
        priority: 90,
        playerVisible: false,
      },
    ],
    filterRules: [
      {
        id: "slurs",
        name: "Slur filter",
        matchKind: "wordWithVariants",
        patternAssetRef: "slurPatterns",
        action: "censor",
      },
      {
        id: "scamLinks",
        name: "Scam link filter",
        matchKind: "linkDomain",
        patternAssetRef: "scamDomains",
        action: "block",
      },
    ],
    sanctionLadders: [
      {
        categoryId: "harassment",
        tiers: [
          { atOffenseCount: 1, action: "warn", durationMinutes: 60 },
          { atOffenseCount: 3, action: "mute", durationMinutes: 1440 },
          { atOffenseCount: 5, action: "ban", durationMinutes: 0 },
        ],
      },
    ],
    reportRateLimits: {
      maxReportsPerHour: 5,
      maxReportsPerDay: 20,
      cooldownBetweenReportsSec: 30,
      maxUniqueTargetsPerHour: 3,
      requireEvidenceText: true,
      minEvidenceTextLength: 10,
    },
    autoModeration: {
      enabled: true,
      windowHours: 24,
      demoteNoisyReporters: true,
      noisyReporterDismissFraction: 0.5,
      noisyReporterMinReports: 10,
    },
    appeals: {
      enabled: true,
      maxAppealsPerSanction: 2,
      cooldownHoursBeforeFiling: 24,
      minExplanationLength: 50,
      responseSlaHours: 72,
    },
    banPolicy: {},
  });
}

describe("ModerationRegistry — not loaded", () => {
  it("throws pre-load", () => {
    expect(() => new ModerationRegistry().manifest).toThrow(
      ModerationNotLoadedError,
    );
  });
});

describe("ModerationRegistry — categories", () => {
  it("indexes by id", () => {
    const r = new ModerationRegistry(manifest());
    expect(r.hasCategory("spam")).toBe(true);
    expect(r.category("harassment").defaultAction).toBe("mute");
  });

  it("throws on unknown category", () => {
    const r = new ModerationRegistry(manifest());
    expect(() => r.category("ghost")).toThrow(UnknownReportCategoryError);
  });

  it("sorts player-visible by priority descending", () => {
    const r = new ModerationRegistry(manifest());
    expect(r.playerVisibleCategories().map((c) => c.id)).toEqual([
      "harassment",
      "spam",
    ]);
  });
});

describe("ModerationRegistry — filter rules", () => {
  it("indexes by id", () => {
    const r = new ModerationRegistry(manifest());
    expect(r.hasRule("slurs")).toBe(true);
    expect(r.rule("scamLinks").action).toBe("block");
  });

  it("throws on unknown rule", () => {
    const r = new ModerationRegistry(manifest());
    expect(() => r.rule("ghost")).toThrow(UnknownFilterRuleError);
  });

  it("filters by action", () => {
    const r = new ModerationRegistry(manifest());
    expect(r.rulesByAction("censor").map((rr) => rr.id)).toEqual(["slurs"]);
    expect(r.rulesByAction("block").map((rr) => rr.id)).toEqual(["scamLinks"]);
  });
});

describe("ModerationRegistry — sanction resolution", () => {
  it("returns null before first tier", () => {
    const r = new ModerationRegistry(manifest());
    expect(r.resolveSanction("harassment", 0).tier).toBeNull();
  });

  it("returns first tier at threshold", () => {
    const r = new ModerationRegistry(manifest());
    const out = r.resolveSanction("harassment", 1);
    expect(out.tier?.action).toBe("warn");
  });

  it("returns highest matching tier", () => {
    const r = new ModerationRegistry(manifest());
    expect(r.resolveSanction("harassment", 4).tier?.action).toBe("mute");
    expect(r.resolveSanction("harassment", 10).tier?.action).toBe("ban");
  });

  it("reports noLadder for unknown category", () => {
    const r = new ModerationRegistry(manifest());
    expect(r.resolveSanction("spam", 5).noLadder).toBe(true);
  });
});

describe("ModerationRegistry — report rate gates", () => {
  const baseInput = {
    reportsInLastHour: 0,
    reportsInLastDay: 0,
    secondsSinceLastReport: 100,
    uniqueTargetsInLastHour: 0,
    evidenceTextLength: 20,
  };

  it("allows valid report", () => {
    const r = new ModerationRegistry(manifest());
    expect(r.checkReportRate(baseInput).allowed).toBe(true);
  });

  it("rejects when disabled", () => {
    const r = new ModerationRegistry();
    r.loadFromJson({
      enabled: false,
      reportCategories: [],
    });
    expect(r.checkReportRate(baseInput).reason).toBe("disabled");
  });

  it("rejects hourly cap", () => {
    const r = new ModerationRegistry(manifest());
    expect(
      r.checkReportRate({ ...baseInput, reportsInLastHour: 5 }).reason,
    ).toBe("hourly-cap");
  });

  it("rejects daily cap", () => {
    const r = new ModerationRegistry(manifest());
    expect(
      r.checkReportRate({ ...baseInput, reportsInLastDay: 20 }).reason,
    ).toBe("daily-cap");
  });

  it("rejects cooldown", () => {
    const r = new ModerationRegistry(manifest());
    expect(
      r.checkReportRate({ ...baseInput, secondsSinceLastReport: 10 }).reason,
    ).toBe("cooldown");
  });

  it("rejects unique target cap", () => {
    const r = new ModerationRegistry(manifest());
    expect(
      r.checkReportRate({ ...baseInput, uniqueTargetsInLastHour: 3 }).reason,
    ).toBe("unique-target-cap");
  });

  it("rejects short evidence", () => {
    const r = new ModerationRegistry(manifest());
    expect(
      r.checkReportRate({ ...baseInput, evidenceTextLength: 5 }).reason,
    ).toBe("evidence-too-short");
  });
});

describe("ModerationRegistry — noisy reporters", () => {
  it("flags above dismiss fraction", () => {
    const r = new ModerationRegistry(manifest());
    expect(r.isNoisyReporter(20, 15)).toBe(true);
  });

  it("does not flag below min reports", () => {
    const r = new ModerationRegistry(manifest());
    expect(r.isNoisyReporter(5, 5)).toBe(false);
  });

  it("does not flag below fraction", () => {
    const r = new ModerationRegistry(manifest());
    expect(r.isNoisyReporter(20, 5)).toBe(false);
  });
});

describe("ModerationRegistry — appeals", () => {
  const baseInput = {
    hoursSinceSanction: 48,
    appealsFiled: 0,
    explanationLength: 100,
  };

  it("allows valid appeal", () => {
    const r = new ModerationRegistry(manifest());
    expect(r.checkAppealEligibility(baseInput).allowed).toBe(true);
  });

  it("rejects during cooldown", () => {
    const r = new ModerationRegistry(manifest());
    expect(
      r.checkAppealEligibility({ ...baseInput, hoursSinceSanction: 10 }).reason,
    ).toBe("within-cooldown");
  });

  it("rejects at max appeals", () => {
    const r = new ModerationRegistry(manifest());
    expect(
      r.checkAppealEligibility({ ...baseInput, appealsFiled: 2 }).reason,
    ).toBe("max-appeals-reached");
  });

  it("rejects short explanation", () => {
    const r = new ModerationRegistry(manifest());
    expect(
      r.checkAppealEligibility({ ...baseInput, explanationLength: 10 }).reason,
    ).toBe("explanation-too-short");
  });
});

describe("ModerationRegistry — onReloaded", () => {
  it("fires after every successful load()", () => {
    const r = new ModerationRegistry();
    const cb = vi.fn();
    r.onReloaded(cb);
    r.load(manifest());
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("returned unsubscribe stops further notifications", () => {
    const r = new ModerationRegistry();
    const cb = vi.fn();
    const off = r.onReloaded(cb);
    r.load(manifest());
    off();
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("a throwing listener does not break subsequent listeners", () => {
    const r = new ModerationRegistry();
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

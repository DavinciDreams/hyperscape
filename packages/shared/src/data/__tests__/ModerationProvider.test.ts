/**
 * Tests for the ModerationProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { moderationProvider } from "../ModerationProvider";

beforeEach(() => {
  moderationProvider.unload();
});
afterEach(() => {
  moderationProvider.unload();
});

const validCategory = {
  id: "harassment",
  name: "Harassment",
  defaultAction: "mute" as const,
};

const validFilterRule = {
  id: "slurList",
  name: "Slur List",
  matchKind: "wordWithVariants" as const,
  patternAssetRef: "chatSlurPatterns",
  action: "censor" as const,
};

const validLadder = {
  categoryId: "harassment",
  tiers: [
    { atOffenseCount: 1, action: "warn" as const, durationMinutes: 60 },
    { atOffenseCount: 3, action: "mute" as const, durationMinutes: 120 },
    { atOffenseCount: 5, action: "ban" as const, durationMinutes: 0 },
  ],
};

const validManifest = {
  enabled: true,
  reportCategories: [validCategory],
  filterRules: [validFilterRule],
  sanctionLadders: [validLadder],
};

describe("ModerationProvider", () => {
  it("starts unloaded", () => {
    expect(moderationProvider.isLoaded()).toBe(false);
    expect(moderationProvider.getManifest()).toBeNull();
  });

  it("loadRaw() accepts a valid manifest and fills defaults", () => {
    const parsed = moderationProvider.loadRaw(validManifest);
    expect(parsed.enabled).toBe(true);
    expect(parsed.reportCategories.length).toBe(1);
    expect(parsed.filterRules.length).toBe(1);
    expect(parsed.sanctionLadders.length).toBe(1);
    expect(parsed.reportRateLimits.maxReportsPerHour).toBe(20);
    expect(parsed.autoModeration.enabled).toBe(true);
    expect(parsed.appeals.enabled).toBe(true);
    expect(moderationProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() accepts disabled blob", () => {
    const parsed = moderationProvider.loadRaw({ enabled: false });
    expect(parsed.enabled).toBe(false);
    expect(parsed.reportCategories.length).toBe(0);
    expect(moderationProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() rejects enabled=true with no reportCategories", () => {
    expect(() => moderationProvider.loadRaw({ enabled: true })).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = moderationProvider.loadRaw(validManifest);
    moderationProvider.unload();
    moderationProvider.load(parsed);
    expect(moderationProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() rejects duplicate reportCategory ids", () => {
    const bad = {
      ...validManifest,
      reportCategories: [validCategory, { ...validCategory }],
    };
    expect(() => moderationProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects duplicate filterRule ids", () => {
    const bad = {
      ...validManifest,
      filterRules: [validFilterRule, { ...validFilterRule }],
    };
    expect(() => moderationProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects sanctionLadder with undeclared categoryId", () => {
    const bad = {
      ...validManifest,
      sanctionLadders: [{ ...validLadder, categoryId: "unknownCat" }],
    };
    expect(() => moderationProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects two sanctionLadders for same category", () => {
    const bad = {
      ...validManifest,
      sanctionLadders: [validLadder, { ...validLadder }],
    };
    expect(() => moderationProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects non-monotonic sanction tier atOffenseCount", () => {
    const bad = {
      ...validManifest,
      sanctionLadders: [
        {
          categoryId: "harassment",
          tiers: [
            { atOffenseCount: 3, action: "warn" as const, durationMinutes: 60 },
            {
              atOffenseCount: 1,
              action: "mute" as const,
              durationMinutes: 120,
            },
          ],
        },
      ],
    };
    expect(() => moderationProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects non-permanent-eligible action with duration=0", () => {
    const bad = {
      ...validManifest,
      sanctionLadders: [
        {
          categoryId: "harassment",
          tiers: [
            { atOffenseCount: 1, action: "warn" as const, durationMinutes: 0 },
          ],
        },
      ],
    };
    expect(() => moderationProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() accepts ban with duration=0 (permanent ban)", () => {
    const parsed = moderationProvider.loadRaw({
      ...validManifest,
      sanctionLadders: [
        {
          categoryId: "harassment",
          tiers: [
            { atOffenseCount: 1, action: "ban" as const, durationMinutes: 0 },
          ],
        },
      ],
    });
    expect(parsed.sanctionLadders[0].tiers[0].durationMinutes).toBe(0);
  });

  it("loadRaw() rejects filterRule escalateOnRepeat=true with window=0", () => {
    const bad = {
      ...validManifest,
      filterRules: [
        {
          ...validFilterRule,
          escalateOnRepeat: true,
          escalationWindowSec: 0,
        },
      ],
    };
    expect(() => moderationProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects reportRateLimits day < hour", () => {
    const bad = {
      ...validManifest,
      reportRateLimits: {
        maxReportsPerHour: 50,
        maxReportsPerDay: 10,
      },
    };
    expect(() => moderationProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects requireEvidenceText=true with minLength=0", () => {
    const bad = {
      ...validManifest,
      reportRateLimits: {
        requireEvidenceText: true,
        minEvidenceTextLength: 0,
      },
    };
    expect(() => moderationProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects autoModeration demoteNoisyReporters with fraction=0", () => {
    const bad = {
      ...validManifest,
      autoModeration: {
        demoteNoisyReporters: true,
        noisyReporterDismissFraction: 0,
        noisyReporterMinReports: 10,
      },
    };
    expect(() => moderationProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects appeals enabled=true with maxAppeals=0", () => {
    const bad = {
      ...validManifest,
      appeals: {
        enabled: true,
        maxAppealsPerSanction: 0,
      },
    };
    expect(() => moderationProvider.loadRaw(bad)).toThrow();
  });

  it("hotReload() replaces the manifest with a new one", () => {
    moderationProvider.loadRaw(validManifest);
    const parsed = moderationProvider.loadRaw({ enabled: false });
    moderationProvider.hotReload(parsed);
    expect(moderationProvider.getManifest()?.enabled).toBe(false);
  });

  it("hotReload(null) clears the manifest", () => {
    moderationProvider.loadRaw(validManifest);
    moderationProvider.hotReload(null);
    expect(moderationProvider.isLoaded()).toBe(false);
  });

  it("unload() clears a loaded manifest", () => {
    moderationProvider.loadRaw(validManifest);
    moderationProvider.unload();
    expect(moderationProvider.isLoaded()).toBe(false);
  });
});

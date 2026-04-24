/**
 * Faithfulness + defensiveness tests for `ModerationManifestSchema`.
 */

import { describe, expect, it } from "vitest";

import {
  ModerationManifestSchema,
  type ModerationManifest,
} from "./moderation.js";

const reference: ModerationManifest = {
  enabled: true,
  reportCategories: [
    {
      id: "harassment",
      name: "Harassment",
      description: "Targeted harassment or hate speech.",
      iconId: "icon.report.harassment",
      playerVisible: true,
      priority: 90,
      defaultAction: "mute",
      requiresHumanReview: true,
      triggersReporterCooldown: false,
    },
    {
      id: "cheating",
      name: "Cheating / Exploiting",
      description: "",
      iconId: "",
      playerVisible: true,
      priority: 100,
      defaultAction: "suspend",
      requiresHumanReview: true,
      triggersReporterCooldown: false,
    },
  ],
  filterRules: [
    {
      id: "slurListA",
      name: "Slur list A (en-US)",
      description: "",
      matchKind: "wordWithVariants",
      patternAssetRef: "slurAssetEnUs",
      action: "censor",
      appliesToNames: true,
      escalateOnRepeat: true,
      escalationWindowSec: 600,
    },
  ],
  sanctionLadders: [
    {
      categoryId: "harassment",
      tiers: [
        { atOffenseCount: 1, action: "warn", durationMinutes: 60 },
        { atOffenseCount: 3, action: "mute", durationMinutes: 1440 },
        { atOffenseCount: 5, action: "suspend", durationMinutes: 4320 },
        { atOffenseCount: 10, action: "ban", durationMinutes: 0 },
      ],
    },
  ],
  reportRateLimits: {
    maxReportsPerHour: 20,
    maxReportsPerDay: 100,
    cooldownBetweenReportsSec: 30,
    maxUniqueTargetsPerHour: 10,
    requireEvidenceText: true,
    minEvidenceTextLength: 10,
    allowAnonymous: true,
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
    maxAppealsPerSanction: 1,
    cooldownHoursBeforeFiling: 24,
    minExplanationLength: 50,
    responseSlaHours: 72,
    autoRejectAfterMax: true,
  },
  banPolicy: {
    allowIpBan: false,
    allowHardwareBan: false,
    retainReadOnlyAccess: true,
    postBanItemHoldHours: 720,
    showReasonInBanNotice: true,
    cascadeToLinkedAccounts: false,
  },
};

describe("ModerationManifestSchema", () => {
  it("parses the reference manifest cleanly", () => {
    const result = ModerationManifestSchema.safeParse(reference);
    if (!result.success) {
      throw new Error(
        `Reference manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("applies defaults on empty manifest (disabled)", () => {
    const parsed = ModerationManifestSchema.parse({ enabled: false });
    expect(parsed.enabled).toBe(false);
    expect(parsed.reportCategories).toEqual([]);
    expect(parsed.filterRules).toEqual([]);
    expect(parsed.reportRateLimits.maxReportsPerHour).toBe(20);
    expect(parsed.reportRateLimits.maxReportsPerDay).toBe(100);
    expect(parsed.appeals.enabled).toBe(true);
    expect(parsed.appeals.maxAppealsPerSanction).toBe(1);
    expect(parsed.autoModeration.enabled).toBe(true);
    expect(parsed.banPolicy.retainReadOnlyAccess).toBe(true);
  });

  it("rejects enabled=true with empty reportCategories", () => {
    const bad = { enabled: true, reportCategories: [] };
    expect(ModerationManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate reportCategory ids", () => {
    const bad = {
      reportCategories: [
        { id: "a", name: "A", defaultAction: "warn" },
        { id: "a", name: "B", defaultAction: "warn" },
      ],
    };
    expect(ModerationManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown defaultAction", () => {
    const bad = {
      reportCategories: [{ id: "a", name: "A", defaultAction: "nuke" }],
    };
    expect(ModerationManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts all 8 defaultAction values", () => {
    const actions = [
      "none",
      "warn",
      "mute",
      "kick",
      "suspend",
      "ban",
      "shadowBan",
      "nameForceChange",
    ];
    for (const defaultAction of actions) {
      const ok = {
        reportCategories: [{ id: "a", name: "A", defaultAction }],
      };
      expect(ModerationManifestSchema.safeParse(ok).success).toBe(true);
    }
  });

  it("rejects priority > 100", () => {
    const bad = {
      reportCategories: [
        { id: "a", name: "A", defaultAction: "warn", priority: 999 },
      ],
    };
    expect(ModerationManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate filterRule ids", () => {
    const bad = {
      reportCategories: [{ id: "c", name: "C", defaultAction: "warn" }],
      filterRules: [
        {
          id: "f",
          name: "A",
          matchKind: "exactWord",
          patternAssetRef: "p1",
          action: "censor",
        },
        {
          id: "f",
          name: "B",
          matchKind: "exactWord",
          patternAssetRef: "p2",
          action: "block",
        },
      ],
    };
    expect(ModerationManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown filterRule matchKind", () => {
    const bad = {
      reportCategories: [{ id: "c", name: "C", defaultAction: "warn" }],
      filterRules: [
        {
          id: "f",
          name: "F",
          matchKind: "emoji",
          patternAssetRef: "p",
          action: "censor",
        },
      ],
    };
    expect(ModerationManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts all 4 matchKind values", () => {
    const kinds = ["exactWord", "wordWithVariants", "regex", "linkDomain"];
    for (const matchKind of kinds) {
      const ok = {
        reportCategories: [{ id: "c", name: "C", defaultAction: "warn" }],
        filterRules: [
          {
            id: "f",
            name: "F",
            matchKind,
            patternAssetRef: "p",
            action: "censor",
          },
        ],
      };
      expect(ModerationManifestSchema.safeParse(ok).success).toBe(true);
    }
  });

  it("rejects unknown filter action", () => {
    const bad = {
      reportCategories: [{ id: "c", name: "C", defaultAction: "warn" }],
      filterRules: [
        {
          id: "f",
          name: "F",
          matchKind: "exactWord",
          patternAssetRef: "p",
          action: "nuke",
        },
      ],
    };
    expect(ModerationManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects escalateOnRepeat=true with escalationWindowSec=0", () => {
    const bad = {
      reportCategories: [{ id: "c", name: "C", defaultAction: "warn" }],
      filterRules: [
        {
          id: "f",
          name: "F",
          matchKind: "exactWord",
          patternAssetRef: "p",
          action: "censor",
          escalateOnRepeat: true,
          escalationWindowSec: 0,
        },
      ],
    };
    expect(ModerationManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts escalateOnRepeat=false with escalationWindowSec=0", () => {
    const ok = {
      reportCategories: [{ id: "c", name: "C", defaultAction: "warn" }],
      filterRules: [
        {
          id: "f",
          name: "F",
          matchKind: "exactWord",
          patternAssetRef: "p",
          action: "censor",
          escalateOnRepeat: false,
          escalationWindowSec: 0,
        },
      ],
    };
    expect(ModerationManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects sanctionLadder with unknown categoryId", () => {
    const bad = {
      reportCategories: [{ id: "c", name: "C", defaultAction: "warn" }],
      sanctionLadders: [
        {
          categoryId: "ghost",
          tiers: [{ atOffenseCount: 1, action: "warn", durationMinutes: 60 }],
        },
      ],
    };
    expect(ModerationManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate sanctionLadder categoryId", () => {
    const bad = {
      reportCategories: [{ id: "c", name: "C", defaultAction: "warn" }],
      sanctionLadders: [
        {
          categoryId: "c",
          tiers: [{ atOffenseCount: 1, action: "warn", durationMinutes: 60 }],
        },
        {
          categoryId: "c",
          tiers: [{ atOffenseCount: 1, action: "mute", durationMinutes: 60 }],
        },
      ],
    };
    expect(ModerationManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects non-monotonic atOffenseCount in sanction ladder", () => {
    const bad = {
      reportCategories: [{ id: "c", name: "C", defaultAction: "warn" }],
      sanctionLadders: [
        {
          categoryId: "c",
          tiers: [
            { atOffenseCount: 5, action: "warn", durationMinutes: 60 },
            { atOffenseCount: 3, action: "mute", durationMinutes: 60 },
          ],
        },
      ],
    };
    expect(ModerationManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate atOffenseCount in sanction ladder", () => {
    const bad = {
      reportCategories: [{ id: "c", name: "C", defaultAction: "warn" }],
      sanctionLadders: [
        {
          categoryId: "c",
          tiers: [
            { atOffenseCount: 3, action: "warn", durationMinutes: 60 },
            { atOffenseCount: 3, action: "mute", durationMinutes: 60 },
          ],
        },
      ],
    };
    expect(ModerationManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects warn tier with durationMinutes=0", () => {
    const bad = {
      reportCategories: [{ id: "c", name: "C", defaultAction: "warn" }],
      sanctionLadders: [
        {
          categoryId: "c",
          tiers: [{ atOffenseCount: 1, action: "warn", durationMinutes: 0 }],
        },
      ],
    };
    expect(ModerationManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts ban tier with durationMinutes=0 (permanent)", () => {
    const ok = {
      reportCategories: [{ id: "c", name: "C", defaultAction: "warn" }],
      sanctionLadders: [
        {
          categoryId: "c",
          tiers: [{ atOffenseCount: 1, action: "ban", durationMinutes: 0 }],
        },
      ],
    };
    expect(ModerationManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("accepts shadowBan and nameForceChange with durationMinutes=0", () => {
    for (const action of ["shadowBan", "nameForceChange"]) {
      const ok = {
        reportCategories: [{ id: "c", name: "C", defaultAction: "warn" }],
        sanctionLadders: [
          {
            categoryId: "c",
            tiers: [{ atOffenseCount: 1, action, durationMinutes: 0 }],
          },
        ],
      };
      expect(ModerationManifestSchema.safeParse(ok).success).toBe(true);
    }
  });

  it("rejects empty sanction tiers array", () => {
    const bad = {
      reportCategories: [{ id: "c", name: "C", defaultAction: "warn" }],
      sanctionLadders: [{ categoryId: "c", tiers: [] }],
    };
    expect(ModerationManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects reportRateLimits maxPerDay < maxPerHour", () => {
    const bad = {
      reportCategories: [{ id: "c", name: "C", defaultAction: "warn" }],
      reportRateLimits: { maxReportsPerHour: 100, maxReportsPerDay: 20 },
    };
    expect(ModerationManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts maxPerDay=0 (unlimited)", () => {
    const ok = {
      reportCategories: [{ id: "c", name: "C", defaultAction: "warn" }],
      reportRateLimits: { maxReportsPerHour: 100, maxReportsPerDay: 0 },
    };
    expect(ModerationManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects requireEvidenceText=true with minEvidenceLength=0", () => {
    const bad = {
      reportCategories: [{ id: "c", name: "C", defaultAction: "warn" }],
      reportRateLimits: { requireEvidenceText: true, minEvidenceTextLength: 0 },
    };
    expect(ModerationManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts requireEvidenceText=false with any minEvidenceLength", () => {
    const ok = {
      reportCategories: [{ id: "c", name: "C", defaultAction: "warn" }],
      reportRateLimits: {
        requireEvidenceText: false,
        minEvidenceTextLength: 0,
      },
    };
    expect(ModerationManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects demoteNoisyReporters=true with fraction=0", () => {
    const bad = {
      reportCategories: [{ id: "c", name: "C", defaultAction: "warn" }],
      autoModeration: {
        demoteNoisyReporters: true,
        noisyReporterDismissFraction: 0,
        noisyReporterMinReports: 10,
      },
    };
    expect(ModerationManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects demoteNoisyReporters=true with minReports=0", () => {
    const bad = {
      reportCategories: [{ id: "c", name: "C", defaultAction: "warn" }],
      autoModeration: {
        demoteNoisyReporters: true,
        noisyReporterDismissFraction: 0.5,
        noisyReporterMinReports: 0,
      },
    };
    expect(ModerationManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts demoteNoisyReporters=false with any values", () => {
    const ok = {
      reportCategories: [{ id: "c", name: "C", defaultAction: "warn" }],
      autoModeration: {
        demoteNoisyReporters: false,
        noisyReporterDismissFraction: 0,
        noisyReporterMinReports: 0,
      },
    };
    expect(ModerationManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects appeals enabled=true with maxAppeals=0", () => {
    const bad = {
      reportCategories: [{ id: "c", name: "C", defaultAction: "warn" }],
      appeals: { enabled: true, maxAppealsPerSanction: 0 },
    };
    expect(ModerationManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts appeals disabled with maxAppeals=0", () => {
    const ok = {
      reportCategories: [{ id: "c", name: "C", defaultAction: "warn" }],
      appeals: { enabled: false, maxAppealsPerSanction: 0 },
    };
    expect(ModerationManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects appeals maxAppealsPerSanction > 5", () => {
    const bad = {
      reportCategories: [{ id: "c", name: "C", defaultAction: "warn" }],
      appeals: { maxAppealsPerSanction: 999 },
    };
    expect(ModerationManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects appeals responseSlaHours > 720", () => {
    const bad = {
      reportCategories: [{ id: "c", name: "C", defaultAction: "warn" }],
      appeals: { responseSlaHours: 9999 },
    };
    expect(ModerationManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts banPolicy with IP + hardware bans enabled", () => {
    const ok = {
      reportCategories: [{ id: "c", name: "C", defaultAction: "warn" }],
      banPolicy: {
        allowIpBan: true,
        allowHardwareBan: true,
        cascadeToLinkedAccounts: true,
      },
    };
    expect(ModerationManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects banPolicy postBanItemHoldHours > 8760 (1 year)", () => {
    const bad = {
      reportCategories: [{ id: "c", name: "C", defaultAction: "warn" }],
      banPolicy: { postBanItemHoldHours: 99999 },
    };
    expect(ModerationManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects bad category id format", () => {
    const bad = {
      reportCategories: [
        { id: "Has Spaces", name: "A", defaultAction: "warn" },
      ],
    };
    expect(ModerationManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects bad filterRule id format", () => {
    const bad = {
      reportCategories: [{ id: "c", name: "C", defaultAction: "warn" }],
      filterRules: [
        {
          id: "Has Spaces",
          name: "F",
          matchKind: "exactWord",
          patternAssetRef: "p",
          action: "censor",
        },
      ],
    };
    expect(ModerationManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects bad patternAssetRef format", () => {
    const bad = {
      reportCategories: [{ id: "c", name: "C", defaultAction: "warn" }],
      filterRules: [
        {
          id: "f",
          name: "F",
          matchKind: "exactWord",
          patternAssetRef: "Has Spaces",
          action: "censor",
        },
      ],
    };
    expect(ModerationManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown top-level field (strict mode)", () => {
    const bad = { extra: "nope" };
    expect(ModerationManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown reportCategory field (strict mode)", () => {
    const bad = {
      reportCategories: [
        { id: "c", name: "C", defaultAction: "warn", extra: "nope" },
      ],
    };
    expect(ModerationManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown reportRateLimits field (strict mode)", () => {
    const bad = {
      reportCategories: [{ id: "c", name: "C", defaultAction: "warn" }],
      reportRateLimits: { extra: "nope" },
    };
    expect(ModerationManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown appeals field (strict mode)", () => {
    const bad = {
      reportCategories: [{ id: "c", name: "C", defaultAction: "warn" }],
      appeals: { extra: "nope" },
    };
    expect(ModerationManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts cooldownHoursBeforeFiling=0 (no cooldown)", () => {
    const ok = {
      reportCategories: [{ id: "c", name: "C", defaultAction: "warn" }],
      appeals: { cooldownHoursBeforeFiling: 0 },
    };
    expect(ModerationManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("accepts autoModeration windowHours=1", () => {
    const ok = {
      reportCategories: [{ id: "c", name: "C", defaultAction: "warn" }],
      autoModeration: { windowHours: 1 },
    };
    expect(ModerationManifestSchema.safeParse(ok).success).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import {
  CommunicationRulesSchema,
  ContentRulesSchema,
  GuardianWorkflowSchema,
  ParentalControlsManifestSchema,
  ParentalProfileSchema,
  PlayTimeRulesSchema,
  SpendRulesSchema,
} from "./parental-controls.js";

describe("PlayTimeRulesSchema", () => {
  it("accepts all-unlimited defaults", () => {
    const r = PlayTimeRulesSchema.parse({});
    expect(r.maxMinutesPerDay).toBe(0);
    expect(r.allowedEndHourLocal).toBe(24);
  });

  it("rejects endHour <= startHour", () => {
    expect(() =>
      PlayTimeRulesSchema.parse({
        allowedStartHourLocal: 20,
        allowedEndHourLocal: 20,
      }),
    ).toThrow(/allowedEndHourLocal/);
  });

  it("rejects week < day when both set", () => {
    expect(() =>
      PlayTimeRulesSchema.parse({
        maxMinutesPerDay: 300,
        maxMinutesPerWeek: 120,
      }),
    ).toThrow(/maxMinutesPerWeek/);
  });

  it("rejects break interval without duration", () => {
    expect(() =>
      PlayTimeRulesSchema.parse({
        breakReminderIntervalMin: 45,
        breakDurationMin: 0,
      }),
    ).toThrow(/breakDurationMin/);
  });

  it("accepts aligned break rules", () => {
    const r = PlayTimeRulesSchema.parse({
      breakReminderIntervalMin: 45,
      breakDurationMin: 5,
    });
    expect(r.breakDurationMin).toBe(5);
  });
});

describe("SpendRulesSchema", () => {
  it("accepts defaults", () => {
    const s = SpendRulesSchema.parse({});
    expect(s.allowPurchases).toBe(true);
  });

  it("rejects week cap < day cap", () => {
    expect(() =>
      SpendRulesSchema.parse({
        maxSpendPerDayMinorUnit: 500,
        maxSpendPerWeekMinorUnit: 100,
      }),
    ).toThrow(/maxSpendPerWeek/);
  });

  it("rejects month cap < week cap", () => {
    expect(() =>
      SpendRulesSchema.parse({
        maxSpendPerWeekMinorUnit: 1000,
        maxSpendPerMonthMinorUnit: 500,
      }),
    ).toThrow(/maxSpendPerMonth/);
  });

  it("rejects requireGuardianApproval with allowPurchases=false", () => {
    expect(() =>
      SpendRulesSchema.parse({
        allowPurchases: false,
        requireGuardianApproval: true,
      }),
    ).toThrow(/meaningless/);
  });
});

describe("CommunicationRulesSchema", () => {
  it("defaults to permissive", () => {
    const c = CommunicationRulesSchema.parse({});
    expect(c.allowWhispers).toBe(true);
    expect(c.allowVoiceChat).toBe(true);
  });

  it("rejects duplicate allowedChatScopes", () => {
    expect(() =>
      CommunicationRulesSchema.parse({
        allowedChatScopes: ["party", "party"],
      }),
    ).toThrow(/unique/);
  });

  it("rejects voice modes with voice disabled", () => {
    expect(() =>
      CommunicationRulesSchema.parse({
        allowVoiceChat: false,
        allowedVoiceModes: ["pushToTalk"],
      }),
    ).toThrow(/must be empty/);
  });

  it("accepts voice disabled with empty modes", () => {
    const c = CommunicationRulesSchema.parse({
      allowVoiceChat: false,
      allowedVoiceModes: [],
    });
    expect(c.allowedVoiceModes).toEqual([]);
  });
});

describe("ContentRulesSchema", () => {
  it("defaults to permissive", () => {
    const c = ContentRulesSchema.parse({});
    expect(c.suppressBloodAndGore).toBe(false);
    expect(c.allowMarketplace).toBe(true);
  });
});

describe("ParentalProfileSchema", () => {
  it("accepts a valid profile", () => {
    const p = ParentalProfileSchema.parse({
      id: "child",
      name: "Child",
      minAccountAgeYears: 0,
      maxAccountAgeYearsExclusive: 13,
    });
    expect(p.priority).toBe(50);
  });

  it("rejects maxAge <= minAge", () => {
    expect(() =>
      ParentalProfileSchema.parse({
        id: "bad",
        name: "Bad",
        minAccountAgeYears: 10,
        maxAccountAgeYearsExclusive: 10,
      }),
    ).toThrow(/maxAccountAgeYearsExclusive/);
  });

  it("accepts open-ended profile (maxAge=0)", () => {
    const p = ParentalProfileSchema.parse({
      id: "adult",
      name: "Adult",
      minAccountAgeYears: 18,
    });
    expect(p.maxAccountAgeYearsExclusive).toBe(0);
  });
});

describe("GuardianWorkflowSchema", () => {
  it("accepts disabled default", () => {
    const g = GuardianWorkflowSchema.parse({});
    expect(g.enabled).toBe(false);
  });

  it("rejects enabled without verify and timeout=0", () => {
    expect(() =>
      GuardianWorkflowSchema.parse({
        enabled: true,
        requireEmailVerification: false,
        approvalTimeoutMin: 0,
      }),
    ).toThrow(/verification or a finite approval timeout/);
  });

  it("accepts enabled with verification", () => {
    const g = GuardianWorkflowSchema.parse({
      enabled: true,
      requireEmailVerification: true,
      approvalTimeoutMin: 0,
    });
    expect(g.enabled).toBe(true);
  });
});

describe("ParentalControlsManifestSchema", () => {
  const childProfile = {
    id: "child",
    name: "Child",
    minAccountAgeYears: 0,
    maxAccountAgeYearsExclusive: 13,
  };
  const adultProfile = {
    id: "adult",
    name: "Adult",
    minAccountAgeYears: 18,
  };

  it("accepts a minimal manifest", () => {
    const m = ParentalControlsManifestSchema.parse({
      profiles: [childProfile],
    });
    expect(m.enabled).toBe(true);
  });

  it("rejects enabled manifest with no profiles", () => {
    expect(() =>
      ParentalControlsManifestSchema.parse({ profiles: [] }),
    ).toThrow(/at least one profile/);
  });

  it("rejects duplicate profile ids", () => {
    expect(() =>
      ParentalControlsManifestSchema.parse({
        profiles: [childProfile, childProfile],
      }),
    ).toThrow(/profile ids/);
  });

  it("rejects unknownAgeFallbackProfileId that doesn't resolve", () => {
    expect(() =>
      ParentalControlsManifestSchema.parse({
        profiles: [childProfile],
        unknownAgeFallbackProfileId: "ghost",
      }),
    ).toThrow(/FallbackProfileId/);
  });

  it("rejects ambiguous (min,max,priority) triples", () => {
    expect(() =>
      ParentalControlsManifestSchema.parse({
        profiles: [childProfile, { ...childProfile, id: "child2" }],
      }),
    ).toThrow(/ambiguous/);
  });

  it("accepts a full multi-profile manifest", () => {
    const m = ParentalControlsManifestSchema.parse({
      profiles: [
        childProfile,
        {
          ...childProfile,
          id: "teen",
          minAccountAgeYears: 13,
          maxAccountAgeYearsExclusive: 18,
        },
        adultProfile,
      ],
      unknownAgeFallbackProfileId: "child",
    });
    expect(m.profiles).toHaveLength(3);
    expect(m.unknownAgeFallbackProfileId).toBe("child");
  });
});

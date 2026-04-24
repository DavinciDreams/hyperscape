/**
 * Tests for the ParentalControlsProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { parentalControlsProvider } from "../ParentalControlsProvider";

beforeEach(() => {
  parentalControlsProvider.unload();
});
afterEach(() => {
  parentalControlsProvider.unload();
});

const validManifest = {
  enabled: true,
  profiles: [
    {
      id: "child",
      name: "Child",
      minAccountAgeYears: 0,
      maxAccountAgeYearsExclusive: 13,
      priority: 100,
      requireGuardianAccount: true,
      playTime: {
        maxMinutesPerDay: 60,
        maxMinutesPerWeek: 300,
        allowedStartHourLocal: 8,
        allowedEndHourLocal: 20,
      },
      spend: {
        allowPurchases: false,
      },
      communication: {
        allowedChatScopes: ["party", "guild"],
        allowVoiceChat: false,
        restrictToFriendsOnly: true,
        forceFamilyFriendlyFilter: true,
      },
      content: {
        suppressBloodAndGore: true,
        suppressProfanity: true,
        suppressMatureThemes: true,
      },
    },
    {
      id: "teen",
      name: "Teen",
      minAccountAgeYears: 13,
      maxAccountAgeYearsExclusive: 18,
      priority: 50,
    },
    {
      id: "adult",
      name: "Adult",
      minAccountAgeYears: 18,
      priority: 0,
    },
  ],
  unknownAgeFallbackProfileId: "child",
};

describe("ParentalControlsProvider", () => {
  it("starts unloaded", () => {
    expect(parentalControlsProvider.isLoaded()).toBe(false);
    expect(parentalControlsProvider.getManifest()).toBeNull();
  });

  it("loadRaw() accepts a valid manifest and fills defaults", () => {
    const parsed = parentalControlsProvider.loadRaw(validManifest);
    expect(parsed.enabled).toBe(true);
    expect(parsed.profiles.length).toBe(3);
    expect(parsed.profiles[0].playTime.maxMinutesPerDay).toBe(60);
    expect(parsed.profiles[1].playTime.maxMinutesPerDay).toBe(0);
    expect(parsed.profiles[2].spend.allowPurchases).toBe(true);
    expect(parsed.allowAdultOptIn).toBe(true);
    expect(parsed.guardian.enabled).toBe(false);
    expect(parentalControlsProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() accepts disabled blob with no profiles", () => {
    const parsed = parentalControlsProvider.loadRaw({ enabled: false });
    expect(parsed.enabled).toBe(false);
    expect(parsed.profiles.length).toBe(0);
    expect(parentalControlsProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() rejects enabled=true with no profiles", () => {
    expect(() =>
      parentalControlsProvider.loadRaw({ enabled: true, profiles: [] }),
    ).toThrow();
    expect(parentalControlsProvider.isLoaded()).toBe(false);
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = parentalControlsProvider.loadRaw(validManifest);
    parentalControlsProvider.unload();
    parentalControlsProvider.load(parsed);
    expect(parentalControlsProvider.isLoaded()).toBe(true);
    expect(parentalControlsProvider.getManifest()?.profiles.length).toBe(3);
  });

  it("loadRaw() rejects duplicate profile ids", () => {
    const bad = {
      enabled: true,
      profiles: [
        { id: "dup", name: "A", minAccountAgeYears: 0 },
        { id: "dup", name: "B", minAccountAgeYears: 18 },
      ],
    };
    expect(() => parentalControlsProvider.loadRaw(bad)).toThrow();
    expect(parentalControlsProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects unknownAgeFallbackProfileId pointing at a non-declared profile", () => {
    const bad = {
      enabled: true,
      profiles: [{ id: "adult", name: "Adult", minAccountAgeYears: 18 }],
      unknownAgeFallbackProfileId: "ghost",
    };
    expect(() => parentalControlsProvider.loadRaw(bad)).toThrow();
    expect(parentalControlsProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects two profiles sharing (minAge,maxAge,priority) triple", () => {
    const bad = {
      enabled: true,
      profiles: [
        {
          id: "a",
          name: "A",
          minAccountAgeYears: 10,
          maxAccountAgeYearsExclusive: 15,
          priority: 50,
        },
        {
          id: "b",
          name: "B",
          minAccountAgeYears: 10,
          maxAccountAgeYearsExclusive: 15,
          priority: 50,
        },
      ],
    };
    expect(() => parentalControlsProvider.loadRaw(bad)).toThrow();
    expect(parentalControlsProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects maxAge <= minAge when maxAge set", () => {
    const bad = {
      enabled: true,
      profiles: [
        {
          id: "p",
          name: "P",
          minAccountAgeYears: 15,
          maxAccountAgeYearsExclusive: 10,
        },
      ],
    };
    expect(() => parentalControlsProvider.loadRaw(bad)).toThrow();
    expect(parentalControlsProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects playTime endHour <= startHour", () => {
    const bad = {
      enabled: true,
      profiles: [
        {
          id: "p",
          name: "P",
          minAccountAgeYears: 0,
          playTime: {
            allowedStartHourLocal: 22,
            allowedEndHourLocal: 10,
          },
        },
      ],
    };
    expect(() => parentalControlsProvider.loadRaw(bad)).toThrow();
    expect(parentalControlsProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects playTime week < day when both set", () => {
    const bad = {
      enabled: true,
      profiles: [
        {
          id: "p",
          name: "P",
          minAccountAgeYears: 0,
          playTime: {
            maxMinutesPerDay: 300,
            maxMinutesPerWeek: 100,
          },
        },
      ],
    };
    expect(() => parentalControlsProvider.loadRaw(bad)).toThrow();
    expect(parentalControlsProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects breakReminderIntervalMin enabled without breakDurationMin", () => {
    const bad = {
      enabled: true,
      profiles: [
        {
          id: "p",
          name: "P",
          minAccountAgeYears: 0,
          playTime: {
            breakReminderIntervalMin: 30,
            breakDurationMin: 0,
          },
        },
      ],
    };
    expect(() => parentalControlsProvider.loadRaw(bad)).toThrow();
    expect(parentalControlsProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects spend month < week", () => {
    const bad = {
      enabled: true,
      profiles: [
        {
          id: "p",
          name: "P",
          minAccountAgeYears: 0,
          spend: {
            maxSpendPerWeekMinorUnit: 5000,
            maxSpendPerMonthMinorUnit: 1000,
          },
        },
      ],
    };
    expect(() => parentalControlsProvider.loadRaw(bad)).toThrow();
    expect(parentalControlsProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects requireGuardianApproval=true when allowPurchases=false", () => {
    const bad = {
      enabled: true,
      profiles: [
        {
          id: "p",
          name: "P",
          minAccountAgeYears: 0,
          spend: {
            allowPurchases: false,
            requireGuardianApproval: true,
          },
        },
      ],
    };
    expect(() => parentalControlsProvider.loadRaw(bad)).toThrow();
    expect(parentalControlsProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects allowedVoiceModes when allowVoiceChat=false", () => {
    const bad = {
      enabled: true,
      profiles: [
        {
          id: "p",
          name: "P",
          minAccountAgeYears: 0,
          communication: {
            allowVoiceChat: false,
            allowedVoiceModes: ["pushToTalk"],
          },
        },
      ],
    };
    expect(() => parentalControlsProvider.loadRaw(bad)).toThrow();
    expect(parentalControlsProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects duplicate allowedChatScopes", () => {
    const bad = {
      enabled: true,
      profiles: [
        {
          id: "p",
          name: "P",
          minAccountAgeYears: 0,
          communication: {
            allowedChatScopes: ["party", "party"],
          },
        },
      ],
    };
    expect(() => parentalControlsProvider.loadRaw(bad)).toThrow();
    expect(parentalControlsProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects guardian enabled without verification or finite timeout", () => {
    const bad = {
      enabled: true,
      profiles: [{ id: "adult", name: "Adult", minAccountAgeYears: 18 }],
      guardian: {
        enabled: true,
        requireEmailVerification: false,
        approvalTimeoutMin: 0,
      },
    };
    expect(() => parentalControlsProvider.loadRaw(bad)).toThrow();
    expect(parentalControlsProvider.isLoaded()).toBe(false);
  });

  it("hotReload(manifest) replaces the current manifest", () => {
    parentalControlsProvider.loadRaw(validManifest);
    const replacement = parentalControlsProvider.loadRaw({
      enabled: false,
    });
    parentalControlsProvider.hotReload(replacement);
    expect(parentalControlsProvider.getManifest()?.enabled).toBe(false);
    expect(parentalControlsProvider.getManifest()?.profiles.length).toBe(0);
  });

  it("hotReload(null) clears", () => {
    parentalControlsProvider.loadRaw(validManifest);
    parentalControlsProvider.hotReload(null);
    expect(parentalControlsProvider.isLoaded()).toBe(false);
  });

  it("unload() resets", () => {
    parentalControlsProvider.loadRaw(validManifest);
    parentalControlsProvider.unload();
    expect(parentalControlsProvider.isLoaded()).toBe(false);
    expect(parentalControlsProvider.getManifest()).toBeNull();
  });
});

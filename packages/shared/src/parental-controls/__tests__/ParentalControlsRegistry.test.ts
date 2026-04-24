import { ParentalControlsManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import {
  ParentalControlsNotLoadedError,
  ParentalControlsRegistry,
  UnknownParentalProfileError,
} from "../ParentalControlsRegistry.js";

function manifest() {
  return ParentalControlsManifestSchema.parse({
    enabled: true,
    profiles: [
      {
        id: "child",
        name: "Child",
        minAccountAgeYears: 0,
        maxAccountAgeYearsExclusive: 13,
        priority: 90,
        playTime: { allowedEndHourLocal: 20 },
        spend: {
          allowPurchases: false,
        },
        communication: {
          allowedChatScopes: ["party"],
          allowWhispers: false,
          allowVoiceChat: false,
        },
        content: {
          suppressBloodAndGore: true,
          suppressProfanity: true,
        },
      },
      {
        id: "teen",
        name: "Teen",
        minAccountAgeYears: 13,
        maxAccountAgeYearsExclusive: 18,
        priority: 50,
        spend: {
          allowPurchases: true,
          maxSingleTransactionMinorUnit: 2000,
        },
        communication: {
          allowedChatScopes: ["global", "party", "guild"],
          allowVoiceChat: true,
          allowedVoiceModes: ["pushToTalk"],
        },
      },
      {
        id: "adult",
        name: "Adult",
        minAccountAgeYears: 18,
        priority: 10,
        communication: {
          allowedChatScopes: [
            "global",
            "zone",
            "party",
            "guild",
            "whisper",
            "system",
          ],
          allowVoiceChat: true,
          allowedVoiceModes: ["pushToTalk", "openMic", "voiceActivation"],
        },
      },
    ],
    unknownAgeFallbackProfileId: "child",
  });
}

describe("ParentalControlsRegistry — not loaded", () => {
  it("throws pre-load", () => {
    expect(() => new ParentalControlsRegistry().manifest).toThrow(
      ParentalControlsNotLoadedError,
    );
  });
});

describe("ParentalControlsRegistry — lookup", () => {
  it("by id", () => {
    const r = new ParentalControlsRegistry(manifest());
    expect(r.has("child")).toBe(true);
    expect(r.profile("adult").name).toBe("Adult");
  });

  it("throws on unknown id", () => {
    const r = new ParentalControlsRegistry(manifest());
    expect(() => r.profile("ghost")).toThrow(UnknownParentalProfileError);
  });
});

describe("ParentalControlsRegistry — profileForAge", () => {
  it("age 8 → child", () => {
    const r = new ParentalControlsRegistry(manifest());
    expect(r.profileForAge(8)?.id).toBe("child");
  });

  it("age 14 → teen", () => {
    const r = new ParentalControlsRegistry(manifest());
    expect(r.profileForAge(14)?.id).toBe("teen");
  });

  it("age 25 → adult", () => {
    const r = new ParentalControlsRegistry(manifest());
    expect(r.profileForAge(25)?.id).toBe("adult");
  });

  it("null age → fallback profile", () => {
    const r = new ParentalControlsRegistry(manifest());
    expect(r.profileForAge(null)?.id).toBe("child");
  });

  it("null age + no fallback → undefined", () => {
    const m = ParentalControlsManifestSchema.parse({
      enabled: true,
      profiles: [
        {
          id: "adult",
          name: "Adult",
          minAccountAgeYears: 18,
        },
      ],
    });
    const r = new ParentalControlsRegistry(m);
    expect(r.profileForAge(null)).toBeUndefined();
  });
});

describe("ParentalControlsRegistry — chat/voice gates", () => {
  it("child cannot use global chat", () => {
    const r = new ParentalControlsRegistry(manifest());
    expect(r.canUseChatScope("child", "global")).toBe(false);
    expect(r.canUseChatScope("child", "party")).toBe(true);
  });

  it("child cannot use voice at all", () => {
    const r = new ParentalControlsRegistry(manifest());
    expect(r.canUseVoiceMode("child", "pushToTalk")).toBe(false);
  });

  it("teen can use push-to-talk only", () => {
    const r = new ParentalControlsRegistry(manifest());
    expect(r.canUseVoiceMode("teen", "pushToTalk")).toBe(true);
    expect(r.canUseVoiceMode("teen", "openMic")).toBe(false);
  });

  it("adult can use all voice modes", () => {
    const r = new ParentalControlsRegistry(manifest());
    expect(r.canUseVoiceMode("adult", "openMic")).toBe(true);
    expect(r.canUseVoiceMode("adult", "voiceActivation")).toBe(true);
  });
});

describe("ParentalControlsRegistry — purchase cap", () => {
  it("child cannot purchase at all", () => {
    const r = new ParentalControlsRegistry(manifest());
    expect(r.canAffordSingleTransaction("child", 100)).toBe(false);
  });

  it("teen within single-txn cap", () => {
    const r = new ParentalControlsRegistry(manifest());
    expect(r.canAffordSingleTransaction("teen", 1500)).toBe(true);
    expect(r.canAffordSingleTransaction("teen", 2500)).toBe(false);
  });

  it("adult with no cap", () => {
    const r = new ParentalControlsRegistry(manifest());
    expect(r.canAffordSingleTransaction("adult", 999_999)).toBe(true);
  });
});

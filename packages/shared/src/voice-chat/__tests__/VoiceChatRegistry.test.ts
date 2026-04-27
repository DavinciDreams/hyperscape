import { VoiceChatManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it, vi } from "vitest";
import {
  UnknownVoiceRoomError,
  VoiceChatNotLoadedError,
  VoiceChatRegistry,
} from "../VoiceChatRegistry.js";

function manifest() {
  return VoiceChatManifestSchema.parse({
    enabled: true,
    rooms: [
      {
        id: "proximityZone",
        name: "Proximity",
        scope: "proximity",
        defaultTransmissionMode: "voiceActivation",
        maxSpeakers: 20,
        maxParticipants: 100,
        proximityFalloff: {
          minRadiusMeters: 2,
          maxRadiusMeters: 20,
          curve: "linear",
          occludeBehindGeometry: true,
          occlusionAttenuation: 0.3,
        },
        minSpeakLevel: 0,
      },
      {
        id: "partyRoom",
        name: "Party",
        scope: "party",
        defaultTransmissionMode: "openMic",
        maxSpeakers: 5,
        maxParticipants: 5,
      },
      {
        id: "globalRoom",
        name: "Global",
        scope: "global",
        defaultTransmissionMode: "pushToTalk",
        maxParticipants: 200,
        minSpeakLevel: 10,
      },
      {
        id: "storyScene1",
        name: "Story Scene 1",
        scope: "custom",
        customKey: "intro",
      },
    ],
    autoMute: {
      muteUntilAccountAgeDays: 3,
      muteBelowCharacterLevel: 5,
      muteOnOpenReports: 3,
      openReportsLookbackHours: 24,
    },
    muteDefaults: {
      startMuted: false,
      startDeafened: false,
      allowPerRoomSelfMute: true,
      allowIndividualMute: true,
    },
    codec: {
      codec: "opus",
      maxBitrateKbps: 32,
    },
    forcePushToTalk: false,
    recordForModeration: true,
    moderationRecordingRetentionHours: 48,
  });
}

describe("VoiceChatRegistry — not loaded", () => {
  it("throws pre-load", () => {
    expect(() => new VoiceChatRegistry().manifest).toThrow(
      VoiceChatNotLoadedError,
    );
  });
});

describe("VoiceChatRegistry — rooms", () => {
  it("indexes by id", () => {
    const r = new VoiceChatRegistry(manifest());
    expect(r.has("proximityZone")).toBe(true);
    expect(r.get("partyRoom").scope).toBe("party");
  });

  it("throws on unknown room", () => {
    const r = new VoiceChatRegistry(manifest());
    expect(() => r.get("ghost")).toThrow(UnknownVoiceRoomError);
  });

  it("resolves room by scope", () => {
    const r = new VoiceChatRegistry(manifest());
    expect(r.roomForScope("party")?.id).toBe("partyRoom");
    expect(r.roomForScope("guild")).toBeNull();
    expect(r.roomForScope("custom")).toBeNull();
  });

  it("returns all rooms for a scope", () => {
    const r = new VoiceChatRegistry(manifest());
    expect(r.roomsByScope("custom").map((x) => x.id)).toEqual(["storyScene1"]);
  });
});

describe("VoiceChatRegistry — transmission", () => {
  it("returns room default", () => {
    const r = new VoiceChatRegistry(manifest());
    expect(r.effectiveTransmissionMode("partyRoom")).toBe("openMic");
  });

  it("forcePushToTalk overrides", () => {
    const r = new VoiceChatRegistry();
    r.loadFromJson({
      enabled: true,
      forcePushToTalk: true,
      rooms: [
        {
          id: "partyRoom",
          name: "Party",
          scope: "party",
          defaultTransmissionMode: "openMic",
        },
      ],
    });
    expect(r.effectiveTransmissionMode("partyRoom")).toBe("pushToTalk");
  });
});

describe("VoiceChatRegistry — proximity", () => {
  it("full volume at or under min", () => {
    const r = new VoiceChatRegistry(manifest());
    expect(r.proximityGain("proximityZone", 1)).toBe(1);
    expect(r.proximityGain("proximityZone", 2)).toBe(1);
  });

  it("zero beyond max", () => {
    const r = new VoiceChatRegistry(manifest());
    expect(r.proximityGain("proximityZone", 20)).toBe(0);
    expect(r.proximityGain("proximityZone", 100)).toBe(0);
  });

  it("linear interpolation", () => {
    const r = new VoiceChatRegistry(manifest());
    expect(r.proximityGain("proximityZone", 11)).toBeCloseTo(0.5, 2);
  });

  it("applies occlusion attenuation when blocked", () => {
    const r = new VoiceChatRegistry(manifest());
    expect(r.proximityGainWithOcclusion("proximityZone", 2, false)).toBe(1);
    expect(r.proximityGainWithOcclusion("proximityZone", 2, true)).toBeCloseTo(
      0.3,
      4,
    );
  });

  it("no falloff for non-proximity rooms", () => {
    const r = new VoiceChatRegistry(manifest());
    expect(r.proximityGain("globalRoom", 9999)).toBe(1);
    expect(r.getProximityFalloff("globalRoom")).toBeNull();
  });
});

describe("VoiceChatRegistry — join + speak gates", () => {
  it("allows join under caps", () => {
    const r = new VoiceChatRegistry(manifest());
    expect(r.checkJoin("partyRoom", 3, 50).allowed).toBe(true);
  });

  it("rejects at participant cap", () => {
    const r = new VoiceChatRegistry(manifest());
    expect(r.checkJoin("partyRoom", 5, 50).reason).toBe("at-participant-cap");
  });

  it("rejects below speak level", () => {
    const r = new VoiceChatRegistry(manifest());
    expect(r.checkJoin("globalRoom", 0, 5).reason).toBe("below-speak-level");
  });

  it("enforces speaker cap", () => {
    const r = new VoiceChatRegistry(manifest());
    expect(r.canSpeak("partyRoom", 4)).toBe(true);
    expect(r.canSpeak("partyRoom", 5)).toBe(false);
  });
});

describe("VoiceChatRegistry — auto-mute", () => {
  it("not muted for trusted player", () => {
    const r = new VoiceChatRegistry(manifest());
    const out = r.classifyAutoMute({
      accountAgeDays: 30,
      characterLevel: 50,
      openReportsInLookback: 0,
    });
    expect(out.muted).toBe(false);
  });

  it("mutes new account", () => {
    const r = new VoiceChatRegistry(manifest());
    const out = r.classifyAutoMute({
      accountAgeDays: 1,
      characterLevel: 50,
      openReportsInLookback: 0,
    });
    expect(out.reason).toBe("account-too-new");
  });

  it("mutes low level", () => {
    const r = new VoiceChatRegistry(manifest());
    const out = r.classifyAutoMute({
      accountAgeDays: 10,
      characterLevel: 3,
      openReportsInLookback: 0,
    });
    expect(out.reason).toBe("below-character-level");
  });

  it("mutes on reports", () => {
    const r = new VoiceChatRegistry(manifest());
    const out = r.classifyAutoMute({
      accountAgeDays: 30,
      characterLevel: 50,
      openReportsInLookback: 3,
    });
    expect(out.reason).toBe("too-many-open-reports");
  });
});

describe("VoiceChatRegistry — moderation recording", () => {
  it("retains within window", () => {
    const r = new VoiceChatRegistry(manifest());
    expect(r.isModerationRecordingRetained(10)).toBe(true);
    expect(r.isModerationRecordingRetained(48)).toBe(false);
  });

  it("returns false when not recording", () => {
    const r = new VoiceChatRegistry();
    r.loadFromJson({
      enabled: true,
      rooms: [
        {
          id: "partyRoom",
          name: "Party",
          scope: "party",
        },
      ],
      recordForModeration: false,
    });
    expect(r.isModerationRecordingRetained(0)).toBe(false);
  });
});

describe("VoiceChatRegistry — onReloaded", () => {
  it("fires after every successful load()", () => {
    const r = new VoiceChatRegistry();
    const cb = vi.fn();
    r.onReloaded(cb);
    r.load(manifest());
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("returned unsubscribe stops further notifications", () => {
    const r = new VoiceChatRegistry();
    const cb = vi.fn();
    const off = r.onReloaded(cb);
    r.load(manifest());
    off();
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("a throwing listener does not break subsequent listeners", () => {
    const r = new VoiceChatRegistry();
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

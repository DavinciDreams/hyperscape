import { describe, expect, it } from "vitest";
import {
  AutoMuteRulesSchema,
  CodecRulesSchema,
  MuteDefaultsSchema,
  ProximityFalloffSchema,
  VoiceActivationRulesSchema,
  VoiceChatManifestSchema,
  VoiceRoomSchema,
} from "./voice-chat.js";

describe("ProximityFalloffSchema", () => {
  it("accepts a valid falloff", () => {
    const p = ProximityFalloffSchema.parse({
      minRadiusMeters: 2,
      maxRadiusMeters: 30,
    });
    expect(p.curve).toBe("inverseSquare");
  });

  it("rejects max <= min", () => {
    expect(() =>
      ProximityFalloffSchema.parse({
        minRadiusMeters: 10,
        maxRadiusMeters: 10,
      }),
    ).toThrow(/greater than minRadiusMeters/);
  });
});

describe("VoiceRoomSchema", () => {
  it("accepts a proximity room with falloff", () => {
    const r = VoiceRoomSchema.parse({
      id: "worldProx",
      name: "World Proximity",
      scope: "proximity",
      proximityFalloff: {},
    });
    expect(r.scope).toBe("proximity");
  });

  it("rejects proximity room without falloff", () => {
    expect(() =>
      VoiceRoomSchema.parse({
        id: "worldProx",
        name: "W",
        scope: "proximity",
      }),
    ).toThrow(/proximityFalloff/);
  });

  it("rejects non-proximity room with falloff", () => {
    expect(() =>
      VoiceRoomSchema.parse({
        id: "partyRoom",
        name: "Party",
        scope: "party",
        proximityFalloff: {},
      }),
    ).toThrow(/must not declare proximityFalloff/);
  });

  it("rejects custom scope without customKey", () => {
    expect(() =>
      VoiceRoomSchema.parse({
        id: "storyRoom",
        name: "S",
        scope: "custom",
      }),
    ).toThrow(/customKey/);
  });

  it("rejects maxSpeakers > maxParticipants", () => {
    expect(() =>
      VoiceRoomSchema.parse({
        id: "r",
        name: "r",
        scope: "party",
        maxSpeakers: 10,
        maxParticipants: 5,
      }),
    ).toThrow(/maxParticipants/);
  });

  it("allows maxSpeakers=0 or maxParticipants=0 (unlimited)", () => {
    const r = VoiceRoomSchema.parse({
      id: "party",
      name: "Party",
      scope: "party",
      maxSpeakers: 10,
      maxParticipants: 0,
    });
    expect(r.maxParticipants).toBe(0);
  });
});

describe("AutoMuteRulesSchema", () => {
  it("defaults to all-off", () => {
    const r = AutoMuteRulesSchema.parse({});
    expect(r.muteUntilAccountAgeDays).toBe(0);
  });

  it("accepts positive thresholds", () => {
    const r = AutoMuteRulesSchema.parse({
      muteUntilAccountAgeDays: 7,
      muteOnOpenReports: 3,
      openReportsLookbackHours: 72,
    });
    expect(r.muteOnOpenReports).toBe(3);
  });
});

describe("MuteDefaultsSchema", () => {
  it("defaults to unmuted", () => {
    const m = MuteDefaultsSchema.parse({});
    expect(m.startMuted).toBe(false);
    expect(m.allowIndividualMute).toBe(true);
  });
});

describe("CodecRulesSchema", () => {
  it("defaults to opus 32kbps", () => {
    const c = CodecRulesSchema.parse({});
    expect(c.codec).toBe("opus");
    expect(c.maxBitrateKbps).toBe(32);
  });

  it("requires 64kbps for g722", () => {
    expect(() =>
      CodecRulesSchema.parse({ codec: "g722", maxBitrateKbps: 32 }),
    ).toThrow(/g722/);
  });

  it("accepts g722 at 64kbps", () => {
    const c = CodecRulesSchema.parse({
      codec: "g722",
      maxBitrateKbps: 64,
    });
    expect(c.codec).toBe("g722");
  });
});

describe("VoiceActivationRulesSchema", () => {
  it("defaults reasonable thresholds", () => {
    const v = VoiceActivationRulesSchema.parse({});
    expect(v.thresholdDb).toBe(-40);
    expect(v.attackMs).toBe(20);
  });

  it("rejects threshold above 0 dB", () => {
    expect(() =>
      VoiceActivationRulesSchema.parse({ thresholdDb: 5 }),
    ).toThrow();
  });
});

describe("VoiceChatManifestSchema", () => {
  const proxRoom = {
    id: "worldProx",
    name: "World Proximity",
    scope: "proximity" as const,
    proximityFalloff: {},
  };
  const partyRoom = {
    id: "partyVoice",
    name: "Party Voice",
    scope: "party" as const,
  };

  it("accepts a minimal manifest with one room", () => {
    const m = VoiceChatManifestSchema.parse({
      rooms: [proxRoom],
    });
    expect(m.enabled).toBe(true);
  });

  it("rejects enabled manifest with no rooms", () => {
    expect(() => VoiceChatManifestSchema.parse({ rooms: [] })).toThrow(
      /at least one room/,
    );
  });

  it("allows disabled manifest with no rooms", () => {
    const m = VoiceChatManifestSchema.parse({
      enabled: false,
      rooms: [],
    });
    expect(m.enabled).toBe(false);
  });

  it("rejects duplicate room ids", () => {
    expect(() =>
      VoiceChatManifestSchema.parse({
        rooms: [proxRoom, proxRoom],
      }),
    ).toThrow(/unique/);
  });

  it("rejects two rooms in the same non-custom scope", () => {
    expect(() =>
      VoiceChatManifestSchema.parse({
        rooms: [partyRoom, { ...partyRoom, id: "partyRoom2" }],
      }),
    ).toThrow(/at most one room per non-custom scope/);
  });

  it("allows multiple custom-scope rooms", () => {
    const m = VoiceChatManifestSchema.parse({
      rooms: [
        {
          id: "story1",
          name: "Story 1",
          scope: "custom",
          customKey: "cutscene1",
        },
        {
          id: "story2",
          name: "Story 2",
          scope: "custom",
          customKey: "cutscene2",
        },
      ],
    });
    expect(m.rooms).toHaveLength(2);
  });

  it("rejects recordForModeration without retention", () => {
    expect(() =>
      VoiceChatManifestSchema.parse({
        rooms: [proxRoom],
        recordForModeration: true,
        moderationRecordingRetentionHours: 0,
      }),
    ).toThrow(/Retention/);
  });

  it("accepts recordForModeration with retention > 0", () => {
    const m = VoiceChatManifestSchema.parse({
      rooms: [proxRoom],
      recordForModeration: true,
      moderationRecordingRetentionHours: 48,
    });
    expect(m.recordForModeration).toBe(true);
  });
});

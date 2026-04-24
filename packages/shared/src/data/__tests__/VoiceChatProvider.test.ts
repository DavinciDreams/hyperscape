/**
 * Tests for the VoiceChatProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { voiceChatProvider } from "../VoiceChatProvider";

beforeEach(() => {
  voiceChatProvider.unload();
});
afterEach(() => {
  voiceChatProvider.unload();
});

const validManifest = {
  enabled: true,
  rooms: [
    {
      id: "proxRoom",
      name: "Proximity",
      scope: "proximity" as const,
      proximityFalloff: {
        minRadiusMeters: 2,
        maxRadiusMeters: 20,
      },
    },
    {
      id: "partyRoom",
      name: "Party",
      scope: "party" as const,
    },
    {
      id: "customStory",
      name: "Story Scene",
      scope: "custom" as const,
      customKey: "chapter1Intro",
    },
  ],
};

describe("VoiceChatProvider", () => {
  it("starts unloaded", () => {
    expect(voiceChatProvider.isLoaded()).toBe(false);
    expect(voiceChatProvider.getManifest()).toBeNull();
  });

  it("loadRaw() accepts a valid manifest and fills defaults", () => {
    const parsed = voiceChatProvider.loadRaw(validManifest);
    expect(parsed.enabled).toBe(true);
    expect(parsed.rooms.length).toBe(3);
    expect(parsed.codec.codec).toBe("opus");
    expect(parsed.codec.maxBitrateKbps).toBe(32);
    expect(parsed.muteDefaults.allowPerRoomSelfMute).toBe(true);
    expect(parsed.voiceActivation.thresholdDb).toBe(-40);
    expect(parsed.forcePushToTalk).toBe(false);
    expect(voiceChatProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() accepts disabled blob with no rooms", () => {
    const parsed = voiceChatProvider.loadRaw({ enabled: false });
    expect(parsed.enabled).toBe(false);
    expect(parsed.rooms.length).toBe(0);
    expect(voiceChatProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() rejects enabled=true with no rooms", () => {
    expect(() =>
      voiceChatProvider.loadRaw({ enabled: true, rooms: [] }),
    ).toThrow();
    expect(voiceChatProvider.isLoaded()).toBe(false);
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = voiceChatProvider.loadRaw(validManifest);
    voiceChatProvider.unload();
    voiceChatProvider.load(parsed);
    expect(voiceChatProvider.isLoaded()).toBe(true);
    expect(voiceChatProvider.getManifest()?.rooms.length).toBe(3);
  });

  it("loadRaw() rejects duplicate room ids", () => {
    const bad = {
      enabled: true,
      rooms: [
        {
          id: "dup",
          name: "A",
          scope: "proximity" as const,
          proximityFalloff: { minRadiusMeters: 1, maxRadiusMeters: 10 },
        },
        { id: "dup", name: "B", scope: "party" as const },
      ],
    };
    expect(() => voiceChatProvider.loadRaw(bad)).toThrow();
    expect(voiceChatProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects two rooms sharing the same non-custom scope", () => {
    const bad = {
      enabled: true,
      rooms: [
        { id: "p1", name: "P1", scope: "party" as const },
        { id: "p2", name: "P2", scope: "party" as const },
      ],
    };
    expect(() => voiceChatProvider.loadRaw(bad)).toThrow();
    expect(voiceChatProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() accepts multiple custom-scope rooms", () => {
    const parsed = voiceChatProvider.loadRaw({
      enabled: true,
      rooms: [
        {
          id: "c1",
          name: "C1",
          scope: "custom" as const,
          customKey: "one",
        },
        {
          id: "c2",
          name: "C2",
          scope: "custom" as const,
          customKey: "two",
        },
      ],
    });
    expect(parsed.rooms.length).toBe(2);
  });

  it("loadRaw() rejects proximity room without proximityFalloff", () => {
    const bad = {
      enabled: true,
      rooms: [{ id: "prox", name: "Prox", scope: "proximity" as const }],
    };
    expect(() => voiceChatProvider.loadRaw(bad)).toThrow();
    expect(voiceChatProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects non-proximity room declaring proximityFalloff", () => {
    const bad = {
      enabled: true,
      rooms: [
        {
          id: "party",
          name: "Party",
          scope: "party" as const,
          proximityFalloff: { minRadiusMeters: 2, maxRadiusMeters: 20 },
        },
      ],
    };
    expect(() => voiceChatProvider.loadRaw(bad)).toThrow();
    expect(voiceChatProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects custom-scope room missing customKey", () => {
    const bad = {
      enabled: true,
      rooms: [{ id: "cust", name: "Cust", scope: "custom" as const }],
    };
    expect(() => voiceChatProvider.loadRaw(bad)).toThrow();
    expect(voiceChatProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects proximity falloff max<=min", () => {
    const bad = {
      enabled: true,
      rooms: [
        {
          id: "prox",
          name: "Prox",
          scope: "proximity" as const,
          proximityFalloff: {
            minRadiusMeters: 10,
            maxRadiusMeters: 10,
          },
        },
      ],
    };
    expect(() => voiceChatProvider.loadRaw(bad)).toThrow();
    expect(voiceChatProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects maxSpeakers > maxParticipants", () => {
    const bad = {
      enabled: true,
      rooms: [
        {
          id: "party",
          name: "Party",
          scope: "party" as const,
          maxSpeakers: 10,
          maxParticipants: 5,
        },
      ],
    };
    expect(() => voiceChatProvider.loadRaw(bad)).toThrow();
    expect(voiceChatProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects g722 codec with bitrate != 64", () => {
    const bad = {
      enabled: true,
      rooms: [{ id: "party", name: "Party", scope: "party" as const }],
      codec: { codec: "g722", maxBitrateKbps: 32 },
    };
    expect(() => voiceChatProvider.loadRaw(bad)).toThrow();
    expect(voiceChatProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() accepts g722 codec with bitrate=64", () => {
    const parsed = voiceChatProvider.loadRaw({
      enabled: true,
      rooms: [{ id: "party", name: "Party", scope: "party" as const }],
      codec: { codec: "g722", maxBitrateKbps: 64 },
    });
    expect(parsed.codec.codec).toBe("g722");
    expect(parsed.codec.maxBitrateKbps).toBe(64);
  });

  it("loadRaw() rejects recordForModeration=true with retentionHours=0", () => {
    const bad = {
      enabled: true,
      rooms: [{ id: "party", name: "Party", scope: "party" as const }],
      recordForModeration: true,
      moderationRecordingRetentionHours: 0,
    };
    expect(() => voiceChatProvider.loadRaw(bad)).toThrow();
    expect(voiceChatProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects auto-mute reports>0 with lookbackHours=0", () => {
    const bad = {
      enabled: true,
      rooms: [{ id: "party", name: "Party", scope: "party" as const }],
      autoMute: {
        muteOnOpenReports: 3,
        openReportsLookbackHours: 0,
      },
    };
    expect(() => voiceChatProvider.loadRaw(bad)).toThrow();
    expect(voiceChatProvider.isLoaded()).toBe(false);
  });

  it("hotReload(manifest) replaces the current manifest", () => {
    voiceChatProvider.loadRaw(validManifest);
    const replacement = voiceChatProvider.loadRaw({ enabled: false });
    voiceChatProvider.hotReload(replacement);
    expect(voiceChatProvider.getManifest()?.enabled).toBe(false);
    expect(voiceChatProvider.getManifest()?.rooms.length).toBe(0);
  });

  it("hotReload(null) clears", () => {
    voiceChatProvider.loadRaw(validManifest);
    voiceChatProvider.hotReload(null);
    expect(voiceChatProvider.isLoaded()).toBe(false);
  });

  it("unload() resets", () => {
    voiceChatProvider.loadRaw(validManifest);
    voiceChatProvider.unload();
    expect(voiceChatProvider.isLoaded()).toBe(false);
    expect(voiceChatProvider.getManifest()).toBeNull();
  });
});

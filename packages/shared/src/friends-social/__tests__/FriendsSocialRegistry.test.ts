import { FriendsSocialManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import {
  FriendsSocialNotLoadedError,
  FriendsSocialRegistry,
} from "../FriendsSocialRegistry.js";

function manifest() {
  return FriendsSocialManifestSchema.parse({
    enabled: true,
    friends: {
      maxFriends: 50,
      scope: "perAccount",
      allowCrossFaction: false,
      allowCrossRealm: true,
      friendRequestExpireHours: 72,
      maxNoteLength: 120,
      allowOfflineMessages: true,
      maxOfflineMessagesPerSender: 3,
    },
    ignore: {
      maxIgnored: 30,
      scope: "perAccount",
      expireAfterDays: 30,
    },
    recent: {
      enabled: true,
      maxEntries: 20,
      retentionHours: 48,
    },
    onlineStatus: {
      defaultVisibility: "online",
      allowPlayerOverride: true,
      showZoneToFriends: true,
    },
  });
}

describe("FriendsSocialRegistry — not loaded", () => {
  it("throws when accessed pre-load", () => {
    const r = new FriendsSocialRegistry();
    expect(() => r.manifest).toThrow(FriendsSocialNotLoadedError);
  });
});

describe("FriendsSocialRegistry — friends", () => {
  it("enforces max friends", () => {
    const r = new FriendsSocialRegistry(manifest());
    expect(r.canAddFriend(49)).toBe(true);
    expect(r.canAddFriend(50)).toBe(false);
  });

  it("allows a valid request", () => {
    const r = new FriendsSocialRegistry(manifest());
    const out = r.checkFriendRequest({
      requesterFriendCount: 5,
      requesterFaction: "alliance",
      recipientFaction: "alliance",
      requesterRealm: "us-1",
      recipientRealm: "us-2",
      recipientIgnoresRequester: false,
      isSelf: false,
    });
    expect(out.allowed).toBe(true);
    expect(out.reason).toBe("allowed");
  });

  it("rejects self-requests", () => {
    const r = new FriendsSocialRegistry(manifest());
    const out = r.checkFriendRequest({
      requesterFriendCount: 0,
      requesterFaction: "a",
      recipientFaction: "a",
      requesterRealm: "r",
      recipientRealm: "r",
      recipientIgnoresRequester: false,
      isSelf: true,
    });
    expect(out.reason).toBe("self");
  });

  it("rejects when ignored", () => {
    const r = new FriendsSocialRegistry(manifest());
    const out = r.checkFriendRequest({
      requesterFriendCount: 0,
      requesterFaction: "a",
      recipientFaction: "a",
      requesterRealm: "r",
      recipientRealm: "r",
      recipientIgnoresRequester: true,
      isSelf: false,
    });
    expect(out.reason).toBe("ignored");
  });

  it("rejects at-cap", () => {
    const r = new FriendsSocialRegistry(manifest());
    const out = r.checkFriendRequest({
      requesterFriendCount: 50,
      requesterFaction: "a",
      recipientFaction: "a",
      requesterRealm: "r",
      recipientRealm: "r",
      recipientIgnoresRequester: false,
      isSelf: false,
    });
    expect(out.reason).toBe("at-cap");
  });

  it("rejects cross-faction when disallowed", () => {
    const r = new FriendsSocialRegistry(manifest());
    const out = r.checkFriendRequest({
      requesterFriendCount: 0,
      requesterFaction: "alliance",
      recipientFaction: "horde",
      requesterRealm: "r",
      recipientRealm: "r",
      recipientIgnoresRequester: false,
      isSelf: false,
    });
    expect(out.reason).toBe("cross-faction-forbidden");
  });
});

describe("FriendsSocialRegistry — request expiry", () => {
  it("classifies pending / expired", () => {
    const r = new FriendsSocialRegistry(manifest());
    expect(r.classifyRequest(1)).toBe("pending");
    expect(r.classifyRequest(72)).toBe("expired");
    expect(r.classifyRequest(100)).toBe("expired");
  });

  it("never expires when hours=0", () => {
    const r = new FriendsSocialRegistry();
    r.loadFromJson({
      friends: { friendRequestExpireHours: 0 },
    });
    expect(r.classifyRequest(9999)).toBe("pending");
  });
});

describe("FriendsSocialRegistry — notes + offline", () => {
  it("validates note length", () => {
    const r = new FriendsSocialRegistry(manifest());
    expect(r.isNoteWithinLimit(100)).toBe(true);
    expect(r.isNoteWithinLimit(120)).toBe(true);
    expect(r.isNoteWithinLimit(121)).toBe(false);
  });

  it("respects offline message cap + flag", () => {
    const r = new FriendsSocialRegistry(manifest());
    expect(r.canQueueOfflineMessage(0)).toBe(true);
    expect(r.canQueueOfflineMessage(2)).toBe(true);
    expect(r.canQueueOfflineMessage(3)).toBe(false);
  });
});

describe("FriendsSocialRegistry — ignore", () => {
  it("enforces cap", () => {
    const r = new FriendsSocialRegistry(manifest());
    expect(r.canAddIgnore(29)).toBe(true);
    expect(r.canAddIgnore(30)).toBe(false);
  });

  it("expires after days", () => {
    const r = new FriendsSocialRegistry(manifest());
    expect(r.isIgnoreActive(10)).toBe(true);
    expect(r.isIgnoreActive(30)).toBe(false);
  });

  it("permanent when days=0", () => {
    const r = new FriendsSocialRegistry();
    r.loadFromJson({ ignore: { expireAfterDays: 0 } });
    expect(r.isIgnoreActive(10_000)).toBe(true);
  });
});

describe("FriendsSocialRegistry — recent", () => {
  it("respects retention", () => {
    const r = new FriendsSocialRegistry(manifest());
    expect(r.isRecentRetained(24, 5)).toBe(true);
    expect(r.isRecentRetained(48, 5)).toBe(false);
  });

  it("respects maxEntries cap", () => {
    const r = new FriendsSocialRegistry(manifest());
    expect(r.isRecentRetained(1, 20)).toBe(false);
  });

  it("disabled recent returns false", () => {
    const r = new FriendsSocialRegistry();
    r.loadFromJson({ recent: { enabled: false } });
    expect(r.isRecentRetained(0, 0)).toBe(false);
  });
});

describe("FriendsSocialRegistry — visibility", () => {
  it("honors player choice when allowed", () => {
    const r = new FriendsSocialRegistry(manifest());
    const out = r.effectiveVisibility("friendsOnly");
    expect(out.mode).toBe("friendsOnly");
    expect(out.reason).toBe("player-choice");
  });

  it("falls back to default when no choice", () => {
    const r = new FriendsSocialRegistry(manifest());
    const out = r.effectiveVisibility(null);
    expect(out.mode).toBe("online");
    expect(out.reason).toBe("default");
  });

  it("blocks invisible when override disabled", () => {
    const r = new FriendsSocialRegistry();
    r.loadFromJson({
      onlineStatus: {
        defaultVisibility: "online",
        allowPlayerOverride: false,
      },
    });
    const out = r.effectiveVisibility("invisible");
    expect(out.mode).toBe("online");
    expect(out.reason).toBe("policy-forbids-invisible");
  });
});

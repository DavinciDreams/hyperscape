/**
 * Faithfulness + defensiveness tests for `FriendsSocialManifestSchema`.
 */

import { describe, expect, it } from "vitest";

import {
  FriendsSocialManifestSchema,
  type FriendsSocialManifest,
} from "./friends-social.js";

const reference: FriendsSocialManifest = {
  enabled: true,
  privateMessageMaxLength: 200,
  friends: {
    maxFriends: 99,
    scope: "perAccount",
    autoAcceptFromSameGuild: false,
    allowCrossFaction: true,
    allowCrossRealm: true,
    friendRequestExpireHours: 72,
    maxNoteLength: 120,
    allowOfflineMessages: true,
    maxOfflineMessagesPerSender: 5,
  },
  ignore: {
    maxIgnored: 99,
    scope: "perAccount",
    expireAfterDays: 0,
    blocksAllInteractions: true,
    transparentToBlocked: false,
  },
  recent: {
    enabled: true,
    maxEntries: 50,
    retentionHours: 72,
    recordPartyMembers: true,
    recordFinderGroups: true,
    recordPvpEncounters: false,
  },
  onlineStatus: {
    defaultVisibility: "online",
    allowPlayerOverride: true,
    broadcastOfflineEdge: true,
    broadcastOnlineEdge: true,
    broadcastToGuild: true,
    showZoneToFriends: true,
    showLastSeenToFriends: true,
  },
};

describe("FriendsSocialManifestSchema", () => {
  it("parses the reference manifest cleanly", () => {
    const result = FriendsSocialManifestSchema.safeParse(reference);
    if (!result.success) {
      throw new Error(
        `Reference manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("applies defaults on empty manifest", () => {
    const parsed = FriendsSocialManifestSchema.parse({});
    expect(parsed.enabled).toBe(true);
    expect(parsed.friends.maxFriends).toBe(99);
    expect(parsed.privateMessageMaxLength).toBe(200);
    expect(parsed.friends.scope).toBe("perAccount");
    expect(parsed.friends.friendRequestExpireHours).toBe(72);
    expect(parsed.friends.allowOfflineMessages).toBe(true);
    expect(parsed.ignore.maxIgnored).toBe(99);
    expect(parsed.ignore.expireAfterDays).toBe(0);
    expect(parsed.ignore.blocksAllInteractions).toBe(true);
    expect(parsed.ignore.transparentToBlocked).toBe(false);
    expect(parsed.recent.enabled).toBe(true);
    expect(parsed.recent.maxEntries).toBe(50);
    expect(parsed.onlineStatus.defaultVisibility).toBe("online");
    expect(parsed.onlineStatus.allowPlayerOverride).toBe(true);
    expect(parsed.onlineStatus.broadcastToGuild).toBe(true);
  });

  it("accepts system disabled", () => {
    expect(
      FriendsSocialManifestSchema.safeParse({ enabled: false }).success,
    ).toBe(true);
  });

  it("accepts perCharacter scope on both lists", () => {
    const ok = {
      friends: { scope: "perCharacter" },
      ignore: { scope: "perCharacter" },
    };
    expect(FriendsSocialManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects mismatched scope between friends and ignore", () => {
    const bad = {
      friends: { scope: "perAccount" },
      ignore: { scope: "perCharacter" },
    };
    expect(FriendsSocialManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects mismatched scope the other direction", () => {
    const bad = {
      friends: { scope: "perCharacter" },
      ignore: { scope: "perAccount" },
    };
    expect(FriendsSocialManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects maxFriends > 1000", () => {
    const bad = { friends: { maxFriends: 9999 } };
    expect(FriendsSocialManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects maxFriends < 1", () => {
    const bad = { friends: { maxFriends: 0 } };
    expect(FriendsSocialManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects maxIgnored > 1000", () => {
    const bad = { ignore: { maxIgnored: 9999 } };
    expect(FriendsSocialManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects friendRequestExpireHours > 720", () => {
    const bad = { friends: { friendRequestExpireHours: 9999 } };
    expect(FriendsSocialManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts friendRequestExpireHours = 0 (never expires)", () => {
    const ok = { friends: { friendRequestExpireHours: 0 } };
    expect(FriendsSocialManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("accepts ignore.expireAfterDays = 0 (permanent)", () => {
    const ok = { ignore: { expireAfterDays: 0 } };
    expect(FriendsSocialManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects ignore.expireAfterDays > 3650", () => {
    const bad = { ignore: { expireAfterDays: 99999 } };
    expect(FriendsSocialManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts recent disabled", () => {
    const ok = { recent: { enabled: false } };
    expect(FriendsSocialManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects recent.maxEntries > 200", () => {
    const bad = { recent: { maxEntries: 9999 } };
    expect(FriendsSocialManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts recent.retentionHours = 0 (bounded only by maxEntries)", () => {
    const ok = { recent: { retentionHours: 0 } };
    expect(FriendsSocialManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("accepts defaultVisibility invisible when allowPlayerOverride=true", () => {
    const ok = {
      onlineStatus: {
        defaultVisibility: "invisible",
        allowPlayerOverride: true,
      },
    };
    expect(FriendsSocialManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects defaultVisibility=invisible with allowPlayerOverride=false", () => {
    const bad = {
      onlineStatus: {
        defaultVisibility: "invisible",
        allowPlayerOverride: false,
      },
    };
    expect(FriendsSocialManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts defaultVisibility friendsOnly with override=false", () => {
    const ok = {
      onlineStatus: {
        defaultVisibility: "friendsOnly",
        allowPlayerOverride: false,
      },
    };
    expect(FriendsSocialManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects unknown defaultVisibility", () => {
    const bad = { onlineStatus: { defaultVisibility: "stealth" } };
    expect(FriendsSocialManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown scope", () => {
    const bad = { friends: { scope: "perPlanet" } };
    expect(FriendsSocialManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown top-level field (strict mode)", () => {
    const bad = { extra: "nope" };
    expect(FriendsSocialManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown field on friends (strict mode)", () => {
    const bad = { friends: { extra: "nope" } };
    expect(FriendsSocialManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts cross-faction+cross-realm disabled", () => {
    const ok = {
      friends: { allowCrossFaction: false, allowCrossRealm: false },
    };
    expect(FriendsSocialManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("accepts transparentToBlocked=true (transparent ignore)", () => {
    const ok = { ignore: { transparentToBlocked: true } };
    expect(FriendsSocialManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("accepts blocksAllInteractions=false (chat-only ignore)", () => {
    const ok = { ignore: { blocksAllInteractions: false } };
    expect(FriendsSocialManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects maxNoteLength > 500", () => {
    const bad = { friends: { maxNoteLength: 9999 } };
    expect(FriendsSocialManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts maxNoteLength = 0 (notes disabled)", () => {
    const ok = { friends: { maxNoteLength: 0 } };
    expect(FriendsSocialManifestSchema.safeParse(ok).success).toBe(true);
  });
});

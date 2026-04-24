/**
 * Faithfulness + defensiveness tests for `PartyGuildManifestSchema`.
 */

import { describe, expect, it } from "vitest";

import {
  PartyGuildManifestSchema,
  type PartyGuildManifest,
} from "./party-guild.js";

const reference: PartyGuildManifest = {
  party: {
    maxMembers: 6,
    lootPolicy: "need-before-greed",
    xpPolicy: "proximity-share",
    xpShareRangeMeters: 60,
    idleAutoDisbandMinutes: 30,
    showOnMinimap: true,
    partyChannelId: "party",
  },
  guild: {
    maxMembers: 500,
    maxLevel: 50,
    xpPerLevel: 20_000,
    minNameLength: 3,
    maxNameLength: 24,
    alliancesEnabled: true,
    maxAllies: 5,
    guildWarsEnabled: true,
    rejoinCooldownHours: 48,
  },
  ranks: [
    {
      id: "leader",
      name: "Guildmaster",
      description: "",
      order: 0,
      permissions: [
        "invite-member",
        "kick-member",
        "promote-member",
        "demote-member",
        "edit-motd",
        "edit-description",
        "manage-bank-deposit",
        "manage-bank-withdraw",
        "manage-treasury",
        "start-war",
        "accept-alliance",
        "edit-rank-permissions",
        "disband-guild",
      ],
      maxHolders: 1,
    },
    {
      id: "officer",
      name: "Officer",
      description: "",
      order: 1,
      permissions: [
        "invite-member",
        "kick-member",
        "promote-member",
        "demote-member",
        "edit-motd",
        "manage-bank-deposit",
      ],
      maxHolders: 10,
    },
    {
      id: "veteran",
      name: "Veteran",
      description: "",
      order: 2,
      permissions: ["manage-bank-deposit"],
      maxHolders: 0,
    },
    {
      id: "member",
      name: "Member",
      description: "",
      order: 3,
      permissions: [],
      maxHolders: 0,
    },
  ],
  perks: [
    {
      id: "bankTabOne",
      name: "Guild Bank Tab 1",
      description: "",
      requiredLevel: 5,
      kind: "bank-tab",
      value: 1,
      customKey: "",
    },
    {
      id: "restedXp",
      name: "Rested XP +10%",
      description: "",
      requiredLevel: 10,
      kind: "rest-xp",
      value: 10,
      customKey: "",
    },
  ],
  defaultRankId: "member",
  leaderRankId: "leader",
};

describe("PartyGuildManifestSchema", () => {
  it("parses the reference manifest cleanly", () => {
    const result = PartyGuildManifestSchema.safeParse(reference);
    if (!result.success) {
      throw new Error(
        `Reference manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("applies defaults on minimal manifest", () => {
    const parsed = PartyGuildManifestSchema.parse({
      ranks: [{ id: "leader", name: "Leader", order: 0 }],
      defaultRankId: "leader",
      leaderRankId: "leader",
    });
    expect(parsed.party.maxMembers).toBe(6);
    expect(parsed.party.lootPolicy).toBe("round-robin");
    expect(parsed.party.xpPolicy).toBe("proximity-share");
    expect(parsed.party.partyChannelId).toBe("party");
    expect(parsed.guild.maxMembers).toBe(200);
    expect(parsed.guild.alliancesEnabled).toBe(true);
    expect(parsed.perks).toEqual([]);
  });

  it("rejects zero ranks", () => {
    const bad = {
      ranks: [],
      defaultRankId: "member",
      leaderRankId: "leader",
    };
    expect(PartyGuildManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate rank ids", () => {
    const bad = {
      ranks: [
        { id: "dup", name: "A", order: 0 },
        { id: "dup", name: "B", order: 1 },
      ],
      defaultRankId: "dup",
      leaderRankId: "dup",
    };
    expect(PartyGuildManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate rank order values", () => {
    const bad = {
      ranks: [
        { id: "a", name: "A", order: 0 },
        { id: "b", name: "B", order: 0 },
      ],
      defaultRankId: "a",
      leaderRankId: "a",
    };
    expect(PartyGuildManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate perk ids", () => {
    const bad = {
      ranks: [{ id: "leader", name: "L", order: 0 }],
      perks: [
        { id: "dup", name: "P", requiredLevel: 1, kind: "bank-tab" },
        { id: "dup", name: "Q", requiredLevel: 2, kind: "xp-buff" },
      ],
      defaultRankId: "leader",
      leaderRankId: "leader",
    };
    expect(PartyGuildManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown defaultRankId", () => {
    const bad = {
      ranks: [{ id: "leader", name: "L", order: 0 }],
      defaultRankId: "ghost",
      leaderRankId: "leader",
    };
    expect(PartyGuildManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown leaderRankId", () => {
    const bad = {
      ranks: [{ id: "member", name: "M", order: 0 }],
      defaultRankId: "member",
      leaderRankId: "ghost",
    };
    expect(PartyGuildManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects leader rank not at order 0", () => {
    const bad = {
      ranks: [
        { id: "member", name: "M", order: 0 },
        { id: "leader", name: "L", order: 1 },
      ],
      defaultRankId: "member",
      leaderRankId: "leader",
    };
    expect(PartyGuildManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects proximity-share with xpShareRangeMeters = 0", () => {
    const bad = {
      party: { xpPolicy: "proximity-share", xpShareRangeMeters: 0 },
      ranks: [{ id: "l", name: "L", order: 0 }],
      defaultRankId: "l",
      leaderRankId: "l",
    };
    expect(PartyGuildManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts tag-only xp policy with xpShareRangeMeters = 0", () => {
    const ok = {
      party: { xpPolicy: "tag-only", xpShareRangeMeters: 0 },
      ranks: [{ id: "l", name: "L", order: 0 }],
      defaultRankId: "l",
      leaderRankId: "l",
    };
    expect(PartyGuildManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects minNameLength > maxNameLength", () => {
    const bad = {
      guild: { minNameLength: 20, maxNameLength: 10 },
      ranks: [{ id: "l", name: "L", order: 0 }],
      defaultRankId: "l",
      leaderRankId: "l",
    };
    expect(PartyGuildManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects custom-kind perk without customKey", () => {
    const bad = {
      ranks: [{ id: "l", name: "L", order: 0 }],
      perks: [
        {
          id: "p",
          name: "P",
          requiredLevel: 5,
          kind: "custom",
          customKey: "",
        },
      ],
      defaultRankId: "l",
      leaderRankId: "l",
    };
    expect(PartyGuildManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects non-custom perk with customKey set", () => {
    const bad = {
      ranks: [{ id: "l", name: "L", order: 0 }],
      perks: [
        {
          id: "p",
          name: "P",
          requiredLevel: 5,
          kind: "bank-tab",
          customKey: "foo",
        },
      ],
      defaultRankId: "l",
      leaderRankId: "l",
    };
    expect(PartyGuildManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown permission", () => {
    const bad = {
      ranks: [
        {
          id: "l",
          name: "L",
          order: 0,
          permissions: ["launch-missile"],
        },
      ],
      defaultRankId: "l",
      leaderRankId: "l",
    };
    expect(PartyGuildManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown loot policy", () => {
    const bad = {
      party: { lootPolicy: "take-all" },
      ranks: [{ id: "l", name: "L", order: 0 }],
      defaultRankId: "l",
      leaderRankId: "l",
    };
    expect(PartyGuildManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects party.maxMembers > 24", () => {
    const bad = {
      party: { maxMembers: 100 },
      ranks: [{ id: "l", name: "L", order: 0 }],
      defaultRankId: "l",
      leaderRankId: "l",
    };
    expect(PartyGuildManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects guild.maxMembers > 10000", () => {
    const bad = {
      guild: { maxMembers: 99_999 },
      ranks: [{ id: "l", name: "L", order: 0 }],
      defaultRankId: "l",
      leaderRankId: "l",
    };
    expect(PartyGuildManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects invalid rank id format", () => {
    const bad = {
      ranks: [{ id: "Has Spaces", name: "L", order: 0 }],
      defaultRankId: "Has Spaces",
      leaderRankId: "Has Spaces",
    };
    expect(PartyGuildManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts guild wars disabled", () => {
    const ok = {
      guild: { guildWarsEnabled: false },
      ranks: [{ id: "l", name: "L", order: 0 }],
      defaultRankId: "l",
      leaderRankId: "l",
    };
    expect(PartyGuildManifestSchema.safeParse(ok).success).toBe(true);
  });
});

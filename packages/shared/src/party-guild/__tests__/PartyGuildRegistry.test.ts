import { PartyGuildManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import {
  PartyGuildNotLoadedError,
  PartyGuildRegistry,
  UnknownPerkError,
  UnknownRankError,
} from "../PartyGuildRegistry.js";

function manifest() {
  return PartyGuildManifestSchema.parse({
    party: {
      maxMembers: 5,
      lootPolicy: "need-before-greed",
      xpPolicy: "proximity-share",
      xpShareRangeMeters: 40,
      idleAutoDisbandMinutes: 20,
      showOnMinimap: true,
      partyChannelId: "party",
    },
    guild: {
      maxMembers: 100,
      maxLevel: 10,
      xpPerLevel: 1000,
      minNameLength: 3,
      maxNameLength: 20,
      alliancesEnabled: true,
      maxAllies: 3,
      guildWarsEnabled: false,
      rejoinCooldownHours: 24,
    },
    ranks: [
      {
        id: "guildMaster",
        name: "Guild Master",
        order: 0,
        permissions: [
          "invite-member",
          "kick-member",
          "promote-member",
          "demote-member",
          "edit-motd",
          "manage-bank-deposit",
          "manage-bank-withdraw",
          "disband-guild",
        ],
      },
      {
        id: "officer",
        name: "Officer",
        order: 1,
        permissions: [
          "invite-member",
          "kick-member",
          "promote-member",
          "demote-member",
          "edit-motd",
        ],
      },
      {
        id: "veteran",
        name: "Veteran",
        order: 2,
        permissions: ["invite-member"],
      },
      {
        id: "member",
        name: "Member",
        order: 3,
        permissions: [],
      },
    ],
    perks: [
      {
        id: "bankTab1",
        name: "Bank Tab 1",
        requiredLevel: 1,
        kind: "bank-tab",
        value: 1,
      },
      {
        id: "bankTab2",
        name: "Bank Tab 2",
        requiredLevel: 5,
        kind: "bank-tab",
        value: 1,
      },
      {
        id: "xpBuff",
        name: "XP Buff",
        requiredLevel: 3,
        kind: "xp-buff",
        value: 0.05,
      },
    ],
    defaultRankId: "member",
    leaderRankId: "guildMaster",
  });
}

describe("PartyGuildRegistry — not loaded", () => {
  it("throws pre-load", () => {
    expect(() => new PartyGuildRegistry().manifest).toThrow(
      PartyGuildNotLoadedError,
    );
  });
});

describe("PartyGuildRegistry — party", () => {
  it("enforces size cap", () => {
    const r = new PartyGuildRegistry(manifest());
    expect(r.canJoinParty(4).allowed).toBe(true);
    expect(r.canJoinParty(5).reason).toBe("at-cap");
  });

  it("evaluates xp share policy", () => {
    const r = new PartyGuildRegistry(manifest());
    expect(
      r.includesXpShare({ tagged: false, distanceMetersFromKill: 20 }),
    ).toBe(true);
    expect(
      r.includesXpShare({ tagged: false, distanceMetersFromKill: 50 }),
    ).toBe(false);
  });

  it("tag-only respects tagged flag", () => {
    const r = new PartyGuildRegistry();
    r.loadFromJson({
      party: { xpPolicy: "tag-only" },
      ranks: [{ id: "leader", name: "Leader", order: 0 }],
      defaultRankId: "leader",
      leaderRankId: "leader",
    });
    expect(
      r.includesXpShare({ tagged: true, distanceMetersFromKill: 999 }),
    ).toBe(true);
    expect(
      r.includesXpShare({ tagged: false, distanceMetersFromKill: 0 }),
    ).toBe(false);
  });

  it("auto-disbands when idle time exceeded", () => {
    const r = new PartyGuildRegistry(manifest());
    expect(r.shouldAutoDisband(10)).toBe(false);
    expect(r.shouldAutoDisband(20)).toBe(true);
  });
});

describe("PartyGuildRegistry — guild ranks", () => {
  it("indexes and orders", () => {
    const r = new PartyGuildRegistry(manifest());
    expect(r.rankIds().length).toBe(4);
    expect(r.ranksByOrder().map((x) => x.id)).toEqual([
      "guildMaster",
      "officer",
      "veteran",
      "member",
    ]);
  });

  it("throws on unknown rank", () => {
    const r = new PartyGuildRegistry(manifest());
    expect(() => r.rank("ghost")).toThrow(UnknownRankError);
  });

  it("checks permissions", () => {
    const r = new PartyGuildRegistry(manifest());
    expect(r.hasPermission("officer", "kick-member")).toBe(true);
    expect(r.hasPermission("member", "kick-member")).toBe(false);
  });

  it("allows valid promote", () => {
    const r = new PartyGuildRegistry(manifest());
    // officer promoting member → veteran: promoter.order=1, subject=3(member), target=2(veteran)
    expect(r.canPromote("officer", "member", "veteran")).toBe(true);
  });

  it("blocks promote when no permission", () => {
    const r = new PartyGuildRegistry(manifest());
    expect(r.canPromote("member", "member", "veteran")).toBe(false);
  });

  it("blocks promote beyond promoter's rank", () => {
    const r = new PartyGuildRegistry(manifest());
    // officer(order=1) can't promote to guildMaster(order=0)
    expect(r.canPromote("officer", "member", "guildMaster")).toBe(false);
  });

  it("allows valid demote", () => {
    const r = new PartyGuildRegistry(manifest());
    // officer demoting veteran → member: demoter=1, subject=veteran(2), target=member(3)
    expect(r.canDemote("officer", "veteran", "member")).toBe(true);
  });

  it("blocks demote when target is higher-or-equal rank than demoter", () => {
    const r = new PartyGuildRegistry(manifest());
    // officer(order=1) can't demote another officer(order=1) because demoter.order(1) is not < subject.order(1)
    expect(r.canDemote("officer", "officer", "veteran")).toBe(false);
  });
});

describe("PartyGuildRegistry — guild perks", () => {
  it("indexes perks", () => {
    const r = new PartyGuildRegistry(manifest());
    expect(r.hasPerk("bankTab1")).toBe(true);
    expect(() => r.perk("ghost")).toThrow(UnknownPerkError);
  });

  it("filters unlocked perks by level", () => {
    const r = new PartyGuildRegistry(manifest());
    expect(r.unlockedPerks(2).map((p) => p.id)).toEqual(["bankTab1"]);
    expect(r.unlockedPerks(4).map((p) => p.id)).toEqual(["bankTab1", "xpBuff"]);
    expect(r.unlockedPerks(10).map((p) => p.id)).toEqual([
      "bankTab1",
      "xpBuff",
      "bankTab2",
    ]);
  });
});

describe("PartyGuildRegistry — guild rules", () => {
  it("resolves linear level progression", () => {
    const r = new PartyGuildRegistry(manifest());
    expect(r.resolveGuildLevel(0).level).toBe(1);
    expect(r.resolveGuildLevel(999).level).toBe(1);
    expect(r.resolveGuildLevel(1000).level).toBe(2);
    const l3 = r.resolveGuildLevel(2500);
    expect(l3.level).toBe(3);
    expect(l3.xpIntoLevel).toBe(500);
    expect(l3.xpForNext).toBe(1000);
  });

  it("caps at maxLevel", () => {
    const r = new PartyGuildRegistry(manifest());
    const top = r.resolveGuildLevel(99_999_999);
    expect(top.level).toBe(10);
    expect(top.xpForNext).toBe(0);
  });

  it("validates guild names", () => {
    const r = new PartyGuildRegistry(manifest());
    expect(r.validateGuildName("   ").reason).toBe("empty");
    expect(r.validateGuildName("ab").reason).toBe("too-short");
    expect(r.validateGuildName("abc").allowed).toBe(true);
    expect(r.validateGuildName("x".repeat(21)).reason).toBe("too-long");
  });

  it("caps member acceptance", () => {
    const r = new PartyGuildRegistry(manifest());
    expect(r.canAcceptMember(99)).toBe(true);
    expect(r.canAcceptMember(100)).toBe(false);
  });

  it("caps allies and respects alliancesEnabled flag", () => {
    const r = new PartyGuildRegistry(manifest());
    expect(r.canAddAlly(2)).toBe(true);
    expect(r.canAddAlly(3)).toBe(false);

    const r2 = new PartyGuildRegistry();
    r2.loadFromJson({
      guild: { alliancesEnabled: false },
      ranks: [{ id: "gm", name: "GM", order: 0 }],
      defaultRankId: "gm",
      leaderRankId: "gm",
    });
    expect(r2.canAddAlly(0)).toBe(false);
  });
});

describe("PartyGuildRegistry — default/leader rank accessors", () => {
  it("exposes ids", () => {
    const r = new PartyGuildRegistry(manifest());
    expect(r.defaultRankId).toBe("member");
    expect(r.leaderRankId).toBe("guildMaster");
  });
});

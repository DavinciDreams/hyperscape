import { AchievementsManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import {
  AchievementEvaluator,
  UnknownAchievementError,
} from "../AchievementEvaluator.js";

function manifest() {
  return AchievementsManifestSchema.parse([
    {
      id: "first-kill",
      name: "First Blood",
      rarity: "common",
      points: 5,
      trigger: { kind: "event", event: "mob.killed" },
    },
    {
      id: "kill-goblin",
      name: "Goblin Slayer",
      rarity: "common",
      points: 5,
      trigger: {
        kind: "event",
        event: "mob.killed",
        match: { mobId: "goblin" },
      },
    },
    {
      id: "kill-100-goblins",
      name: "Goblin Exterminator",
      rarity: "rare",
      points: 50,
      trigger: {
        kind: "count",
        event: "mob.killed",
        match: { mobId: "goblin" },
        threshold: 3,
      },
    },
    {
      id: "woodcut-50",
      name: "Apprentice Woodcutter",
      rarity: "uncommon",
      points: 10,
      trigger: {
        kind: "stat",
        stat: "skill.woodcutting.level",
        threshold: 50,
      },
    },
    {
      id: "woodcut-99",
      name: "Master Woodcutter",
      rarity: "legendary",
      points: 200,
      prerequisites: ["woodcut-50"],
      trigger: {
        kind: "stat",
        stat: "skill.woodcutting.level",
        threshold: 99,
      },
    },
  ]);
}

describe("AchievementEvaluator — registry basics", () => {
  it("empty by default", () => {
    const ev = new AchievementEvaluator();
    expect(ev.size).toBe(0);
    expect(ev.ids).toEqual([]);
  });

  it("constructor + load populates", () => {
    const ev = new AchievementEvaluator(manifest());
    expect(ev.size).toBe(5);
    expect(ev.has("first-kill")).toBe(true);
  });

  it("get() throws on unknown id", () => {
    const ev = new AchievementEvaluator(manifest());
    expect(() => ev.get("ghost")).toThrow(UnknownAchievementError);
  });

  it("loadFromJson validates before loading", () => {
    const ev = new AchievementEvaluator();
    ev.loadFromJson([
      {
        id: "a",
        name: "A",
        trigger: { kind: "event", event: "x" },
      },
    ]);
    expect(ev.size).toBe(1);
  });

  it("load() replaces prior state", () => {
    const ev = new AchievementEvaluator(manifest());
    ev.load(
      AchievementsManifestSchema.parse([
        {
          id: "only",
          name: "Only",
          trigger: { kind: "event", event: "y" },
        },
      ]),
    );
    expect(ev.size).toBe(1);
    expect(ev.has("first-kill")).toBe(false);
  });

  it("createState builds a fresh progress state", () => {
    const s = AchievementEvaluator.createState();
    expect(s.unlocked.size).toBe(0);
    expect(s.counts.size).toBe(0);
  });
});

describe("AchievementEvaluator — event triggers", () => {
  it("unlocks on matching event (no payload match filter)", () => {
    const ev = new AchievementEvaluator(manifest());
    const s = AchievementEvaluator.createState();
    const unlocks = ev.handleEvent(s, "mob.killed", { mobId: "rat" });
    const ids = unlocks.map((u) => u.id);
    expect(ids).toContain("first-kill");
    expect(ids).not.toContain("kill-goblin");
    expect(s.unlocked.has("first-kill")).toBe(true);
  });

  it("unlocks on payload-match event", () => {
    const ev = new AchievementEvaluator(manifest());
    const s = AchievementEvaluator.createState();
    const unlocks = ev.handleEvent(s, "mob.killed", { mobId: "goblin" });
    const ids = unlocks.map((u) => u.id);
    expect(ids).toContain("first-kill");
    expect(ids).toContain("kill-goblin");
  });

  it("does not unlock same achievement twice", () => {
    const ev = new AchievementEvaluator(manifest());
    const s = AchievementEvaluator.createState();
    ev.handleEvent(s, "mob.killed", { mobId: "rat" });
    const second = ev.handleEvent(s, "mob.killed", { mobId: "rat" });
    expect(second.map((u) => u.id)).not.toContain("first-kill");
  });

  it("ignores events with no listeners", () => {
    const ev = new AchievementEvaluator(manifest());
    const s = AchievementEvaluator.createState();
    expect(ev.handleEvent(s, "player.yawned", {})).toEqual([]);
  });

  it("match filter rejects non-matching payloads", () => {
    const ev = new AchievementEvaluator(manifest());
    const s = AchievementEvaluator.createState();
    const unlocks = ev.handleEvent(s, "mob.killed", { mobId: "rat" });
    expect(unlocks.map((u) => u.id)).not.toContain("kill-goblin");
  });
});

describe("AchievementEvaluator — count triggers", () => {
  it("increments counter; unlocks at threshold", () => {
    const ev = new AchievementEvaluator(manifest());
    const s = AchievementEvaluator.createState();
    expect(
      ev.handleEvent(s, "mob.killed", { mobId: "goblin" }).map((u) => u.id),
    ).not.toContain("kill-100-goblins");
    expect(
      ev.handleEvent(s, "mob.killed", { mobId: "goblin" }).map((u) => u.id),
    ).not.toContain("kill-100-goblins");
    const third = ev.handleEvent(s, "mob.killed", { mobId: "goblin" });
    expect(third.map((u) => u.id)).toContain("kill-100-goblins");
  });

  it("count progress readout reflects state", () => {
    const ev = new AchievementEvaluator(manifest());
    const s = AchievementEvaluator.createState();
    ev.handleEvent(s, "mob.killed", { mobId: "goblin" });
    expect(ev.countProgress(s, "kill-100-goblins")).toEqual({
      current: 1,
      threshold: 3,
    });
  });

  it("countProgress returns null for non-count triggers", () => {
    const ev = new AchievementEvaluator(manifest());
    const s = AchievementEvaluator.createState();
    expect(ev.countProgress(s, "first-kill")).toBeNull();
    expect(ev.countProgress(s, "woodcut-50")).toBeNull();
  });

  it("does not increment past threshold after unlock", () => {
    const ev = new AchievementEvaluator(manifest());
    const s = AchievementEvaluator.createState();
    for (let i = 0; i < 5; i++) {
      ev.handleEvent(s, "mob.killed", { mobId: "goblin" });
    }
    expect(ev.isUnlocked(s, "kill-100-goblins")).toBe(true);
    // counter freezes once unlocked (implementation detail: loop skips unlocked)
    const progress = ev.countProgress(s, "kill-100-goblins");
    expect(progress?.current).toBe(3);
  });

  it("non-matching payload does not increment count", () => {
    const ev = new AchievementEvaluator(manifest());
    const s = AchievementEvaluator.createState();
    ev.handleEvent(s, "mob.killed", { mobId: "rat" });
    expect(ev.countProgress(s, "kill-100-goblins")?.current).toBe(0);
  });
});

describe("AchievementEvaluator — stat triggers", () => {
  it("unlocks when stat reaches threshold", () => {
    const ev = new AchievementEvaluator(manifest());
    const s = AchievementEvaluator.createState();
    const unlocks = ev.handleStat(s, "skill.woodcutting.level", 50);
    expect(unlocks.map((u) => u.id)).toContain("woodcut-50");
  });

  it("does not unlock below threshold", () => {
    const ev = new AchievementEvaluator(manifest());
    const s = AchievementEvaluator.createState();
    const unlocks = ev.handleStat(s, "skill.woodcutting.level", 49);
    expect(unlocks.map((u) => u.id)).not.toContain("woodcut-50");
  });

  it("unrelated stat changes do nothing", () => {
    const ev = new AchievementEvaluator(manifest());
    const s = AchievementEvaluator.createState();
    expect(ev.handleStat(s, "skill.cooking.level", 99)).toEqual([]);
  });

  it("rejects non-finite stat values", () => {
    const ev = new AchievementEvaluator(manifest());
    const s = AchievementEvaluator.createState();
    expect(() =>
      ev.handleStat(s, "skill.woodcutting.level", Number.NaN),
    ).toThrow(TypeError);
  });
});

describe("AchievementEvaluator — prerequisites", () => {
  it("blocks unlock until prerequisite met", () => {
    const ev = new AchievementEvaluator(manifest());
    const s = AchievementEvaluator.createState();
    // Even at level 99, master is gated behind apprentice
    const direct = ev.handleStat(s, "skill.woodcutting.level", 99);
    // Both should unlock in the same pass since apprentice unlocks first in
    // the iteration — actually need careful ordering. The evaluator
    // processes listeners in manifest order, so woodcut-50 unlocks first,
    // then woodcut-99 sees the prereq satisfied.
    const ids = direct.map((u) => u.id);
    expect(ids).toContain("woodcut-50");
    expect(ids).toContain("woodcut-99");
  });

  it("gated achievement stays locked if stat hits threshold before prereq", () => {
    // Build a variant where prereq is an event that hasn't fired
    const ev = new AchievementEvaluator(
      AchievementsManifestSchema.parse([
        {
          id: "gate",
          name: "Gate",
          trigger: { kind: "event", event: "unlock.gate" },
        },
        {
          id: "behind-gate",
          name: "Behind Gate",
          prerequisites: ["gate"],
          trigger: { kind: "stat", stat: "foo", threshold: 1 },
        },
      ]),
    );
    const s = AchievementEvaluator.createState();
    const attempt1 = ev.handleStat(s, "foo", 10);
    expect(attempt1.map((u) => u.id)).not.toContain("behind-gate");
    ev.handleEvent(s, "unlock.gate", {});
    const attempt2 = ev.handleStat(s, "foo", 10);
    expect(attempt2.map((u) => u.id)).toContain("behind-gate");
  });
});

describe("AchievementEvaluator — integration", () => {
  it("realistic play session: multiple unlocks across events + stats", () => {
    const ev = new AchievementEvaluator(manifest());
    const s = AchievementEvaluator.createState();

    // Kill first mob
    const kill1 = ev.handleEvent(s, "mob.killed", { mobId: "rat" });
    expect(kill1.map((u) => u.id)).toEqual(["first-kill"]);

    // Kill three goblins
    ev.handleEvent(s, "mob.killed", { mobId: "goblin" });
    ev.handleEvent(s, "mob.killed", { mobId: "goblin" });
    const kill4 = ev.handleEvent(s, "mob.killed", { mobId: "goblin" });
    expect(kill4.map((u) => u.id)).toContain("kill-100-goblins");

    // Level up woodcutting to 50
    const level50 = ev.handleStat(s, "skill.woodcutting.level", 50);
    expect(level50.map((u) => u.id)).toEqual(["woodcut-50"]);

    // Level up to 99
    const level99 = ev.handleStat(s, "skill.woodcutting.level", 99);
    expect(level99.map((u) => u.id)).toEqual(["woodcut-99"]);

    expect(s.unlocked.size).toBe(5); // all unlocked (first-kill, kill-goblin, kill-100-goblins, woodcut-50, woodcut-99)
  });
});

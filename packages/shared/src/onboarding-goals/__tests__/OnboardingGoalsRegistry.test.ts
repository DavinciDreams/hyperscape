import { OnboardingGoalsManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it, vi } from "vitest";
import {
  OnboardingGoalsNotLoadedError,
  OnboardingGoalsRegistry,
  UnknownOnboardingGoalError,
} from "../OnboardingGoalsRegistry.js";

function manifest() {
  return OnboardingGoalsManifestSchema.parse({
    enabled: true,
    goals: [
      {
        id: "openMap",
        titleLocalizationKey: "g.openMap",
        displayOrder: 10,
        criteria: [{ kind: "openWidget", targetKey: "map" }],
      },
      {
        id: "equipSword",
        titleLocalizationKey: "g.equipSword",
        displayOrder: 20,
        prerequisites: ["openMap"],
        criteria: [{ kind: "equipItemKind", targetKey: "sword" }],
        rewards: [{ kind: "xpGrant", amount: 100 }],
      },
      {
        id: "killGoblin",
        titleLocalizationKey: "g.killGoblin",
        displayOrder: 30,
        prerequisites: ["equipSword"],
        criteria: [
          { kind: "killMobKind", targetKey: "goblin", requiredCount: 3 },
        ],
        rewards: [{ kind: "coinsGrant", amount: 50 }],
      },
      {
        id: "hiddenCheckpoint",
        titleLocalizationKey: "g.hidden",
        displayOrder: 15,
        showInTracker: false,
        criteria: [{ kind: "openInventory" }],
      },
    ],
    abort: {
      allowSkipAll: true,
      skipAllAvailableAtLevel: 10,
      autoCompleteForReturningPlayers: true,
    },
  });
}

describe("OnboardingGoalsRegistry — not loaded", () => {
  it("throws pre-load", () => {
    expect(() => new OnboardingGoalsRegistry().manifest).toThrow(
      OnboardingGoalsNotLoadedError,
    );
  });
});

describe("OnboardingGoalsRegistry — lookup", () => {
  it("indexes by id", () => {
    const r = new OnboardingGoalsRegistry(manifest());
    expect(r.has("openMap")).toBe(true);
    expect(r.get("equipSword").prerequisites).toEqual(["openMap"]);
  });

  it("throws on unknown", () => {
    const r = new OnboardingGoalsRegistry(manifest());
    expect(() => r.get("ghost")).toThrow(UnknownOnboardingGoalError);
  });

  it("sorts by displayOrder", () => {
    const r = new OnboardingGoalsRegistry(manifest());
    expect(r.goalsByDisplayOrder().map((g) => g.id)).toEqual([
      "openMap",
      "hiddenCheckpoint",
      "equipSword",
      "killGoblin",
    ]);
  });

  it("filters tracker-visible", () => {
    const r = new OnboardingGoalsRegistry(manifest());
    expect(r.trackerGoals().map((g) => g.id)).toEqual([
      "openMap",
      "equipSword",
      "killGoblin",
    ]);
  });
});

describe("OnboardingGoalsRegistry — topological order", () => {
  it("respects prerequisites", () => {
    const r = new OnboardingGoalsRegistry(manifest());
    const order = r.topologicalOrder().map((g) => g.id);
    expect(order.indexOf("openMap")).toBeLessThan(order.indexOf("equipSword"));
    expect(order.indexOf("equipSword")).toBeLessThan(
      order.indexOf("killGoblin"),
    );
  });

  it("includes all goals exactly once", () => {
    const r = new OnboardingGoalsRegistry(manifest());
    const order = r.topologicalOrder();
    expect(order.length).toBe(4);
    expect(new Set(order.map((g) => g.id)).size).toBe(4);
  });
});

describe("OnboardingGoalsRegistry — availability", () => {
  it("allows root goal with empty completed set", () => {
    const r = new OnboardingGoalsRegistry(manifest());
    expect(r.checkAvailability("openMap", new Set()).available).toBe(true);
  });

  it("blocks on missing prereq", () => {
    const r = new OnboardingGoalsRegistry(manifest());
    const out = r.checkAvailability("equipSword", new Set());
    expect(out.reason).toBe("missing-prereq");
    expect(out.missingPrereqId).toBe("openMap");
  });

  it("already complete", () => {
    const r = new OnboardingGoalsRegistry(manifest());
    expect(r.checkAvailability("openMap", new Set(["openMap"])).reason).toBe(
      "already-complete",
    );
  });

  it("unknown goal", () => {
    const r = new OnboardingGoalsRegistry(manifest());
    expect(r.checkAvailability("ghost", new Set()).reason).toBe(
      "goal-not-found",
    );
  });
});

describe("OnboardingGoalsRegistry — nextGoal", () => {
  it("returns first available goal", () => {
    const r = new OnboardingGoalsRegistry(manifest());
    expect(r.nextGoal(new Set())?.id).toBe("openMap");
  });

  it("advances as goals complete", () => {
    const r = new OnboardingGoalsRegistry(manifest());
    expect(r.nextGoal(new Set(["openMap"]))?.id).toBe("hiddenCheckpoint");
    expect(r.nextGoal(new Set(["openMap", "hiddenCheckpoint"]))?.id).toBe(
      "equipSword",
    );
    expect(
      r.nextGoal(new Set(["openMap", "hiddenCheckpoint", "equipSword"]))?.id,
    ).toBe("killGoblin");
  });

  it("returns null when all complete", () => {
    const r = new OnboardingGoalsRegistry(manifest());
    expect(
      r.nextGoal(
        new Set(["openMap", "hiddenCheckpoint", "equipSword", "killGoblin"]),
      ),
    ).toBeNull();
  });
});

describe("OnboardingGoalsRegistry — skip-all gate", () => {
  it("allows skip at level", () => {
    const r = new OnboardingGoalsRegistry(manifest());
    expect(r.canSkipAll(10)).toBe(true);
    expect(r.canSkipAll(20)).toBe(true);
  });

  it("blocks below skip level", () => {
    const r = new OnboardingGoalsRegistry(manifest());
    expect(r.canSkipAll(5)).toBe(false);
  });

  it("blocks when allowSkipAll=false", () => {
    const r = new OnboardingGoalsRegistry();
    r.loadFromJson({
      enabled: true,
      goals: [
        {
          id: "x",
          titleLocalizationKey: "x",
          criteria: [{ kind: "openInventory" }],
        },
      ],
      abort: { allowSkipAll: false },
    });
    expect(r.canSkipAll(1000)).toBe(false);
  });
});

describe("OnboardingGoalsRegistry — onReloaded", () => {
  it("fires after every successful load()", () => {
    const r = new OnboardingGoalsRegistry();
    const cb = vi.fn();
    r.onReloaded(cb);
    r.load(manifest());
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("returned unsubscribe stops further notifications", () => {
    const r = new OnboardingGoalsRegistry();
    const cb = vi.fn();
    const off = r.onReloaded(cb);
    r.load(manifest());
    off();
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("a throwing listener does not break subsequent listeners", () => {
    const r = new OnboardingGoalsRegistry();
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

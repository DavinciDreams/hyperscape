import { describe, expect, it } from "vitest";
import {
  GoalCriterionSchema,
  GoalRewardSchema,
  OnboardingGoalSchema,
  OnboardingGoalsManifestSchema,
} from "./onboarding-goals.js";

describe("GoalCriterionSchema", () => {
  it("accepts openInventory without targetKey", () => {
    const c = GoalCriterionSchema.parse({ kind: "openInventory" });
    expect(c.requiredCount).toBe(1);
  });

  it("requires targetKey for killMobKind", () => {
    expect(() => GoalCriterionSchema.parse({ kind: "killMobKind" })).toThrow(
      /targetKey/,
    );
  });
});

describe("GoalRewardSchema", () => {
  it("requires amount > 0 for xpGrant", () => {
    expect(() =>
      GoalRewardSchema.parse({ kind: "xpGrant", amount: 0 }),
    ).toThrow(/amount/);
  });

  it("requires targetKey for itemGrant", () => {
    expect(() =>
      GoalRewardSchema.parse({ kind: "itemGrant", amount: 1 }),
    ).toThrow(/targetKey/);
  });

  it("accepts valid xpGrant", () => {
    const r = GoalRewardSchema.parse({ kind: "xpGrant", amount: 100 });
    expect(r.amount).toBe(100);
  });

  it("accepts valid itemGrant", () => {
    const r = GoalRewardSchema.parse({
      kind: "itemGrant",
      targetKey: "bronzeSword",
      amount: 1,
    });
    expect(r.targetKey).toBe("bronzeSword");
  });
});

describe("OnboardingGoalSchema", () => {
  const base = {
    id: "firstKill",
    titleLocalizationKey: "goal.firstKill.title",
    criteria: [{ kind: "killMobKind", targetKey: "goblin" }],
  };

  it("accepts minimal goal", () => {
    const g = OnboardingGoalSchema.parse(base);
    expect(g.playerCanSkip).toBe(true);
  });

  it("requires at least one criterion", () => {
    expect(() =>
      OnboardingGoalSchema.parse({ ...base, criteria: [] }),
    ).toThrow();
  });

  it("rejects duplicate prerequisites", () => {
    expect(() =>
      OnboardingGoalSchema.parse({
        ...base,
        prerequisites: ["a", "a"],
      }),
    ).toThrow(/unique/);
  });
});

describe("OnboardingGoalsManifestSchema", () => {
  const goal = {
    id: "g1",
    titleLocalizationKey: "k",
    criteria: [{ kind: "openInventory" }],
  };

  it("accepts disabled empty manifest", () => {
    const m = OnboardingGoalsManifestSchema.parse({ enabled: false });
    expect(m.goals).toEqual([]);
  });

  it("requires ≥1 goal when enabled", () => {
    expect(() =>
      OnboardingGoalsManifestSchema.parse({ enabled: true }),
    ).toThrow(/at least one goal/);
  });

  it("rejects duplicate goal ids", () => {
    expect(() =>
      OnboardingGoalsManifestSchema.parse({ goals: [goal, goal] }),
    ).toThrow(/unique/);
  });

  it("rejects prerequisite pointing at undefined goal", () => {
    expect(() =>
      OnboardingGoalsManifestSchema.parse({
        goals: [{ ...goal, prerequisites: ["missing"] }],
      }),
    ).toThrow(/prerequisites/);
  });

  it("rejects self-prerequisite", () => {
    expect(() =>
      OnboardingGoalsManifestSchema.parse({
        goals: [{ ...goal, prerequisites: ["g1"] }],
      }),
    ).toThrow(/prerequisites/);
  });

  it("rejects cyclic prerequisites", () => {
    expect(() =>
      OnboardingGoalsManifestSchema.parse({
        goals: [
          {
            id: "a",
            titleLocalizationKey: "k",
            criteria: [{ kind: "openInventory" }],
            prerequisites: ["b"],
          },
          {
            id: "b",
            titleLocalizationKey: "k",
            criteria: [{ kind: "openInventory" }],
            prerequisites: ["a"],
          },
        ],
      }),
    ).toThrow(/DAG/);
  });

  it("accepts linear chain", () => {
    const m = OnboardingGoalsManifestSchema.parse({
      goals: [
        {
          id: "a",
          titleLocalizationKey: "k",
          criteria: [{ kind: "openInventory" }],
        },
        {
          id: "b",
          titleLocalizationKey: "k",
          criteria: [{ kind: "openInventory" }],
          prerequisites: ["a"],
        },
      ],
    });
    expect(m.goals).toHaveLength(2);
  });
});

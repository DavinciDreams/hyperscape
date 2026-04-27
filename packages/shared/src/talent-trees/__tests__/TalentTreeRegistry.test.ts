import { TalentTreesManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it, vi } from "vitest";
import {
  TalentTreeRegistry,
  UnknownTalentTreeError,
  type Allocation,
} from "../TalentTreeRegistry.js";

function manifest() {
  return TalentTreesManifestSchema.parse({
    enabled: true,
    trees: [
      {
        id: "warriorMain",
        name: "Warrior",
        kind: "class",
        ownerRef: "warrior",
        totalPointsAvailable: 30,
        tierPointRequirement: 5,
        nodes: [
          {
            id: "warriorPower1",
            name: "Power I",
            kind: "statBoost",
            tier: 0,
            maxPoints: 5,
          },
          {
            id: "warriorPower2",
            name: "Power II",
            kind: "statBoost",
            tier: 1,
            maxPoints: 3,
            prerequisites: [{ nodeId: "warriorPower1", minPoints: 3 }],
          },
          {
            id: "warriorBerserk",
            name: "Berserk",
            kind: "keystone",
            tier: 2,
            maxPoints: 1,
            keystoneTags: ["offense"],
            prerequisites: [{ nodeId: "warriorPower2", minPoints: 1 }],
          },
        ],
      },
    ],
    respec: {
      enabled: true,
      baseCostCurrency: 1000,
      costMultiplierPerUse: 1.5,
      freeRespecsPerWeek: 1,
    },
  });
}

function alloc(entries: Array<[string, number]>): Allocation {
  return new Map(entries);
}

describe("TalentTreeRegistry — lookup", () => {
  it("indexes trees", () => {
    const r = new TalentTreeRegistry(manifest());
    expect(r.size).toBe(1);
    expect(r.has("warriorMain")).toBe(true);
  });

  it("throws on tree miss", () => {
    const r = new TalentTreeRegistry(manifest());
    expect(() => r.get("ghost")).toThrow(UnknownTalentTreeError);
  });

  it("filters by kind", () => {
    const r = new TalentTreeRegistry(manifest());
    expect(r.byKind("class").map((t) => t.id)).toEqual(["warriorMain"]);
  });

  it("fetches node", () => {
    const r = new TalentTreeRegistry(manifest());
    const n = r.getNode("warriorMain", "warriorBerserk");
    expect(n.kind).toBe("keystone");
  });
});

describe("TalentTreeRegistry — canAllocate", () => {
  it("allows tier-0 from empty allocation", () => {
    const r = new TalentTreeRegistry(manifest());
    const out = r.canAllocate("warriorMain", "warriorPower1", alloc([]), 30);
    expect(out.selectable).toBe(true);
  });

  it("blocks tier-1 without enough spent", () => {
    const r = new TalentTreeRegistry(manifest());
    const out = r.canAllocate(
      "warriorMain",
      "warriorPower2",
      alloc([["warriorPower1", 3]]),
      10,
    );
    // 3 points spent, tier-1 requires 5 → tier-locked
    expect(out.reason).toBe("tier-locked");
  });

  it("allows tier-1 once gate met", () => {
    const r = new TalentTreeRegistry(manifest());
    const out = r.canAllocate(
      "warriorMain",
      "warriorPower2",
      alloc([["warriorPower1", 5]]),
      10,
    );
    expect(out.selectable).toBe(true);
  });

  it("blocks when prereq unmet (even if tier gate met)", () => {
    const r = new TalentTreeRegistry(manifest());
    // Fake enough spent to clear the tier gate, but not on the prereq node.
    // Give 10 points to Power1 beyond its max via raw construction —
    // instead we test with Power2 at 0 but an artificial path: put 5 each
    // on two non-prereq nodes. But our tree has only 3 nodes, so stack
    // on Power1 to saturate it AND pretend the prereq node is a sibling
    // at the same tier. Simpler: just verify the prereq check directly
    // after tier is satisfied.
    const out = r.canAllocate(
      "warriorMain",
      "warriorBerserk",
      // 10 spent in Power1 (over max, but allocation is caller-supplied)
      alloc([["warriorPower1", 10]]),
      10,
    );
    expect(out.reason).toBe("prereq-missing");
  });

  it("blocks at max rank", () => {
    const r = new TalentTreeRegistry(manifest());
    const out = r.canAllocate(
      "warriorMain",
      "warriorPower1",
      alloc([["warriorPower1", 5]]),
      30,
    );
    expect(out.reason).toBe("at-max-rank");
  });

  it("blocks on empty budget", () => {
    const r = new TalentTreeRegistry(manifest());
    const out = r.canAllocate("warriorMain", "warriorPower1", alloc([]), 0);
    expect(out.reason).toBe("budget-exhausted");
  });
});

describe("TalentTreeRegistry — validateAllocation", () => {
  it("valid allocation returns null", () => {
    const r = new TalentTreeRegistry(manifest());
    const v = r.validateAllocation(
      "warriorMain",
      alloc([
        ["warriorPower1", 5],
        ["warriorPower2", 3],
        ["warriorBerserk", 1],
      ]),
      30,
    );
    expect(v).toBeNull();
  });

  it("over-budget rejected", () => {
    const r = new TalentTreeRegistry(manifest());
    const v = r.validateAllocation(
      "warriorMain",
      alloc([["warriorPower1", 5]]),
      2,
    );
    expect(v?.reason).toBe("budget-exhausted");
  });

  it("missing prereq rejected", () => {
    const r = new TalentTreeRegistry(manifest());
    const v = r.validateAllocation(
      "warriorMain",
      alloc([["warriorBerserk", 1]]),
      30,
    );
    expect(v?.reason).toBe("prereq-missing");
  });
});

describe("TalentTreeRegistry — selectableNodes", () => {
  it("returns only selectable nodes", () => {
    const r = new TalentTreeRegistry(manifest());
    const nodes = r.selectableNodes(
      "warriorMain",
      alloc([["warriorPower1", 5]]),
      10,
    );
    expect(nodes.map((n) => n.id)).toEqual(["warriorPower2"]);
  });
});

describe("TalentTreeRegistry — respecCost", () => {
  it("free when free respecs available", () => {
    const r = new TalentTreeRegistry(manifest());
    expect(r.respecCost(0, 0)).toBe(0);
  });

  it("base cost after free consumed", () => {
    const r = new TalentTreeRegistry(manifest());
    expect(r.respecCost(0, 1)).toBe(1000);
  });

  it("escalates per prior use", () => {
    const r = new TalentTreeRegistry(manifest());
    expect(r.respecCost(2, 1)).toBe(Math.round(1000 * 1.5 * 1.5));
  });
});

describe("TalentTreeRegistry — onReloaded", () => {
  it("fires after every successful load()", () => {
    const r = new TalentTreeRegistry();
    const cb = vi.fn();
    r.onReloaded(cb);
    r.load(manifest());
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("returned unsubscribe stops further notifications", () => {
    const r = new TalentTreeRegistry();
    const cb = vi.fn();
    const off = r.onReloaded(cb);
    r.load(manifest());
    off();
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("a throwing listener does not break subsequent listeners", () => {
    const r = new TalentTreeRegistry();
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

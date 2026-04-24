import {
  XpCurvesManifestSchema,
  type XpCurvesManifest,
} from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import {
  InvalidXpLevelError,
  UnknownXpCurveError,
  XPCurveRegistry,
} from "../XPCurveRegistry.js";

function makeManifest(): XpCurvesManifest {
  return XpCurvesManifestSchema.parse([
    {
      id: "rs",
      name: "RuneScape Classic",
      kind: "formula",
      formula: "rs-classic",
      maxLevel: 99,
    },
    {
      id: "linear-default",
      name: "Linear (default)",
      kind: "formula",
      formula: "linear",
      maxLevel: 10,
    },
    {
      id: "quadratic-default",
      name: "Quadratic (default)",
      kind: "formula",
      formula: "quadratic",
      maxLevel: 10,
    },
    {
      id: "exp-default",
      name: "Exponential (default)",
      kind: "formula",
      formula: "exponential",
      maxLevel: 10,
    },
    {
      id: "tiny-lookup",
      name: "Tiny lookup",
      kind: "lookup",
      xp: [100, 250, 500, 1000],
    },
  ]);
}

describe("XPCurveRegistry — registry basics", () => {
  it("empty registry", () => {
    const reg = new XPCurveRegistry();
    expect(reg.size).toBe(0);
    expect(reg.curveIds).toEqual([]);
    expect(reg.has("rs")).toBe(false);
  });

  it("constructor accepts a pre-validated manifest", () => {
    const reg = new XPCurveRegistry(makeManifest());
    expect(reg.size).toBe(5);
    expect(reg.curveIds).toContain("rs");
  });

  it("loadFromJson validates via Zod", () => {
    const reg = new XPCurveRegistry();
    reg.loadFromJson([
      {
        id: "l",
        name: "L",
        kind: "lookup",
        xp: [10, 20],
      },
    ]);
    expect(reg.size).toBe(1);
  });

  it("loadFromJson throws on malformed input", () => {
    const reg = new XPCurveRegistry();
    expect(() =>
      reg.loadFromJson([
        { id: "bad", name: "Bad", kind: "lookup", xp: [10, 5] }, // not strictly increasing
      ]),
    ).toThrow();
    expect(reg.size).toBe(0);
  });

  it("unknown curve throws UnknownXpCurveError", () => {
    const reg = new XPCurveRegistry(makeManifest());
    expect(() => reg.xpForLevel("ghost", 5)).toThrow(UnknownXpCurveError);
  });
});

describe("XPCurveRegistry — rs-classic formula (OSRS values)", () => {
  const reg = new XPCurveRegistry(makeManifest());

  it("level 1 is 0 XP", () => {
    expect(reg.xpForLevel("rs", 1)).toBe(0);
  });

  it("level 2 is 83 XP (canonical)", () => {
    expect(reg.xpForLevel("rs", 2)).toBe(83);
  });

  it("level 10 is 1154 XP (canonical)", () => {
    expect(reg.xpForLevel("rs", 10)).toBe(1154);
  });

  it("level 50 is 101_333 XP (canonical)", () => {
    expect(reg.xpForLevel("rs", 50)).toBe(101_333);
  });

  it("level 99 is 13_034_431 XP (canonical)", () => {
    expect(reg.xpForLevel("rs", 99)).toBe(13_034_431);
  });

  it("maxLevel() returns 99", () => {
    expect(reg.maxLevel("rs")).toBe(99);
  });
});

describe("XPCurveRegistry — linear formula (defaults: base=100, growth=50)", () => {
  const reg = new XPCurveRegistry(makeManifest());

  it("level 1 → 0", () => {
    expect(reg.xpForLevel("linear-default", 1)).toBe(0);
  });

  it("level 2 → 100 (base*1 + growth*0)", () => {
    expect(reg.xpForLevel("linear-default", 2)).toBe(100);
  });

  it("level 3 → 250 (base*2 + growth*1)", () => {
    expect(reg.xpForLevel("linear-default", 3)).toBe(250);
  });

  it("level 10 → strictly larger than level 9", () => {
    expect(reg.xpForLevel("linear-default", 10)).toBeGreaterThan(
      reg.xpForLevel("linear-default", 9),
    );
  });
});

describe("XPCurveRegistry — quadratic formula (default base=50)", () => {
  const reg = new XPCurveRegistry(makeManifest());

  it("level 2 → 50 (Σ k² from 1..1 = 1)", () => {
    expect(reg.xpForLevel("quadratic-default", 2)).toBe(50);
  });

  it("level 3 → 250 (Σ k² from 1..2 = 5)", () => {
    expect(reg.xpForLevel("quadratic-default", 3)).toBe(250);
  });

  it("level 4 → 700 (Σ k² from 1..3 = 14)", () => {
    expect(reg.xpForLevel("quadratic-default", 4)).toBe(700);
  });
});

describe("XPCurveRegistry — exponential formula (defaults: base=100, growth=1.1)", () => {
  const reg = new XPCurveRegistry(makeManifest());

  it("level 2 → 100", () => {
    expect(reg.xpForLevel("exp-default", 2)).toBe(100);
  });

  it("level 3 → 210 (100 * (1.1² - 1)/0.1)", () => {
    expect(reg.xpForLevel("exp-default", 3)).toBe(210);
  });

  it("strictly increasing across all levels", () => {
    const reg2 = new XPCurveRegistry(makeManifest());
    let prev = 0;
    for (let L = 1; L <= 10; L++) {
      const xp = reg2.xpForLevel("exp-default", L);
      expect(xp).toBeGreaterThanOrEqual(prev);
      prev = xp;
    }
  });

  it("growth=1 degenerate case returns linear base*n", () => {
    const reg2 = new XPCurveRegistry(
      XpCurvesManifestSchema.parse([
        {
          id: "flat-exp",
          name: "Flat",
          kind: "formula",
          formula: "exponential",
          maxLevel: 5,
          params: { base: 100, growth: 1 },
        },
      ]),
    );
    expect(reg2.xpForLevel("flat-exp", 2)).toBe(100);
    expect(reg2.xpForLevel("flat-exp", 5)).toBe(400);
  });
});

describe("XPCurveRegistry — lookup curve", () => {
  const reg = new XPCurveRegistry(makeManifest());

  it("level 1 is always 0", () => {
    expect(reg.xpForLevel("tiny-lookup", 1)).toBe(0);
  });

  it("level 2 reads xp[0]", () => {
    expect(reg.xpForLevel("tiny-lookup", 2)).toBe(100);
  });

  it("level 5 reads xp[3]", () => {
    expect(reg.xpForLevel("tiny-lookup", 5)).toBe(1000);
  });

  it("maxLevel is xp.length + 1", () => {
    expect(reg.maxLevel("tiny-lookup")).toBe(5);
  });

  it("level 6 (beyond max) throws InvalidXpLevelError", () => {
    expect(() => reg.xpForLevel("tiny-lookup", 6)).toThrow(InvalidXpLevelError);
  });

  it("level 0 throws InvalidXpLevelError", () => {
    expect(() => reg.xpForLevel("tiny-lookup", 0)).toThrow(InvalidXpLevelError);
  });

  it("non-integer level throws InvalidXpLevelError", () => {
    expect(() => reg.xpForLevel("tiny-lookup", 2.5)).toThrow(
      InvalidXpLevelError,
    );
  });
});

describe("XPCurveRegistry — levelForXp", () => {
  const reg = new XPCurveRegistry(makeManifest());

  it("negative XP clamps to level 1", () => {
    expect(reg.levelForXp("tiny-lookup", -100)).toBe(1);
  });

  it("0 XP is level 1", () => {
    expect(reg.levelForXp("tiny-lookup", 0)).toBe(1);
  });

  it("exactly on a threshold awards that level", () => {
    expect(reg.levelForXp("tiny-lookup", 100)).toBe(2);
    expect(reg.levelForXp("tiny-lookup", 500)).toBe(4);
  });

  it("between thresholds awards the lower level", () => {
    expect(reg.levelForXp("tiny-lookup", 99)).toBe(1);
    expect(reg.levelForXp("tiny-lookup", 499)).toBe(3);
  });

  it("XP above max threshold caps at maxLevel", () => {
    expect(reg.levelForXp("tiny-lookup", 99_999_999)).toBe(5);
  });

  it("rs-classic: 83 XP → level 2, 82 XP → level 1", () => {
    expect(reg.levelForXp("rs", 83)).toBe(2);
    expect(reg.levelForXp("rs", 82)).toBe(1);
  });

  it("rs-classic: 13_034_431 XP → level 99", () => {
    expect(reg.levelForXp("rs", 13_034_431)).toBe(99);
  });
});

describe("XPCurveRegistry — xpToNextLevel", () => {
  const reg = new XPCurveRegistry(makeManifest());

  it("mid-level: returns the gap to the next threshold", () => {
    const r = reg.xpToNextLevel("tiny-lookup", 150);
    expect(r).not.toBeNull();
    if (r === null) return;
    expect(r.currentLevel).toBe(2);
    expect(r.nextLevel).toBe(3);
    expect(r.xpAtCurrentLevel).toBe(100);
    expect(r.xpAtNextLevel).toBe(250);
    expect(r.xpRemaining).toBe(100);
  });

  it("at max level returns null", () => {
    expect(reg.xpToNextLevel("tiny-lookup", 5_000)).toBeNull();
  });

  it("at exactly a threshold: reports progress toward the NEXT level", () => {
    const r = reg.xpToNextLevel("tiny-lookup", 100);
    expect(r).not.toBeNull();
    if (r === null) return;
    expect(r.currentLevel).toBe(2);
    expect(r.nextLevel).toBe(3);
    expect(r.xpRemaining).toBe(150);
  });

  it("from 0 XP toward level 2", () => {
    const r = reg.xpToNextLevel("rs", 0);
    expect(r).not.toBeNull();
    if (r === null) return;
    expect(r.currentLevel).toBe(1);
    expect(r.nextLevel).toBe(2);
    expect(r.xpAtNextLevel).toBe(83);
    expect(r.xpRemaining).toBe(83);
  });
});

describe("XPCurveRegistry — onReloaded() reload listeners", () => {
  it("fires after every load() with the new curve ids", () => {
    const reg = new XPCurveRegistry();
    const calls: ReadonlyArray<string>[] = [];
    reg.onReloaded((ids) => calls.push(ids));

    reg.load(makeManifest());
    expect(calls.length).toBe(1);
    expect([...calls[0]!].sort()).toEqual(
      [
        "rs",
        "linear-default",
        "quadratic-default",
        "exp-default",
        "tiny-lookup",
      ].sort(),
    );

    reg.load(
      XpCurvesManifestSchema.parse([
        {
          id: "single",
          name: "single",
          kind: "formula",
          formula: "linear",
          maxLevel: 5,
        },
      ]),
    );
    expect(calls.length).toBe(2);
    expect(calls[1]).toEqual(["single"]);
  });

  it("returned unsubscribe stops further notifications", () => {
    const reg = new XPCurveRegistry();
    let count = 0;
    const unsubscribe = reg.onReloaded(() => {
      count += 1;
    });

    reg.load(makeManifest());
    expect(count).toBe(1);

    unsubscribe();
    reg.load(makeManifest());
    expect(count).toBe(1);
  });

  it("loadFromJson() also triggers the listener", () => {
    const reg = new XPCurveRegistry();
    let fired = false;
    reg.onReloaded(() => {
      fired = true;
    });
    reg.loadFromJson([
      {
        id: "via-json",
        name: "via-json",
        kind: "formula",
        formula: "rs-classic",
        maxLevel: 99,
      },
    ]);
    expect(fired).toBe(true);
  });

  it("a throwing listener does not break sibling listeners", () => {
    const reg = new XPCurveRegistry();
    const seen: string[] = [];
    reg.onReloaded(() => {
      throw new Error("boom");
    });
    reg.onReloaded(() => seen.push("ok"));
    reg.load(makeManifest());
    expect(seen).toEqual(["ok"]);
  });
});

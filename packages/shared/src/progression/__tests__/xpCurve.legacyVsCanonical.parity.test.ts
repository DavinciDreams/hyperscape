/**
 * Parity diff between the legacy SkillsSystem hardcoded XP formula and
 * the canonical `rs-classic` curve in `XPCurveRegistry`.
 *
 * Both are attempts at the Old-School RuneScape XP table, but they
 * differ in *where* the `Math.floor` is applied:
 *
 *   legacy (SkillsSystem.generateXPTable):
 *     xp[L] = floor( xp[L-1] + ( L-1 + 300 * 2^((L-1)/7) ) / 4 )
 *           per-step floor accumulation
 *
 *   canonical (XPCurveRegistry `rs-classic`):
 *     xp(L) = floor( sum_{n=1..L-1} floor(n + 300 * 2^(n/7)) / 4 )
 *           per-term floor under a single outer floor
 *
 * These differ by ≤ ~37 at L=99 due to floor-distribution order.
 * The canonical version matches the published OSRS wiki values
 * (L99 = 13_034_431). The legacy version produces L99 = 13_034_394.
 *
 * This test DOES NOT enforce equality. It documents the divergence so
 * that anyone swapping a consumer from legacy → registry knows exactly
 * which levels will shift and by how much.
 *
 * The Solidity contract `packages/contracts/src/libraries/XPTable.sol`
 * currently hardcodes the legacy values. Any plan to flip a consumer
 * from legacy → registry must also flip that contract (a governance
 * action) or the web3 parity test will break.
 */

import { describe, expect, it } from "vitest";

import { xpCurveRegistry } from "../index.js";

/** Replica of SkillsSystem.generateXPTable (line 532-539). */
function generateLegacyXpTable(maxLevel = 99): number[] {
  const table: number[] = [0, 0]; // levels 0 and 1
  for (let level = 2; level <= maxLevel; level++) {
    const xp = (level - 1 + 300 * Math.pow(2, (level - 1) / 7)) / 4;
    table.push(Math.floor(table[level - 1] + xp));
  }
  return table;
}

const CANONICAL_CURVE_ID = "parity-test-osrs-classic";

describe("XpCurve legacy-vs-canonical parity", () => {
  it("legacy table at L99 is 13_034_394 (preserved for Solidity parity)", () => {
    const table = generateLegacyXpTable();
    expect(table[99]).toBe(13_034_394);
  });

  it("canonical rs-classic at L99 is 13_034_431 (matches OSRS wiki)", () => {
    xpCurveRegistry.load([
      {
        id: CANONICAL_CURVE_ID,
        name: "Parity test OSRS Classic",
        description: "",
        kind: "formula",
        formula: "rs-classic",
        maxLevel: 99,
        params: {},
      },
    ]);
    try {
      expect(xpCurveRegistry.xpForLevel(CANONICAL_CURVE_ID, 99)).toBe(
        13_034_431,
      );
    } finally {
      xpCurveRegistry.load([]);
    }
  });

  it("documents: 96 of 98 levels (L2..L99) diverge between legacy and canonical", () => {
    const legacy = generateLegacyXpTable();
    xpCurveRegistry.load([
      {
        id: CANONICAL_CURVE_ID,
        name: "Parity test OSRS Classic",
        description: "",
        kind: "formula",
        formula: "rs-classic",
        maxLevel: 99,
        params: {},
      },
    ]);

    try {
      let matches = 0;
      let diverges = 0;
      let maxDelta = 0;
      for (let L = 2; L <= 99; L++) {
        const legacyVal = legacy[L];
        const canonicalVal = xpCurveRegistry.xpForLevel(CANONICAL_CURVE_ID, L);
        const delta = Math.abs(canonicalVal - legacyVal);
        if (delta === 0) {
          matches++;
        } else {
          diverges++;
          if (delta > maxDelta) maxDelta = delta;
        }
      }

      // Snapshot the known divergence shape. If these numbers shift,
      // either SkillsSystem formula changed, or XPCurveRegistry's
      // rs-classic implementation changed — both are meaningful
      // cross-cutting events worth failing loud on.
      expect(matches).toBe(2); // L1 and one other early level
      expect(diverges).toBe(96);
      expect(maxDelta).toBeGreaterThan(0);
      expect(maxDelta).toBeLessThan(50); // empirically ≤ ~37
    } finally {
      xpCurveRegistry.load([]);
    }
  });

  it("L1 always matches (both are 0)", () => {
    const legacy = generateLegacyXpTable();
    xpCurveRegistry.load([
      {
        id: CANONICAL_CURVE_ID,
        name: "Parity test OSRS Classic",
        description: "",
        kind: "formula",
        formula: "rs-classic",
        maxLevel: 99,
        params: {},
      },
    ]);
    try {
      expect(legacy[1]).toBe(0);
      expect(xpCurveRegistry.xpForLevel(CANONICAL_CURVE_ID, 1)).toBe(0);
    } finally {
      xpCurveRegistry.load([]);
    }
  });
});

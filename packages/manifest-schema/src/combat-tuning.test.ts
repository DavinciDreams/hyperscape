/**
 * Faithfulness + defensiveness tests for `CombatTuningManifestSchema`.
 *
 * Reference profile is the current hardcoded `DuelCombatConfig` default
 * taken from `packages/server/src/duel/DuelCombatAI.ts`.
 */

import { describe, expect, it } from "vitest";

import {
  CombatTuningManifestSchema,
  type CombatTuningManifest,
} from "./combat-tuning.js";

const reference: CombatTuningManifest = [
  {
    id: "duel_default",
    name: "Default duel tuning",
    description: "Mirrors DuelCombatAI static defaults",
    tickMs: 600,
    hpThresholdsPct: { heal: 40, aggressive: 70, defensive: 30 },
    engagementRanges: {
      melee: { min: 0.8, max: 1.8 },
      ranged: { min: 5, max: 8 },
      mage: { min: 5, max: 8 },
    },
    offensivePrayers: {
      melee: "superhuman_strength",
      ranged: "hawk_eye",
      mage: "mystic_lore",
    },
    defensivePrayer: "rock_skin",
    movement: { moveCooldownMs: 1200, strafeStep: 1.35 },
    noFood: false,
    useLlmTactics: false,
  },
  {
    id: "duel_no_food",
    name: "No-food duel",
    description: "Tournament variant with food use disabled",
    tickMs: 600,
    hpThresholdsPct: { heal: 1, aggressive: 70, defensive: 0 },
    engagementRanges: {
      melee: { min: 0.8, max: 1.8 },
      ranged: { min: 5, max: 8 },
      mage: { min: 5, max: 8 },
    },
    offensivePrayers: {
      melee: "superhuman_strength",
      ranged: "hawk_eye",
      mage: "mystic_lore",
    },
    defensivePrayer: "rock_skin",
    movement: { moveCooldownMs: 1200, strafeStep: 1.35 },
    noFood: true,
    useLlmTactics: false,
  },
];

describe("CombatTuningManifestSchema", () => {
  it("parses the reference manifest cleanly", () => {
    const result = CombatTuningManifestSchema.safeParse(reference);
    if (!result.success) {
      throw new Error(
        `Reference manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("applies movement + tick + flag defaults on a minimal profile", () => {
    const minimal = [
      {
        id: "basic",
        name: "Basic",
        hpThresholdsPct: { heal: 40, aggressive: 70, defensive: 30 },
        engagementRanges: {
          melee: { min: 0.8, max: 1.8 },
          ranged: { min: 5, max: 8 },
          mage: { min: 5, max: 8 },
        },
        offensivePrayers: {
          melee: "superhuman_strength",
          ranged: "hawk_eye",
          mage: "mystic_lore",
        },
        defensivePrayer: "rock_skin",
      },
    ];
    const parsed = CombatTuningManifestSchema.parse(minimal);
    expect(parsed[0].tickMs).toBe(600);
    expect(parsed[0].noFood).toBe(false);
    expect(parsed[0].useLlmTactics).toBe(false);
    expect(parsed[0].movement.moveCooldownMs).toBe(1200);
    expect(parsed[0].movement.strafeStep).toBe(1.35);
    expect(parsed[0].description).toBe("");
  });

  it("rejects inverted HP thresholds (heal ≥ aggressive)", () => {
    const bad = [
      {
        ...reference[0],
        hpThresholdsPct: { heal: 70, aggressive: 70, defensive: 30 },
      },
    ];
    expect(CombatTuningManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects defensive ≥ heal HP thresholds", () => {
    const bad = [
      {
        ...reference[0],
        hpThresholdsPct: { heal: 30, aggressive: 70, defensive: 30 },
      },
    ];
    expect(CombatTuningManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects HP threshold > 100", () => {
    const bad = [
      {
        ...reference[0],
        hpThresholdsPct: { heal: 40, aggressive: 101, defensive: 30 },
      },
    ];
    expect(CombatTuningManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects engagement range where min > max", () => {
    const bad = [
      {
        ...reference[0],
        engagementRanges: {
          ...reference[0].engagementRanges,
          melee: { min: 5, max: 2 },
        },
      },
    ];
    expect(CombatTuningManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects engagement range where max is zero", () => {
    const bad = [
      {
        ...reference[0],
        engagementRanges: {
          ...reference[0].engagementRanges,
          melee: { min: 0, max: 0 },
        },
      },
    ];
    expect(CombatTuningManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects missing role in offensivePrayers", () => {
    const bad = [
      {
        ...reference[0],
        offensivePrayers: { melee: "superhuman_strength", ranged: "hawk_eye" },
      },
    ];
    expect(CombatTuningManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects zero tickMs", () => {
    const bad = [{ ...reference[0], tickMs: 0 }];
    expect(CombatTuningManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects negative strafeStep", () => {
    const bad = [
      { ...reference[0], movement: { moveCooldownMs: 1200, strafeStep: -1 } },
    ];
    expect(CombatTuningManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects empty defensivePrayer", () => {
    const bad = [{ ...reference[0], defensivePrayer: "" }];
    expect(CombatTuningManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate profile ids", () => {
    const bad = [reference[0], { ...reference[0] }];
    expect(CombatTuningManifestSchema.safeParse(bad).success).toBe(false);
  });
});

/**
 * XP curve registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `xp-curves.ts`.
 * Indexes authored curves by id and resolves two flavors:
 * - `formula` curves — closed-form `xp(level)` derived per `XpFormulaKind`
 * - `lookup` curves — cumulative-XP thresholds read directly from the array
 *
 * Helpers expose the two queries gameplay actually needs:
 * - `xpForLevel(id, L)` — cumulative XP required to reach `L`
 * - `levelForXp(id, xp)` — highest level attained with `xp` cumulative
 *
 * Scope: pure logic. No deps on skill system, player entity, save
 * data, or networking — the registry can be imported + unit-tested in
 * isolation. Gameplay glue (e.g. applying XP gains to `PlayerStats`,
 * emitting level-up events) lives in the skill system consumer.
 */

import {
  type XpCurve,
  type XpCurvesManifest,
  XpCurvesManifestSchema,
} from "@hyperforge/manifest-schema";

/** Result of `xpToNextLevel` when the player is below the cap. */
export interface XpToNextResult {
  currentLevel: number;
  nextLevel: number;
  xpAtCurrentLevel: number;
  xpAtNextLevel: number;
  xpRemaining: number;
}

export class UnknownXpCurveError extends Error {
  readonly curveId: string;
  readonly availableIds: readonly string[];
  constructor(curveId: string, availableIds: readonly string[]) {
    super(
      `xp curve "${curveId}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownXpCurveError";
    this.curveId = curveId;
    this.availableIds = availableIds;
  }
}

export class InvalidXpLevelError extends Error {
  readonly curveId: string;
  readonly level: number;
  readonly maxLevel: number;
  constructor(curveId: string, level: number, maxLevel: number) {
    super(
      `level ${level} out of range for curve "${curveId}" (valid: 1..${maxLevel})`,
    );
    this.name = "InvalidXpLevelError";
    this.curveId = curveId;
    this.level = level;
    this.maxLevel = maxLevel;
  }
}

/**
 * Closed-form formula evaluators. Each returns the cumulative XP to
 * reach `level` (level=1 always returns 0). `params` comes from the
 * authored curve; defaults applied here mirror gameplay-recognizable
 * shapes.
 */
const FORMULA_EVALUATORS: Record<
  string,
  (level: number, params: Record<string, number>) => number
> = {
  linear(level, params) {
    if (level <= 1) return 0;
    const base = params.base ?? 100;
    const growth = params.growth ?? 50;
    // Δ(L) = base + growth*(L-2); xp(L) = Σ Δ(2..L)
    const n = level - 1;
    return Math.floor(base * n + (growth * n * (n - 1)) / 2);
  },
  quadratic(level, params) {
    if (level <= 1) return 0;
    const base = params.base ?? 50;
    const n = level - 1;
    // Σ(k=1..n, k²) = n(n+1)(2n+1)/6
    return Math.floor((base * n * (n + 1) * (2 * n + 1)) / 6);
  },
  exponential(level, params) {
    if (level <= 1) return 0;
    const base = params.base ?? 100;
    const growth = params.growth ?? 1.1;
    const n = level - 1;
    // Δ(L) = base * growth^(L-2); xp(L) = base * Σ(k=0..n-1, growth^k)
    if (Math.abs(growth - 1) < 1e-9) {
      return Math.floor(base * n);
    }
    return Math.floor((base * (Math.pow(growth, n) - 1)) / (growth - 1));
  },
  "rs-classic"(level) {
    // Canonical OSRS XP table — independent of params.
    // xp(L) = floor(Σ(n=1..L-1, floor(n + 300*2^(n/7))) / 4)
    if (level <= 1) return 0;
    let sum = 0;
    for (let n = 1; n < level; n++) {
      sum += Math.floor(n + 300 * Math.pow(2, n / 7));
    }
    return Math.floor(sum / 4);
  },
};

export class XPCurveRegistry {
  private curvesById = new Map<string, XpCurve>();

  constructor(manifest?: XpCurvesManifest) {
    if (manifest !== undefined) this.load(manifest);
  }

  load(manifest: XpCurvesManifest): void {
    this.curvesById.clear();
    for (const curve of manifest) {
      this.curvesById.set(curve.id, curve);
    }
  }

  loadFromJson(raw: unknown): void {
    const parsed = XpCurvesManifestSchema.parse(raw);
    this.load(parsed);
  }

  get curveIds(): readonly string[] {
    return Array.from(this.curvesById.keys());
  }

  get size(): number {
    return this.curvesById.size;
  }

  /**
   * Non-throwing check for consumers that want to prefer the registry
   * when an xp-curves manifest has been loaded and fall back to a
   * hardcoded default curve otherwise. Symmetric with
   * `WorldAreasRegistry.isLoaded()`.
   */
  isLoaded(): boolean {
    return this.curvesById.size > 0;
  }

  has(curveId: string): boolean {
    return this.curvesById.has(curveId);
  }

  get(curveId: string): XpCurve | undefined {
    return this.curvesById.get(curveId);
  }

  /** Maximum level the named curve supports. */
  maxLevel(curveId: string): number {
    const curve = this.requireCurve(curveId);
    return curve.kind === "formula" ? curve.maxLevel : curve.xp.length + 1;
  }

  /**
   * Cumulative XP required to reach `level`. Level 1 returns 0.
   * Throws `InvalidXpLevelError` if `level < 1` or `level > maxLevel`.
   */
  xpForLevel(curveId: string, level: number): number {
    const curve = this.requireCurve(curveId);
    const max = curve.kind === "formula" ? curve.maxLevel : curve.xp.length + 1;
    if (!Number.isInteger(level) || level < 1 || level > max) {
      throw new InvalidXpLevelError(curveId, level, max);
    }
    if (level === 1) return 0;

    if (curve.kind === "formula") {
      const evaluator = FORMULA_EVALUATORS[curve.formula];
      if (evaluator === undefined) {
        // Schema enum is closed, so this is a programmer-added-a-formula-kind
        // -without-wiring-an-evaluator error rather than a runtime bug.
        throw new Error(
          `no evaluator registered for formula kind "${curve.formula}"`,
        );
      }
      return evaluator(level, curve.params);
    }
    // `lookup.xp[0]` = XP to reach level 2; index = level - 2.
    return curve.xp[level - 2]!;
  }

  /**
   * Highest level a player at `xp` cumulative XP has attained. Clamps
   * negative XP to level 1, and caps at the curve's `maxLevel`.
   */
  levelForXp(curveId: string, xp: number): number {
    const curve = this.requireCurve(curveId);
    if (xp <= 0) return 1;
    const max = curve.kind === "formula" ? curve.maxLevel : curve.xp.length + 1;
    // Linear scan — max level is bounded (<=126 for rs-classic) so it's
    // ~fine; swap to binary search on lookup-kind if a curve ever needs it.
    for (let L = 2; L <= max; L++) {
      const threshold = this.xpForLevel(curveId, L);
      if (xp < threshold) return L - 1;
    }
    return max;
  }

  /**
   * XP progress from the player's current level to the next. Returns
   * `null` when the player is at max level.
   */
  xpToNextLevel(curveId: string, currentXp: number): XpToNextResult | null {
    const curve = this.requireCurve(curveId);
    const max = curve.kind === "formula" ? curve.maxLevel : curve.xp.length + 1;
    const currentLevel = this.levelForXp(curveId, currentXp);
    if (currentLevel >= max) return null;
    const nextLevel = currentLevel + 1;
    const xpAtCurrentLevel = this.xpForLevel(curveId, currentLevel);
    const xpAtNextLevel = this.xpForLevel(curveId, nextLevel);
    return {
      currentLevel,
      nextLevel,
      xpAtCurrentLevel,
      xpAtNextLevel,
      xpRemaining: xpAtNextLevel - Math.max(0, currentXp),
    };
  }

  private requireCurve(curveId: string): XpCurve {
    const curve = this.curvesById.get(curveId);
    if (curve === undefined) {
      throw new UnknownXpCurveError(curveId, this.curveIds);
    }
    return curve;
  }
}

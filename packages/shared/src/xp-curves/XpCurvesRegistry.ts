/**
 * XP curves registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `xp-curves.ts`.
 * Resolves XP-for-level from either closed-form formulas or explicit
 * lookup tables. Pure math; owns no progression state.
 */

import {
  type XpCurve,
  type XpCurvesManifest,
  XpCurvesManifestSchema,
} from "@hyperforge/manifest-schema";

export class XpCurvesNotLoadedError extends Error {
  constructor() {
    super("XpCurvesRegistry used before load()");
    this.name = "XpCurvesNotLoadedError";
  }
}

export class UnknownXpCurveError extends Error {
  readonly curveId: string;
  readonly availableIds: readonly string[];
  constructor(id: string, availableIds: readonly string[]) {
    super(
      `xp-curve "${id}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownXpCurveError";
    this.curveId = id;
    this.availableIds = availableIds;
  }
}

export class XpLevelOutOfRangeError extends Error {
  readonly curveId: string;
  readonly level: number;
  readonly maxLevel: number;
  constructor(curveId: string, level: number, maxLevel: number) {
    super(
      `level ${level} out of range for curve "${curveId}" (1..${maxLevel})`,
    );
    this.name = "XpLevelOutOfRangeError";
    this.curveId = curveId;
    this.level = level;
    this.maxLevel = maxLevel;
  }
}

export class XpCurvesRegistry {
  private _manifest: XpCurvesManifest | null = null;
  private _byId = new Map<string, XpCurve>();

  constructor(manifest?: XpCurvesManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: XpCurvesManifest): void {
    this._manifest = manifest;
    this._byId.clear();
    for (const c of manifest) this._byId.set(c.id, c);
  }

  loadFromJson(raw: unknown): void {
    this.load(XpCurvesManifestSchema.parse(raw));
  }

  get manifest(): XpCurvesManifest {
    if (!this._manifest) throw new XpCurvesNotLoadedError();
    return this._manifest;
  }

  has(id: string): boolean {
    return this._byId.has(id);
  }

  get(id: string): XpCurve {
    const c = this._byId.get(id);
    if (!c) {
      throw new UnknownXpCurveError(id, Array.from(this._byId.keys()));
    }
    return c;
  }

  ids(): string[] {
    return Array.from(this._byId.keys());
  }

  maxLevel(curveId: string): number {
    const c = this.get(curveId);
    return c.kind === "formula" ? c.maxLevel : c.xp.length + 1;
  }

  /**
   * Cumulative XP required to reach `level` (>=2). Level 1 is the
   * starting level (cost 0).
   */
  xpForLevel(curveId: string, level: number): number {
    const c = this.get(curveId);
    if (level < 1) {
      throw new XpLevelOutOfRangeError(curveId, level, this.maxLevel(curveId));
    }
    if (level === 1) return 0;

    if (c.kind === "lookup") {
      const idx = level - 2;
      if (idx >= c.xp.length) {
        throw new XpLevelOutOfRangeError(curveId, level, c.xp.length + 1);
      }
      return c.xp[idx]!;
    }

    if (level > c.maxLevel) {
      throw new XpLevelOutOfRangeError(curveId, level, c.maxLevel);
    }
    return this._evalFormula(c.formula, c.params, level);
  }

  /**
   * Resolve the level granted by `totalXp` on the given curve. Returns
   * the highest level whose cumulative XP cost is ≤ totalXp. Capped at
   * the curve's maxLevel.
   */
  levelForXp(curveId: string, totalXp: number): number {
    if (totalXp < 0) return 1;
    const maxLvl = this.maxLevel(curveId);
    let lvl = 1;
    for (let n = 2; n <= maxLvl; n++) {
      if (this.xpForLevel(curveId, n) <= totalXp) lvl = n;
      else break;
    }
    return lvl;
  }

  private _evalFormula(
    formula: "linear" | "quadratic" | "exponential" | "rs-classic",
    params: Record<string, number>,
    level: number,
  ): number {
    switch (formula) {
      case "linear": {
        const base = params.base ?? 100;
        const growth = params.growth ?? 100;
        return Math.floor(base + growth * (level - 2));
      }
      case "quadratic": {
        const base = params.base ?? 100;
        const growth = params.growth ?? 25;
        const n = level - 1;
        return Math.floor(base * n + growth * n * n);
      }
      case "exponential": {
        const base = params.base ?? 100;
        const ratio = params.ratio ?? 1.1;
        return Math.floor(base * Math.pow(ratio, level - 2));
      }
      case "rs-classic": {
        // OSRS cumulative XP to reach level L (L >= 2):
        // sum over k from 1..(L-1) of floor(k + 300 * 2^(k/7)) / 4
        let total = 0;
        for (let k = 1; k < level; k++) {
          total += Math.floor(k + 300 * Math.pow(2, k / 7));
        }
        return Math.floor(total / 4);
      }
    }
  }
}

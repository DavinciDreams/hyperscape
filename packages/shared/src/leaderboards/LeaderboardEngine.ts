/**
 * Leaderboard engine.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s
 * `leaderboards.ts`. Pure logic: given an authored board + a set of
 * player scores, computes the ranked order (honoring sort + tie-break),
 * trims to `maxEntries`, and resolves reward brackets for any rank.
 *
 * Scope: rank + reward math only. Caller owns storage of raw scores,
 * cadence rollovers, cross-shard consolidation, and announcement.
 */

import {
  type Leaderboard,
  type LeaderboardRewardBracket,
  type LeaderboardsManifest,
  LeaderboardsManifestSchema,
} from "@hyperforge/manifest-schema";

export class UnknownLeaderboardError extends Error {
  readonly leaderboardId: string;
  readonly availableIds: readonly string[];
  constructor(id: string, availableIds: readonly string[]) {
    super(
      `leaderboard "${id}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownLeaderboardError";
    this.leaderboardId = id;
    this.availableIds = availableIds;
  }
}

/**
 * Raw score submission. `timestampMs` drives tie-breaks; `playerLevel`
 * drives the level-band eligibility gate.
 */
export interface LeaderboardScore {
  playerId: string;
  score: number;
  timestampMs: number;
  playerLevel: number;
}

/** Fully-ranked entry — `rank` is 1-indexed, ties get identical rank. */
export interface RankedEntry {
  rank: number;
  playerId: string;
  score: number;
  timestampMs: number;
}

export class LeaderboardEngine {
  private _byId = new Map<string, Leaderboard>();

  constructor(manifest?: LeaderboardsManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: LeaderboardsManifest): void {
    this._byId.clear();
    for (const lb of manifest) this._byId.set(lb.id, lb);
  }

  loadFromJson(raw: unknown): void {
    this.load(LeaderboardsManifestSchema.parse(raw));
  }

  get size(): number {
    return this._byId.size;
  }

  isLoaded(): boolean {
    return this._byId.size > 0;
  }

  has(id: string): boolean {
    return this._byId.has(id);
  }

  get(id: string): Leaderboard {
    const lb = this._byId.get(id);
    if (!lb) {
      throw new UnknownLeaderboardError(id, Array.from(this._byId.keys()));
    }
    return lb;
  }

  /** Is a player eligible to submit to this board? */
  isEligible(leaderboardId: string, score: LeaderboardScore): boolean {
    const lb = this.get(leaderboardId);
    if (score.playerLevel < lb.minLevel || score.playerLevel > lb.maxLevel) {
      return false;
    }
    if (score.score < lb.minQualifyingScore) return false;
    return true;
  }

  /**
   * Rank a set of submitted scores. Returns at most `maxEntries` rows.
   * Ties share rank; the next rank after a tie skips by the tie size.
   */
  rank(leaderboardId: string, scores: LeaderboardScore[]): RankedEntry[] {
    const lb = this.get(leaderboardId);
    const eligible = scores.filter((s) => this.isEligible(leaderboardId, s));
    const sorted = [...eligible].sort((a, b) => compare(lb, a, b));
    const out: RankedEntry[] = [];
    let i = 0;
    while (i < sorted.length && out.length < lb.maxEntries) {
      // Determine block of ties sharing the same rank given tieBreak.
      const startIdx = i;
      let j = i + 1;
      while (j < sorted.length && isTie(lb, sorted[startIdx], sorted[j])) {
        j += 1;
      }
      // Rank is 1-indexed; all rows in the block share startIdx+1.
      const rank = startIdx + 1;
      for (let k = startIdx; k < j && out.length < lb.maxEntries; k += 1) {
        out.push({
          rank,
          playerId: sorted[k].playerId,
          score: sorted[k].score,
          timestampMs: sorted[k].timestampMs,
        });
      }
      i = j;
    }
    return out;
  }

  /**
   * Resolve the reward bracket that a 1-indexed `rank` falls into for
   * the supplied `totalEntries`. Returns null when no bracket matches.
   */
  bracketForRank(
    leaderboardId: string,
    rank: number,
    totalEntries: number,
  ): LeaderboardRewardBracket | null {
    if (rank < 1 || totalEntries < 1) return null;
    const lb = this.get(leaderboardId);
    for (const b of lb.rewardBrackets) {
      if (b.mode === "rank") {
        if (rank >= b.minRank && rank <= b.maxRank) return b;
      } else {
        const percent = (rank - 1) / totalEntries;
        if (percent >= b.minPercent && percent <= b.maxPercent) return b;
      }
    }
    return null;
  }
}

function compare(
  lb: Leaderboard,
  a: LeaderboardScore,
  b: LeaderboardScore,
): number {
  const diff = lb.sort === "desc" ? b.score - a.score : a.score - b.score;
  if (diff !== 0) return diff;
  switch (lb.tieBreak) {
    case "earliestFirst":
      return a.timestampMs - b.timestampMs;
    case "latestFirst":
      return b.timestampMs - a.timestampMs;
    case "none":
      return 0;
  }
}

function isTie(
  lb: Leaderboard,
  a: LeaderboardScore,
  b: LeaderboardScore,
): boolean {
  if (a.score !== b.score) return false;
  if (lb.tieBreak === "none") return true;
  return a.timestampMs === b.timestampMs;
}

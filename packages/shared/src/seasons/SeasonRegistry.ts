/**
 * Season registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `seasons.ts`.
 * Pure logic: indexes seasons, resolves the active season for a given
 * clock, and exposes tier / reward lookup helpers.
 *
 * Scope: query surface only. Caller owns player XP, premium pass
 * ownership, challenge progress, mail at season end.
 */

import {
  type Season,
  type SeasonChallenge,
  type SeasonsManifest,
  SeasonsManifestSchema,
  type SeasonTier,
  type SeasonTrack,
} from "@hyperforge/manifest-schema";

export class UnknownSeasonError extends Error {
  readonly seasonId: string;
  readonly availableIds: readonly string[];
  constructor(seasonId: string, availableIds: readonly string[]) {
    super(
      `season "${seasonId}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownSeasonError";
    this.seasonId = seasonId;
    this.availableIds = availableIds;
  }
}

export class UnknownTrackError extends Error {
  readonly trackId: string;
  constructor(seasonId: string, trackId: string) {
    super(`season "${seasonId}" has no track "${trackId}"`);
    this.name = "UnknownTrackError";
    this.trackId = trackId;
  }
}

export interface TierProgress {
  /** Zero-based current tier index (0 = not yet reached tier 1). */
  tierIndex: number;
  /** Tier object the player is currently *on* (null before tier 1). */
  currentTier: SeasonTier | null;
  /** Tier the next unlock requires (null when already at cap). */
  nextTier: SeasonTier | null;
  /** XP accumulated into the next tier. */
  xpIntoNext: number;
  /** XP required for the next tier. */
  xpForNext: number;
}

/** Listener invoked after every successful `load()` / `loadFromJson()`. */
export type SeasonReloadListener = () => void;

export class SeasonRegistry {
  private _byId = new Map<string, Season>();
  private _sortedByStart: Season[] = [];
  private _reloadListeners = new Set<SeasonReloadListener>();

  constructor(manifest?: SeasonsManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: SeasonsManifest): void {
    this._byId.clear();
    this._sortedByStart = [...manifest].sort(
      (a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt),
    );
    for (const s of manifest) this._byId.set(s.id, s);
    this._emitReloaded();
  }

  loadFromJson(raw: unknown): void {
    this.load(SeasonsManifestSchema.parse(raw));
  }

  /**
   * Subscribe to reload notifications. Returns unsubscribe.
   * Listener throws are caught + logged. Pattern matches
   * `SkillIconsRegistry.onReloaded`.
   */
  onReloaded(cb: SeasonReloadListener): () => void {
    this._reloadListeners.add(cb);
    return () => {
      this._reloadListeners.delete(cb);
    };
  }

  private _emitReloaded(): void {
    if (this._reloadListeners.size === 0) return;
    for (const cb of this._reloadListeners) {
      try {
        cb();
      } catch (err) {
        console.warn(
          "[seasonRegistry] reload listener threw:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }
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

  get(id: string): Season {
    const s = this._byId.get(id);
    if (!s) {
      throw new UnknownSeasonError(id, Array.from(this._byId.keys()));
    }
    return s;
  }

  ids(): string[] {
    return Array.from(this._byId.keys());
  }

  /**
   * Season whose `[startsAt, endsAt)` contains `nowMs`. Returns null
   * when between seasons.
   */
  activeSeason(nowMs: number): Season | null {
    for (const s of this._sortedByStart) {
      const start = Date.parse(s.startsAt);
      const end = Date.parse(s.endsAt);
      if (nowMs >= start && nowMs < end) return s;
    }
    return null;
  }

  /** Next season whose `startsAt > nowMs`, or null. */
  upcomingSeason(nowMs: number): Season | null {
    for (const s of this._sortedByStart) {
      if (Date.parse(s.startsAt) > nowMs) return s;
    }
    return null;
  }

  getTrack(seasonId: string, trackId: string): SeasonTrack {
    const season = this.get(seasonId);
    const t = season.tracks.find((x) => x.id === trackId);
    if (!t) throw new UnknownTrackError(seasonId, trackId);
    return t;
  }

  /** All challenges matching `frequency`. */
  challengesOfFrequency(
    seasonId: string,
    frequency: SeasonChallenge["frequency"],
  ): SeasonChallenge[] {
    return this.get(seasonId).challenges.filter(
      (c) => c.frequency === frequency,
    );
  }

  /**
   * Compute the player's tier progress on a given track given their
   * accumulated season XP. Tiers are ordered by `tier` number; we walk
   * the list subtracting `xpRequired` until we can't advance further.
   */
  resolveTierProgress(
    seasonId: string,
    trackId: string,
    seasonXp: number,
  ): TierProgress {
    if (seasonXp < 0 || !Number.isFinite(seasonXp)) {
      throw new TypeError(
        `seasonXp must be a non-negative finite number (got ${String(seasonXp)})`,
      );
    }
    const track = this.getTrack(seasonId, trackId);
    const tiers = [...track.tiers].sort((a, b) => a.tier - b.tier);
    let remaining = seasonXp;
    let tierIndex = 0;
    for (let i = 0; i < tiers.length; i++) {
      if (remaining >= tiers[i].xpRequired) {
        remaining -= tiers[i].xpRequired;
        tierIndex = i + 1;
      } else {
        return {
          tierIndex,
          currentTier: tierIndex > 0 ? tiers[tierIndex - 1] : null,
          nextTier: tiers[i],
          xpIntoNext: remaining,
          xpForNext: tiers[i].xpRequired,
        };
      }
    }
    // Overshoot — already past top tier
    return {
      tierIndex,
      currentTier: tiers[tiers.length - 1],
      nextTier: null,
      xpIntoNext: remaining,
      xpForNext: 0,
    };
  }

  /**
   * Returns true iff `nowMs` is within the grace window after the
   * season's end — during this window unclaimed rewards are still
   * redeemable.
   */
  isInGracePeriod(seasonId: string, nowMs: number): boolean {
    const s = this.get(seasonId);
    const end = Date.parse(s.endsAt);
    const graceMs = s.endBehavior.gracePeriodDays * 24 * 60 * 60 * 1000;
    return nowMs >= end && nowMs < end + graceMs;
  }
}

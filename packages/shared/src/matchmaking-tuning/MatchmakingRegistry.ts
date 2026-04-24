/**
 * Matchmaking registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s
 * `matchmaking-tuning.ts`. Pure logic: queue lookup, bucket-widening
 * schedule resolution at a given wait time, party-constraint checks,
 * backfill eligibility. Runtime `MatchmakingSystem` owns actual queue
 * state + region assignment + game instantiation.
 */

import {
  type MatchmakingQueue,
  type MatchmakingTuningManifest,
  type WideningStep,
  MatchmakingTuningManifestSchema,
} from "@hyperforge/manifest-schema";

export class MatchmakingNotLoadedError extends Error {
  constructor() {
    super("MatchmakingRegistry used before load()");
    this.name = "MatchmakingNotLoadedError";
  }
}

export class UnknownQueueError extends Error {
  readonly queueId: string;
  readonly availableIds: readonly string[];
  constructor(id: string, availableIds: readonly string[]) {
    super(
      `matchmaking queue "${id}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownQueueError";
    this.queueId = id;
    this.availableIds = availableIds;
  }
}

/** Current effective match window for a queue at time `waitedSec`. */
export interface EffectiveWindow {
  ratingHalfWidth: number;
  allowCrossRegion: boolean;
  maxPingMs: number;
  /** The step that applied (null = initial/pre-widening). */
  appliedStep: WideningStep | null;
}

export type PartyCheckReason =
  | "allowed"
  | "too-small"
  | "too-large"
  | "rating-spread-too-wide"
  | "solo-with-party-forbidden";

export interface PartyCheckResult {
  allowed: boolean;
  reason: PartyCheckReason;
}

export interface PartyCheckInput {
  partySize: number;
  /** Largest rating in the party. */
  maxRating: number;
  /** Smallest rating in the party. */
  minRating: number;
  /** True iff the "party" includes at least one solo queuer. */
  includesSolo: boolean;
}

export class MatchmakingRegistry {
  private _manifest: MatchmakingTuningManifest | null = null;
  private _byId = new Map<string, MatchmakingQueue>();

  constructor(manifest?: MatchmakingTuningManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: MatchmakingTuningManifest): void {
    this._manifest = manifest;
    this._byId.clear();
    for (const q of manifest.queues) this._byId.set(q.id, q);
  }

  loadFromJson(raw: unknown): void {
    this.load(MatchmakingTuningManifestSchema.parse(raw));
  }

  isLoaded(): boolean {
    return this._manifest !== null;
  }

  get manifest(): MatchmakingTuningManifest {
    if (!this._manifest) throw new MatchmakingNotLoadedError();
    return this._manifest;
  }

  get size(): number {
    return this._byId.size;
  }

  has(id: string): boolean {
    return this._byId.has(id);
  }

  get(id: string): MatchmakingQueue {
    const q = this._byId.get(id);
    if (!q) {
      throw new UnknownQueueError(id, Array.from(this._byId.keys()));
    }
    return q;
  }

  ids(): string[] {
    return Array.from(this._byId.keys());
  }

  /** Queues sorted by priority (descending). */
  queuesByPriority(): MatchmakingQueue[] {
    return Array.from(this._byId.values()).sort(
      (a, b) => b.priority - a.priority,
    );
  }

  /**
   * Compute the effective match window at time `waitedSec`. Walks the
   * widening schedule and picks the latest step whose `afterSec` has
   * elapsed. If none fired, returns the queue's `initialRatingHalfWidth`.
   */
  effectiveWindow(queueId: string, waitedSec: number): EffectiveWindow {
    const q = this.get(queueId);
    let applied: WideningStep | null = null;
    for (const step of q.wideningSchedule) {
      if (waitedSec >= step.afterSec) applied = step;
      else break;
    }
    if (!applied) {
      return {
        ratingHalfWidth: q.initialRatingHalfWidth,
        allowCrossRegion: false,
        maxPingMs: 0,
        appliedStep: null,
      };
    }
    return {
      ratingHalfWidth: applied.ratingHalfWidth,
      allowCrossRegion: applied.allowCrossRegion,
      maxPingMs: applied.maxPingMs,
      appliedStep: applied,
    };
  }

  /** Has the queue's hard timeout elapsed? */
  isExpired(queueId: string, waitedSec: number): boolean {
    const q = this.get(queueId);
    if (q.hardTimeoutSec === 0) return false;
    return waitedSec >= q.hardTimeoutSec;
  }

  /** Verify a prospective party meets the queue's party constraints. */
  checkParty(queueId: string, input: PartyCheckInput): PartyCheckResult {
    const p = this.get(queueId).party;
    if (input.partySize < p.minPartySize) {
      return { allowed: false, reason: "too-small" };
    }
    if (input.partySize > p.maxPartySize) {
      return { allowed: false, reason: "too-large" };
    }
    if (input.includesSolo && !p.allowSoloWithParty) {
      return { allowed: false, reason: "solo-with-party-forbidden" };
    }
    if (p.maxPartyRatingSpread > 0) {
      const spread = input.maxRating - input.minRating;
      if (spread > p.maxPartyRatingSpread) {
        return { allowed: false, reason: "rating-spread-too-wide" };
      }
    }
    return { allowed: true, reason: "allowed" };
  }

  /**
   * Is a player eligible to backfill into a running game given the
   * game's elapsed seconds + their rating vs. the average?
   */
  canBackfill(
    queueId: string,
    gameElapsedSec: number,
    playerRating: number,
    averageGameRating: number,
  ): boolean {
    const q = this.get(queueId);
    if (!q.backfill.enabled) return false;
    if (gameElapsedSec > q.backfill.maxGameProgressSec) return false;
    const halfWidth = q.backfill.backfillRatingHalfWidth;
    return Math.abs(playerRating - averageGameRating) <= halfWidth;
  }

  /** Total players needed to fill one match (sides × perSide). */
  playersNeededPerMatch(queueId: string): number {
    const q = this.get(queueId);
    return q.numberOfSides * q.playersPerSide;
  }
}

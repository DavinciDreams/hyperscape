/**
 * Title registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `titles.ts`.
 * Pure logic: indexes titles, evaluates unlock conditions against
 * player state, formats display strings (prefix/suffix/replace),
 * and reports revocation / expiry status.
 *
 * Scope: rule evaluation + display composition. Caller owns
 * persistence of owned/active title sets and UI picker state.
 */

import {
  type Title,
  type TitleDisplayMode,
  type TitlesManifest,
  TitlesManifestSchema,
  type TitleUnlockCondition,
} from "@hyperforge/manifest-schema";

export class UnknownTitleError extends Error {
  readonly titleId: string;
  readonly availableIds: readonly string[];
  constructor(titleId: string, availableIds: readonly string[]) {
    super(
      `title "${titleId}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownTitleError";
    this.titleId = titleId;
    this.availableIds = availableIds;
  }
}

/**
 * Shape-only snapshot of player state needed for unlock evaluation.
 * Fields not supplied short-circuit the matching condition to `false`.
 */
export interface TitlePlayerState {
  completedAchievementIds?: Set<string>;
  completedQuestIds?: Set<string>;
  /** `{npcId: killCount}`. */
  bossKills?: Map<string, number>;
  /** `{skillId: level}`. */
  skillLevels?: Map<string, number>;
  /** Leaderboard bracket awards (array of `leaderboardId|bracketId`). */
  leaderboardBracketAwards?: Set<string>;
  /** Known GM-granted title ids (manual unlocks). */
  manualGrants?: Set<string>;
  /** Available currency for purchase-unlock checks. */
  currencyBalances?: Map<string, number>;
}

/**
 * Outcome of evaluating a title's unlock conditions against player state.
 * Unlocks are OR-semantics across conditions, so the first matching
 * condition wins + returned as `matchedConditionKind`.
 */
export interface TitleUnlockEvaluation {
  unlocked: boolean;
  matchedConditionKind?: TitleUnlockCondition["kind"];
}

/** Listener invoked after every successful `load()` / `loadFromJson()`. */
export type TitleReloadListener = () => void;

export class TitleRegistry {
  private _byId = new Map<string, Title>();
  private _reloadListeners = new Set<TitleReloadListener>();

  constructor(manifest?: TitlesManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: TitlesManifest): void {
    this._byId.clear();
    for (const t of manifest) this._byId.set(t.id, t);
    this._emitReloaded();
  }

  loadFromJson(raw: unknown): void {
    this.load(TitlesManifestSchema.parse(raw));
  }

  /**
   * Subscribe to reload notifications. Returns unsubscribe.
   * Listener throws are caught + logged. Pattern matches
   * `SkillIconsRegistry.onReloaded`.
   */
  onReloaded(cb: TitleReloadListener): () => void {
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
          "[titleRegistry] reload listener threw:",
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

  get(id: string): Title {
    const t = this._byId.get(id);
    if (!t) {
      throw new UnknownTitleError(id, Array.from(this._byId.keys()));
    }
    return t;
  }

  ids(): string[] {
    return Array.from(this._byId.keys());
  }

  /**
   * Evaluate whether a player currently qualifies for a title (OR
   * semantics across `unlockConditions`).
   */
  evaluateUnlock(
    titleId: string,
    state: TitlePlayerState,
  ): TitleUnlockEvaluation {
    const title = this.get(titleId);
    for (const c of title.unlockConditions) {
      if (this._matches(c, titleId, state)) {
        return { unlocked: true, matchedConditionKind: c.kind };
      }
    }
    return { unlocked: false };
  }

  /** Titles the player currently satisfies (subset of all titles). */
  qualifiedTitles(state: TitlePlayerState): string[] {
    const out: string[] = [];
    for (const id of this._byId.keys()) {
      if (this.evaluateUnlock(id, state).unlocked) out.push(id);
    }
    return out;
  }

  /**
   * Compose the display nameplate for `playerName` using the title's
   * `displayMode`. `displayText` is the already-localized title text
   * (caller looked up `title.displayKey` against the localization
   * manifest).
   */
  formatNameplate(
    titleId: string,
    playerName: string,
    displayText: string,
  ): string {
    const title = this.get(titleId);
    return formatByMode(title.displayMode, playerName, displayText);
  }

  /**
   * Has a grant expired given the revocation rules + grant timestamp?
   * `expireAfterDays === 0` means never-expires.
   */
  isExpired(titleId: string, grantedAtMs: number, nowMs: number): boolean {
    const r = this.get(titleId).revocation;
    if (r.expireAfterDays <= 0) return false;
    const elapsedMs = nowMs - grantedAtMs;
    return elapsedMs >= r.expireAfterDays * 24 * 60 * 60 * 1000;
  }

  private _matches(
    c: TitleUnlockCondition,
    titleId: string,
    state: TitlePlayerState,
  ): boolean {
    switch (c.kind) {
      case "achievement":
        return state.completedAchievementIds?.has(c.achievementId) ?? false;
      case "quest":
        return state.completedQuestIds?.has(c.questId) ?? false;
      case "bossKillCount": {
        const n = state.bossKills?.get(c.npcId) ?? 0;
        return n >= c.requiredKills;
      }
      case "skillLevel": {
        const l = state.skillLevels?.get(c.skillId) ?? 0;
        return l >= c.requiredLevel;
      }
      case "leaderboardBracket":
        return (
          state.leaderboardBracketAwards?.has(
            `${c.leaderboardId}|${c.bracketId}`,
          ) ?? false
        );
      case "purchase": {
        // Purchase-unlock is affordance, not ownership: caller still
        // executes the purchase. We report qualification iff the
        // player can afford it.
        const bal = state.currencyBalances?.get(c.currencyId) ?? 0;
        return bal >= c.cost;
      }
      case "manual":
        return state.manualGrants?.has(titleId) ?? false;
    }
  }
}

export function formatByMode(
  mode: TitleDisplayMode,
  playerName: string,
  displayText: string,
): string {
  switch (mode) {
    case "prefix":
      return `${displayText} ${playerName}`;
    case "suffix":
      return `${playerName} ${displayText}`;
    case "replace":
      return displayText;
  }
}

/**
 * Friends / social registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s
 * `friends-social.ts`. Pure logic: friend/ignore caps, request expiry
 * classification, online-status visibility resolution, offline-message
 * policy, note-length validation. Runtime `SocialSystem` owns actual
 * roster + request state machine + broadcast.
 */

import {
  type FriendsListRules,
  type FriendsSocialManifest,
  type IgnoreListRules,
  type OnlineStatusRules,
  type OnlineVisibilityMode,
  type RecentPlayersRules,
  FriendsSocialManifestSchema,
} from "@hyperforge/manifest-schema";

export class FriendsSocialNotLoadedError extends Error {
  constructor() {
    super("FriendsSocialRegistry used before load()");
    this.name = "FriendsSocialNotLoadedError";
  }
}

/** Reasons a friend request might be refused. */
export type FriendRequestReason =
  | "allowed"
  | "at-cap"
  | "cross-faction-forbidden"
  | "cross-realm-forbidden"
  | "ignored"
  | "self";

export interface FriendRequestInput {
  requesterFriendCount: number;
  requesterFaction: string;
  recipientFaction: string;
  requesterRealm: string;
  recipientRealm: string;
  /** Is the recipient currently ignoring the requester? */
  recipientIgnoresRequester: boolean;
  /** Is the requester sending a request to themselves? */
  isSelf: boolean;
}

export interface FriendRequestResult {
  allowed: boolean;
  reason: FriendRequestReason;
}

/** A pending request's lifecycle state. */
export type FriendRequestLifecycle = "pending" | "expired";

/** Reasons a visibility value might be replaced with something else. */
export type EffectiveVisibilityReason =
  | "player-choice"
  | "policy-forbids-invisible"
  | "default";

export interface EffectiveVisibility {
  mode: OnlineVisibilityMode;
  reason: EffectiveVisibilityReason;
}

/** Listener invoked after every successful `load()` / `loadFromJson()`. */
export type FriendsSocialReloadListener = () => void;

export class FriendsSocialRegistry {
  private _manifest: FriendsSocialManifest | null = null;
  private _reloadListeners = new Set<FriendsSocialReloadListener>();

  constructor(manifest?: FriendsSocialManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: FriendsSocialManifest): void {
    this._manifest = manifest;
    this._emitReloaded();
  }

  loadFromJson(raw: unknown): void {
    this.load(FriendsSocialManifestSchema.parse(raw));
  }

  /**
   * Subscribe to reload notifications. Returns unsubscribe.
   * Listener throws are caught + logged. Pattern matches
   * `SkillIconsRegistry.onReloaded`.
   */
  onReloaded(cb: FriendsSocialReloadListener): () => void {
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
          "[friendsSocialRegistry] reload listener threw:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  isLoaded(): boolean {
    return this._manifest !== null;
  }

  get manifest(): FriendsSocialManifest {
    if (!this._manifest) throw new FriendsSocialNotLoadedError();
    return this._manifest;
  }

  get enabled(): boolean {
    return this.manifest.enabled;
  }

  get friends(): FriendsListRules {
    return this.manifest.friends;
  }

  get ignore(): IgnoreListRules {
    return this.manifest.ignore;
  }

  get recent(): RecentPlayersRules {
    return this.manifest.recent;
  }

  get onlineStatus(): OnlineStatusRules {
    return this.manifest.onlineStatus;
  }

  /* --- friends --- */

  canAddFriend(currentFriendCount: number): boolean {
    return currentFriendCount < this.friends.maxFriends;
  }

  /** Validate a prospective friend request. */
  checkFriendRequest(input: FriendRequestInput): FriendRequestResult {
    if (input.isSelf) return { allowed: false, reason: "self" };
    if (input.recipientIgnoresRequester) {
      return { allowed: false, reason: "ignored" };
    }
    if (!this.canAddFriend(input.requesterFriendCount)) {
      return { allowed: false, reason: "at-cap" };
    }
    if (
      !this.friends.allowCrossFaction &&
      input.requesterFaction !== input.recipientFaction
    ) {
      return { allowed: false, reason: "cross-faction-forbidden" };
    }
    if (
      !this.friends.allowCrossRealm &&
      input.requesterRealm !== input.recipientRealm
    ) {
      return { allowed: false, reason: "cross-realm-forbidden" };
    }
    return { allowed: true, reason: "allowed" };
  }

  /**
   * Classify a pending friend-request by age.
   * friendRequestExpireHours=0 means never expires.
   */
  classifyRequest(ageHours: number): FriendRequestLifecycle {
    const h = this.friends.friendRequestExpireHours;
    if (h === 0) return "pending";
    return ageHours >= h ? "expired" : "pending";
  }

  /** Is a per-friend note of `length` chars within policy? */
  isNoteWithinLimit(length: number): boolean {
    return length <= this.friends.maxNoteLength;
  }

  /** Can the sender queue another offline message to this recipient? */
  canQueueOfflineMessage(queuedFromSender: number): boolean {
    const f = this.friends;
    if (!f.allowOfflineMessages) return false;
    return queuedFromSender < f.maxOfflineMessagesPerSender;
  }

  /* --- ignore --- */

  canAddIgnore(currentIgnoreCount: number): boolean {
    return currentIgnoreCount < this.ignore.maxIgnored;
  }

  /**
   * Is an ignore entry still active? Expires after `expireAfterDays`
   * (0 = permanent).
   */
  isIgnoreActive(ageDays: number): boolean {
    const d = this.ignore.expireAfterDays;
    if (d === 0) return true;
    return ageDays < d;
  }

  /* --- recent --- */

  /** Is a recent-players entry of `ageHours` within retention? */
  isRecentRetained(ageHours: number, entriesOlderThan: number): boolean {
    const r = this.recent;
    if (!r.enabled) return false;
    if (entriesOlderThan >= r.maxEntries) return false;
    if (r.retentionHours === 0) return true;
    return ageHours < r.retentionHours;
  }

  /* --- online status --- */

  /**
   * Resolve the effective visibility for a player. If the player has
   * chosen a mode and `allowPlayerOverride=true`, that wins; otherwise
   * the authored default applies. The refinement on the manifest makes
   * a default of `invisible` + no override impossible, so "default"
   * always resolves to something sane here.
   */
  effectiveVisibility(
    playerChoice: OnlineVisibilityMode | null,
  ): EffectiveVisibility {
    const s = this.onlineStatus;
    if (playerChoice && s.allowPlayerOverride) {
      return { mode: playerChoice, reason: "player-choice" };
    }
    if (playerChoice === "invisible" && !s.allowPlayerOverride) {
      return {
        mode: s.defaultVisibility,
        reason: "policy-forbids-invisible",
      };
    }
    return { mode: s.defaultVisibility, reason: "default" };
  }
}

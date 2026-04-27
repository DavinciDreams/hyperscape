/**
 * Party + guild registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `party-guild.ts`.
 * Pure logic: party size + loot/XP policy evaluation, guild rank
 * hierarchy, permission lookup, perk unlock + retrieval by guild
 * level, guild name validation, level math. Runtime party manager /
 * guild service owns actual membership state.
 */

import {
  type GuildPerk,
  type GuildPermission,
  type GuildRank,
  type GuildRules,
  type PartyGuildManifest,
  type PartyRules,
  PartyGuildManifestSchema,
} from "@hyperforge/manifest-schema";

export class PartyGuildNotLoadedError extends Error {
  constructor() {
    super("PartyGuildRegistry used before load()");
    this.name = "PartyGuildNotLoadedError";
  }
}

export class UnknownRankError extends Error {
  readonly rankId: string;
  readonly availableIds: readonly string[];
  constructor(id: string, availableIds: readonly string[]) {
    super(
      `guild rank "${id}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownRankError";
    this.rankId = id;
    this.availableIds = availableIds;
  }
}

export class UnknownPerkError extends Error {
  readonly perkId: string;
  readonly availableIds: readonly string[];
  constructor(id: string, availableIds: readonly string[]) {
    super(
      `guild perk "${id}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownPerkError";
    this.perkId = id;
    this.availableIds = availableIds;
  }
}

export type PartyJoinReason = "allowed" | "at-cap" | "disbanded";

export interface PartyJoinResult {
  allowed: boolean;
  reason: PartyJoinReason;
}

export type GuildNameReason = "allowed" | "too-short" | "too-long" | "empty";

export interface GuildNameResult {
  allowed: boolean;
  reason: GuildNameReason;
}

export interface GuildLevelResolution {
  level: number;
  xpIntoLevel: number;
  xpForNext: number;
}

/** Listener invoked after every successful `load()` / `loadFromJson()`. */
export type PartyGuildReloadListener = () => void;

export class PartyGuildRegistry {
  private _manifest: PartyGuildManifest | null = null;
  private _ranksById = new Map<string, GuildRank>();
  private _perksById = new Map<string, GuildPerk>();
  private _reloadListeners = new Set<PartyGuildReloadListener>();

  constructor(manifest?: PartyGuildManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: PartyGuildManifest): void {
    this._manifest = manifest;
    this._ranksById.clear();
    this._perksById.clear();
    for (const r of manifest.ranks) this._ranksById.set(r.id, r);
    for (const p of manifest.perks) this._perksById.set(p.id, p);
    this._emitReloaded();
  }

  loadFromJson(raw: unknown): void {
    this.load(PartyGuildManifestSchema.parse(raw));
  }

  /**
   * Subscribe to reload notifications. Returns unsubscribe.
   * Listener throws are caught + logged. Pattern matches
   * `SkillIconsRegistry.onReloaded`.
   */
  onReloaded(cb: PartyGuildReloadListener): () => void {
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
          "[partyGuildRegistry] reload listener threw:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  get manifest(): PartyGuildManifest {
    if (!this._manifest) throw new PartyGuildNotLoadedError();
    return this._manifest;
  }

  isLoaded(): boolean {
    return this._manifest !== null;
  }

  get party(): PartyRules {
    return this.manifest.party;
  }

  get guild(): GuildRules {
    return this.manifest.guild;
  }

  /* --- party --- */

  canJoinParty(currentSize: number): PartyJoinResult {
    if (currentSize >= this.party.maxMembers) {
      return { allowed: false, reason: "at-cap" };
    }
    return { allowed: true, reason: "allowed" };
  }

  /**
   * Should a kill's XP share include this member, given the
   * distance from the kill and the party's xpPolicy?
   */
  includesXpShare(policyContext: {
    tagged: boolean;
    distanceMetersFromKill: number;
  }): boolean {
    const p = this.party;
    switch (p.xpPolicy) {
      case "full-share":
      case "split":
        return true;
      case "tag-only":
        return policyContext.tagged;
      case "proximity-share":
        return policyContext.distanceMetersFromKill <= p.xpShareRangeMeters;
    }
  }

  /** Has party auto-disband elapsed? */
  shouldAutoDisband(idleMinutes: number): boolean {
    const m = this.party.idleAutoDisbandMinutes;
    if (m === 0) return false;
    return idleMinutes >= m;
  }

  /* --- guild ranks --- */

  hasRank(id: string): boolean {
    return this._ranksById.has(id);
  }

  rank(id: string): GuildRank {
    const r = this._ranksById.get(id);
    if (!r) throw new UnknownRankError(id, Array.from(this._ranksById.keys()));
    return r;
  }

  rankIds(): string[] {
    return Array.from(this._ranksById.keys());
  }

  /** Ranks sorted by order ascending (leader first). */
  ranksByOrder(): GuildRank[] {
    return Array.from(this._ranksById.values()).sort(
      (a, b) => a.order - b.order,
    );
  }

  get defaultRankId(): string {
    return this.manifest.defaultRankId;
  }

  get leaderRankId(): string {
    return this.manifest.leaderRankId;
  }

  hasPermission(rankId: string, perm: GuildPermission): boolean {
    return this.rank(rankId).permissions.includes(perm);
  }

  /** Can `promoterRankId` promote `subjectRankId` → `targetRankId`? */
  canPromote(
    promoterRankId: string,
    subjectRankId: string,
    targetRankId: string,
  ): boolean {
    if (!this.hasPermission(promoterRankId, "promote-member")) return false;
    const promoter = this.rank(promoterRankId);
    const target = this.rank(targetRankId);
    const subject = this.rank(subjectRankId);
    // target rank must be strictly higher in hierarchy than current
    // (lower `order` = higher rank), and promoter must outrank target.
    return target.order < subject.order && promoter.order < target.order;
  }

  canDemote(
    demoterRankId: string,
    subjectRankId: string,
    targetRankId: string,
  ): boolean {
    if (!this.hasPermission(demoterRankId, "demote-member")) return false;
    const demoter = this.rank(demoterRankId);
    const target = this.rank(targetRankId);
    const subject = this.rank(subjectRankId);
    return target.order > subject.order && demoter.order < subject.order;
  }

  /* --- guild perks --- */

  hasPerk(id: string): boolean {
    return this._perksById.has(id);
  }

  perk(id: string): GuildPerk {
    const p = this._perksById.get(id);
    if (!p) throw new UnknownPerkError(id, Array.from(this._perksById.keys()));
    return p;
  }

  perkIds(): string[] {
    return Array.from(this._perksById.keys());
  }

  /** All perks a guild at `level` has unlocked. */
  unlockedPerks(level: number): GuildPerk[] {
    return Array.from(this._perksById.values())
      .filter((p) => p.requiredLevel <= level)
      .sort((a, b) => a.requiredLevel - b.requiredLevel);
  }

  /* --- guild rules --- */

  /** Linear xpPerLevel progression. */
  resolveGuildLevel(totalXp: number): GuildLevelResolution {
    const g = this.guild;
    const xp = Math.max(0, Math.floor(totalXp));
    const rawLevel = Math.floor(xp / g.xpPerLevel) + 1;
    const level = Math.min(rawLevel, g.maxLevel);
    const xpIntoLevel =
      level >= g.maxLevel ? 0 : xp - (level - 1) * g.xpPerLevel;
    const xpForNext = level >= g.maxLevel ? 0 : g.xpPerLevel;
    return { level, xpIntoLevel, xpForNext };
  }

  validateGuildName(name: string): GuildNameResult {
    const trimmed = name.trim();
    if (trimmed.length === 0) return { allowed: false, reason: "empty" };
    const g = this.guild;
    if (trimmed.length < g.minNameLength) {
      return { allowed: false, reason: "too-short" };
    }
    if (trimmed.length > g.maxNameLength) {
      return { allowed: false, reason: "too-long" };
    }
    return { allowed: true, reason: "allowed" };
  }

  /** Is the guild under its member cap? */
  canAcceptMember(currentMemberCount: number): boolean {
    return currentMemberCount < this.guild.maxMembers;
  }

  /** Is adding an alliance still under policy? */
  canAddAlly(currentAllyCount: number): boolean {
    const g = this.guild;
    if (!g.alliancesEnabled) return false;
    if (g.maxAllies === 0) return true;
    return currentAllyCount < g.maxAllies;
  }
}

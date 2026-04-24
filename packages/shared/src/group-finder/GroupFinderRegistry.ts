/**
 * Group-finder registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `group-finder.ts`.
 * Pure logic: content lookup (by id / kind / policy), queue-eligibility
 * gate, role-slot sum check, effective level/gear gate after widening,
 * deserter cooldown evaluation. Runtime `GroupFinderSystem` owns actual
 * queue state + matchmaker.
 */

import {
  type GroupFinderContent,
  type GroupFinderContentKind,
  type GroupFinderManifest,
  type GroupFinderMatchmakingRules,
  type GroupFinderQueuePolicy,
  type GroupFinderRewardsPolicy,
  type GroupFinderRole,
  type GroupFinderRoleRequirement,
  GroupFinderManifestSchema,
} from "@hyperforge/manifest-schema";

export class GroupFinderNotLoadedError extends Error {
  constructor() {
    super("GroupFinderRegistry used before load()");
    this.name = "GroupFinderNotLoadedError";
  }
}

export class UnknownGroupFinderContentError extends Error {
  readonly contentId: string;
  readonly availableIds: readonly string[];
  constructor(id: string, availableIds: readonly string[]) {
    super(
      `group-finder content "${id}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownGroupFinderContentError";
    this.contentId = id;
    this.availableIds = availableIds;
  }
}

export type QueueEligibilityReason =
  | "allowed"
  | "below-level"
  | "above-level"
  | "below-gear-score"
  | "below-rating"
  | "disabled";

export interface QueueEligibilityInput {
  characterLevel: number;
  gearScore: number;
  rating: number;
  /** Queue waiting time, used for widening. */
  queuedMinutes: number;
}

export interface QueueEligibilityResult {
  allowed: boolean;
  reason: QueueEligibilityReason;
}

export class GroupFinderRegistry {
  private _manifest: GroupFinderManifest | null = null;
  private _byId = new Map<string, GroupFinderContent>();

  constructor(manifest?: GroupFinderManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: GroupFinderManifest): void {
    this._manifest = manifest;
    this._byId.clear();
    for (const c of manifest.content) this._byId.set(c.id, c);
  }

  loadFromJson(raw: unknown): void {
    this.load(GroupFinderManifestSchema.parse(raw));
  }

  isLoaded(): boolean {
    return this._manifest !== null;
  }

  get manifest(): GroupFinderManifest {
    if (!this._manifest) throw new GroupFinderNotLoadedError();
    return this._manifest;
  }

  get enabled(): boolean {
    return this.manifest.enabled;
  }

  get matchmaking(): GroupFinderMatchmakingRules {
    return this.manifest.matchmaking;
  }

  get rewards(): GroupFinderRewardsPolicy {
    return this.manifest.rewards;
  }

  /* --- content --- */

  has(id: string): boolean {
    return this._byId.has(id);
  }

  get(id: string): GroupFinderContent {
    const c = this._byId.get(id);
    if (!c) {
      throw new UnknownGroupFinderContentError(
        id,
        Array.from(this._byId.keys()),
      );
    }
    return c;
  }

  ids(): string[] {
    return Array.from(this._byId.keys());
  }

  byKind(kind: GroupFinderContentKind): GroupFinderContent[] {
    return Array.from(this._byId.values()).filter((c) => c.kind === kind);
  }

  byQueuePolicy(policy: GroupFinderQueuePolicy): GroupFinderContent[] {
    return Array.from(this._byId.values()).filter(
      (c) => c.queuePolicy === policy,
    );
  }

  /** Role requirement for a content and role, 0 if not required. */
  roleCount(contentId: string, role: GroupFinderRole): number {
    const content = this.get(contentId);
    const req = content.roleRequirements.find((r) => r.role === role);
    return req ? req.count : 0;
  }

  /** Total players expected across role requirements (0 = role-agnostic). */
  totalRoleSlots(contentId: string): number {
    const content = this.get(contentId);
    return content.roleRequirements.reduce(
      (acc, r: GroupFinderRoleRequirement) => acc + r.count,
      0,
    );
  }

  /* --- eligibility --- */

  /**
   * Is the player eligible for this content, respecting widening
   * after `wideningAfterMinutes`? Widening halves the min gear gate
   * and removes the min-level gate when active.
   */
  checkEligibility(
    contentId: string,
    input: QueueEligibilityInput,
  ): QueueEligibilityResult {
    if (!this.enabled) return { allowed: false, reason: "disabled" };
    const content = this.get(contentId);
    const m = this.matchmaking;
    const widened =
      m.wideningAfterMinutes > 0 &&
      input.queuedMinutes >= m.wideningAfterMinutes;

    const effectiveMinLevel = widened ? 1 : content.minLevel;
    const effectiveMinGear = widened
      ? Math.floor(content.minGearScore / 2)
      : content.minGearScore;

    if (input.characterLevel < effectiveMinLevel) {
      return { allowed: false, reason: "below-level" };
    }
    if (input.characterLevel > content.maxLevel) {
      return { allowed: false, reason: "above-level" };
    }
    if (effectiveMinGear > 0 && input.gearScore < effectiveMinGear) {
      return { allowed: false, reason: "below-gear-score" };
    }
    if (
      content.queuePolicy === "ranked" &&
      content.minRating > 0 &&
      input.rating < content.minRating
    ) {
      return { allowed: false, reason: "below-rating" };
    }
    return { allowed: true, reason: "allowed" };
  }

  /* --- matchmaking helpers --- */

  /** Has the queue wait exceeded the timeout? */
  isQueueExpired(waitedSec: number): boolean {
    return waitedSec >= this.matchmaking.queueTimeoutSec;
  }

  /** Has the ready-check window closed? */
  isReadyCheckExpired(openedSec: number): boolean {
    return openedSec >= this.matchmaking.readyCheckTimeoutSec;
  }

  /** Is a player still under deserter penalty? */
  isDeserterOnCooldown(secondsSinceDesert: number): boolean {
    const m = this.matchmaking;
    if (!m.applyDeserterPenalty) return false;
    if (m.deserterCooldownSec === 0) return false;
    return secondsSinceDesert < m.deserterCooldownSec;
  }
}

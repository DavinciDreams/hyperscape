/**
 * Combat-tuning registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `combat-tuning.ts`.
 * Indexes a validated `CombatTuningManifest` by profile id and exposes
 * resolution helpers. `DuelOrchestrator` resolves a profile id from the
 * duel rules, then hands the resolved profile to `DuelCombatAI` (the
 * ticker code) as its tuning source of truth.
 *
 * Scope: pure data plumbing. Registry has no dependency on
 * EmbeddedHyperiaService, DuelCombatAI, entity state, or the ECS — so
 * it can be imported + unit-tested in isolation from the server.
 *
 * Adapter: `profileToDuelCombatConfig` converts a manifest profile into
 * the legacy `DuelCombatConfig` shape `DuelCombatAI` already consumes,
 * letting the runtime code migrate without changing its own public
 * API. The adapter lives here rather than in server code so both the
 * editor preview and the runtime share the same mapping.
 */

import {
  type CombatTuningManifest,
  CombatTuningManifestSchema,
  type CombatTuningProfile,
  type CombatRole,
  type EngagementRange,
} from "@hyperforge/manifest-schema";

/**
 * HP-phase classification matching the semantics used by
 * `DuelCombatAI`. `opening` is owned by the tick-count side of the
 * caller (first N ticks); this module only classifies HP-driven
 * phases.
 */
export type CombatPhase = "opening" | "trading" | "finishing" | "desperate";

function validatePct(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new TypeError(
      `${name} must be a finite percent in [0, 100] (got ${String(value)})`,
    );
  }
}

/**
 * Shape the combat AI actually consumes at tick time. Matches the legacy
 * `DuelCombatConfig` field-for-field (minus arena-provisioning knobs
 * like `movementClampBounds` / `initialStrafeSign` which are supplied
 * by `DuelOrchestrator` per-match, not by tuning).
 */
export interface ResolvedCombatTuning {
  /** Tick interval in milliseconds. */
  tickMs: number;
  combatRole: CombatRole;
  /** Heal below this HP percentage (0..100). */
  healThresholdPct: number;
  /** Switch to aggressive style above this HP percentage. */
  aggressiveThresholdPct: number;
  /** Enter desperate phase below this HP percentage. */
  defensiveThresholdPct: number;
  /** Offensive prayer id for the current combat role. */
  offensivePrayerId: string;
  /** Defensive prayer id (activated every tick no-op-if-active). */
  defensivePrayerId: string;
  /** Engagement range for the current combat role. */
  engagementRange: EngagementRange;
  /** Minimum ms between movement decisions. */
  moveCooldownMs: number;
  /** Lateral strafe step in world units. */
  strafeStep: number;
  /** Skip food use (no-food duel variants). */
  noFood: boolean;
  /** Opt in LLM-driven tactics replanning. */
  useLlmTactics: boolean;
}

/**
 * Resolve a manifest profile + the agent's active combat role into the
 * flat shape the tick loop reads. Keeps per-role fields (engagement
 * range, offensive prayer) collapsed to the single role the agent is
 * actually using.
 */
export function profileToResolvedTuning(
  profile: CombatTuningProfile,
  combatRole: CombatRole,
): ResolvedCombatTuning {
  return {
    tickMs: profile.tickMs,
    combatRole,
    healThresholdPct: profile.hpThresholdsPct.heal,
    aggressiveThresholdPct: profile.hpThresholdsPct.aggressive,
    defensiveThresholdPct: profile.hpThresholdsPct.defensive,
    offensivePrayerId: profile.offensivePrayers[combatRole],
    defensivePrayerId: profile.defensivePrayer,
    engagementRange: profile.engagementRanges[combatRole],
    moveCooldownMs: profile.movement.moveCooldownMs,
    strafeStep: profile.movement.strafeStep,
    noFood: profile.noFood,
    useLlmTactics: profile.useLlmTactics,
  };
}

/**
 * Error thrown when `resolve()` is asked for a profile id that isn't
 * in the manifest. Callers should catch + fall back to a known default.
 */
export class UnknownCombatTuningProfileError extends Error {
  readonly profileId: string;
  readonly availableIds: readonly string[];
  constructor(profileId: string, availableIds: readonly string[]) {
    super(
      `combat tuning profile "${profileId}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownCombatTuningProfileError";
    this.profileId = profileId;
    this.availableIds = availableIds;
  }
}

/**
 * Indexed combat-tuning profiles. Built from a validated manifest (the
 * schema enforces unique ids so lookup is unambiguous). Replaceable at
 * runtime via `load()` to support hot-reload from the editor — callers
 * holding a reference to a previously-resolved profile keep their
 * snapshot, so in-flight duels don't observe mid-fight tuning changes.
 */
export class CombatTuningRegistry {
  private profilesById = new Map<string, CombatTuningProfile>();

  /** Empty registry. Call `load()` before `resolve()`. */
  constructor(manifest?: CombatTuningManifest) {
    if (manifest !== undefined) this.load(manifest);
  }

  /**
   * Replace registry contents with a validated manifest. Pass raw JSON
   * through `loadFromJson` instead if you need validation.
   */
  load(manifest: CombatTuningManifest): void {
    this.profilesById.clear();
    for (const profile of manifest) {
      this.profilesById.set(profile.id, profile);
    }
  }

  /**
   * Validate-and-load from untrusted JSON (e.g. a file read). Throws
   * the underlying Zod error on malformed input — callers should
   * surface that to the editor UI.
   */
  loadFromJson(raw: unknown): void {
    const parsed = CombatTuningManifestSchema.parse(raw);
    this.load(parsed);
  }

  /** Profile ids currently loaded. Stable across calls. */
  get profileIds(): readonly string[] {
    return Array.from(this.profilesById.keys());
  }

  /** How many profiles are indexed. */
  get size(): number {
    return this.profilesById.size;
  }

  /** True if a profile with this id is loaded. */
  has(profileId: string): boolean {
    return this.profilesById.has(profileId);
  }

  /**
   * Look up by id. Returns `undefined` on miss — use this when
   * callers want to compose their own fallback. Prefer `resolve`
   * for the throw-on-miss case.
   */
  get(profileId: string): CombatTuningProfile | undefined {
    return this.profilesById.get(profileId);
  }

  /**
   * Look up by id and collapse into a `ResolvedCombatTuning` for the
   * given role. Throws `UnknownCombatTuningProfileError` if the id
   * isn't loaded.
   */
  resolve(profileId: string, role: CombatRole): ResolvedCombatTuning {
    const profile = this.profilesById.get(profileId);
    if (profile === undefined) {
      throw new UnknownCombatTuningProfileError(profileId, this.profileIds);
    }
    return profileToResolvedTuning(profile, role);
  }

  /**
   * Resolve with a fallback profile id — returns fallback tuning if
   * the primary id isn't found. Fallback itself must be loaded or
   * this still throws. Useful for duel orchestrator defaults.
   */
  resolveWithFallback(
    profileId: string,
    fallbackProfileId: string,
    role: CombatRole,
  ): ResolvedCombatTuning {
    const profile =
      this.profilesById.get(profileId) ??
      this.profilesById.get(fallbackProfileId);
    if (profile === undefined) {
      throw new UnknownCombatTuningProfileError(
        fallbackProfileId,
        this.profileIds,
      );
    }
    return profileToResolvedTuning(profile, role);
  }

  /**
   * Throwing variant of `get(profileId)` for callers that treat a
   * miss as a programmer error rather than a control-flow branch.
   * Mirrors the pre-merge `combat-tuning/` registry semantics.
   */
  require(profileId: string): CombatTuningProfile {
    const profile = this.profilesById.get(profileId);
    if (profile === undefined) {
      throw new UnknownCombatTuningProfileError(profileId, this.profileIds);
    }
    return profile;
  }

  /** Engagement window for `role` on a given profile. */
  engagementRangeFor(
    profile: CombatTuningProfile,
    role: CombatRole,
  ): EngagementRange {
    return profile.engagementRanges[role];
  }

  /** Offensive prayer id for `role` on a given profile. */
  offensivePrayerFor(profile: CombatTuningProfile, role: CombatRole): string {
    return profile.offensivePrayers[role];
  }

  /**
   * Classify the fight phase from HP percents (both in [0, 100]).
   *
   *   - `desperate`: own HP below profile's `defensive` threshold
   *   - `finishing`: opponent HP < 25%
   *   - `trading`: default
   *
   * `opening` (first-N-ticks semantics) is the caller's concern — this
   * method only expresses HP-driven transitions.
   */
  classifyHpPhase(
    profile: CombatTuningProfile,
    ownHpPct: number,
    opponentHpPct: number,
  ): CombatPhase {
    validatePct("ownHpPct", ownHpPct);
    validatePct("opponentHpPct", opponentHpPct);
    if (ownHpPct < profile.hpThresholdsPct.defensive) return "desperate";
    if (opponentHpPct < 25) return "finishing";
    return "trading";
  }

  /**
   * Should the caller attempt a heal at this HP%? Honors the
   * profile's `noFood` rule (always false) and the `heal` threshold.
   */
  shouldHeal(profile: CombatTuningProfile, ownHpPct: number): boolean {
    if (profile.noFood) return false;
    validatePct("ownHpPct", ownHpPct);
    return ownHpPct < profile.hpThresholdsPct.heal;
  }
}

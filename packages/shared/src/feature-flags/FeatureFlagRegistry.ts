/**
 * Feature flag registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s
 * `feature-flags.ts`. Evaluates `evaluate(flagId, principal)`:
 * returns `boolean | string` for the requesting player according
 * to authored rules, mutex groups, and manifest-level enable.
 *
 * Implementation is pure logic — the hash function is a stable
 * 32-bit FNV-1a of `(flagId + '|' + accountId)` so the same
 * player+flag always lands in the same rollout bucket, but two
 * different flags on the same player get different buckets
 * (avoiding correlated rollouts).
 *
 * Scope: pure logic. No remote-config bridge, no admin override
 * layer, no analytics bus — those belong one level up.
 */

import {
  type FeatureFlag,
  type FeatureFlagsManifest,
  FeatureFlagsManifestSchema,
  type MutexGroup,
  type Platform,
  type TargetingRule,
} from "@hyperforge/manifest-schema";

/**
 * Inputs describing the player being evaluated. All fields are
 * optional — unspecified fields are treated as wildcards on rule
 * criteria that require them.
 */
export interface EvaluationPrincipal {
  accountId: string;
  /** Days since account creation. */
  accountAgeDays?: number;
  /** Highest character level on this account. */
  characterLevel?: number;
  platform?: Platform;
  /** Region code / locale prefix (e.g. "en", "en-US"). */
  regionCode?: string;
}

export class UnknownFlagError extends Error {
  readonly flagId: string;
  readonly availableIds: readonly string[];
  constructor(flagId: string, availableIds: readonly string[]) {
    super(
      `feature flag "${flagId}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownFlagError";
    this.flagId = flagId;
    this.availableIds = availableIds;
  }
}

/** Listener invoked after every successful `load()` / `loadFromJson()`. */
export type FeatureFlagReloadListener = () => void;

export class FeatureFlagRegistry {
  private _manifest: FeatureFlagsManifest | null = null;
  private _flagsById = new Map<string, FeatureFlag>();
  private _rulesById = new Map<string, TargetingRule>();
  private _mutexByFlag = new Map<string, MutexGroup>();
  private _reloadListeners = new Set<FeatureFlagReloadListener>();

  constructor(manifest?: FeatureFlagsManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: FeatureFlagsManifest): void {
    this._manifest = manifest;
    this._flagsById.clear();
    this._rulesById.clear();
    this._mutexByFlag.clear();
    for (const f of manifest.flags) this._flagsById.set(f.id, f);
    for (const r of manifest.rules) this._rulesById.set(r.id, r);
    for (const g of manifest.mutexGroups) {
      for (const fid of g.flagIds) this._mutexByFlag.set(fid, g);
    }
    this._emitReloaded();
  }

  loadFromJson(raw: unknown): void {
    this.load(FeatureFlagsManifestSchema.parse(raw));
  }

  /**
   * Subscribe to reload notifications. Returns unsubscribe.
   * Listener throws are caught + logged. Pattern matches
   * `SkillIconsRegistry.onReloaded`.
   */
  onReloaded(cb: FeatureFlagReloadListener): () => void {
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
          "[featureFlagRegistry] reload listener threw:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  isLoaded(): boolean {
    return this._manifest !== null;
  }

  get size(): number {
    return this._flagsById.size;
  }

  has(flagId: string): boolean {
    return this._flagsById.has(flagId);
  }

  get(flagId: string): FeatureFlag {
    const f = this._flagsById.get(flagId);
    if (!f) {
      throw new UnknownFlagError(flagId, Array.from(this._flagsById.keys()));
    }
    return f;
  }

  /**
   * Resolve the effective value for `flagId` against the supplied
   * principal. Returns `boolean` for boolean flags, `string` for
   * variant flags.
   *
   * Short-circuits:
   *   - manifest.enabled=false → default
   *   - flag.enabled=false → default
   *   - mutex group: first winning sibling locks all others to
   *     their defaults.
   */
  evaluate(flagId: string, principal: EvaluationPrincipal): boolean | string {
    const manifest = this._manifest;
    if (!manifest) {
      throw new UnknownFlagError(flagId, []);
    }
    const flag = this.get(flagId);
    const defaultValue =
      flag.body.kind === "boolean"
        ? flag.body.defaultValue
        : flag.body.defaultVariantValue;

    if (!manifest.enabled || !flag.enabled) return defaultValue;

    // Mutex enforcement: flags in a group are prioritized by their
    // position in `flagIds`. The first flag (in that order) that would
    // otherwise be enabled wins; later siblings collapse to default.
    const group = this._mutexByFlag.get(flag.id);
    if (group) {
      const idx = group.flagIds.indexOf(flag.id);
      for (let i = 0; i < idx; i++) {
        const sibling = this._flagsById.get(group.flagIds[i]);
        if (!sibling) continue;
        if (this._evaluateCore(sibling, principal, /*ignoreMutex*/ true)) {
          return defaultValue;
        }
      }
    }
    return this._evaluateCore(flag, principal, false);
  }

  private _evaluateCore(
    flag: FeatureFlag,
    principal: EvaluationPrincipal,
    _ignoreMutex: boolean,
  ): boolean | string {
    if (flag.body.kind === "boolean") {
      const body = flag.body;
      for (const ruleId of body.enabledForRuleIds) {
        const rule = this._rulesById.get(ruleId);
        if (rule && this._ruleMatches(rule, flag.id, principal)) {
          return body.enabledValue;
        }
      }
      return body.defaultValue;
    }
    // Variant — first matching assignment wins.
    const body = flag.body;
    for (const a of body.assignments) {
      const rule = this._rulesById.get(a.ruleId);
      if (rule && this._ruleMatches(rule, flag.id, principal)) {
        return a.variantValue;
      }
    }
    return body.defaultVariantValue;
  }

  private _ruleMatches(
    rule: TargetingRule,
    flagId: string,
    principal: EvaluationPrincipal,
  ): boolean {
    if (rule.blockAccountIds.includes(principal.accountId)) return false;
    if (rule.allowAccountIds.includes(principal.accountId)) return true;

    if (rule.minAccountAgeDays > 0) {
      if ((principal.accountAgeDays ?? 0) < rule.minAccountAgeDays) {
        return false;
      }
    }
    if (rule.minCharacterLevel > 0) {
      if ((principal.characterLevel ?? 0) < rule.minCharacterLevel) {
        return false;
      }
    }
    if (rule.platforms.length > 0) {
      if (!principal.platform) return false;
      if (!rule.platforms.includes(principal.platform)) return false;
    }
    if (rule.regionPrefixes.length > 0) {
      if (!principal.regionCode) return false;
      if (
        !rule.regionPrefixes.some((p) => principal.regionCode!.startsWith(p))
      ) {
        return false;
      }
    }
    if (rule.rolloutPercent < 100) {
      const bucket = hashBucket(`${flagId}|${principal.accountId}`);
      if (bucket >= rule.rolloutPercent) return false;
    }
    return true;
  }
}

/** FNV-1a 32-bit → percent bucket [0,100). Stable across runs. */
export function hashBucket(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h % 100;
}

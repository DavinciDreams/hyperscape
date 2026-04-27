/**
 * Pet / companion registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s
 * `pet-companion.ts`. Pure logic: stat scaling, progression math,
 * ability-priority ordering, and summon-rule gates. Runtime
 * `PetSystem` owns actual entity instances, follow AI, and xp ticking.
 */

import {
  type Pet,
  type PetAbility,
  type PetCategory,
  type PetCompanionManifest,
  PetCompanionManifestSchema,
} from "@hyperforge/manifest-schema";

export class UnknownPetError extends Error {
  readonly petId: string;
  readonly availableIds: readonly string[];
  constructor(id: string, availableIds: readonly string[]) {
    super(
      `pet "${id}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownPetError";
    this.petId = id;
    this.availableIds = availableIds;
  }
}

export interface PetSummonContext {
  inCombat: boolean;
  inSafeZone: boolean;
  mounted: boolean;
  /** Active summons already out for this pet id. */
  currentActiveCount: number;
  /** Seconds since the last summon (Infinity = never). */
  secondsSinceLastSummon: number;
}

export type CanSummonPetReason =
  | "allowed"
  | "in-combat"
  | "safe-zone-forbidden"
  | "mounted-forbidden"
  | "max-active"
  | "cooldown";

export interface CanSummonPetResult {
  allowed: boolean;
  reason: CanSummonPetReason;
}

/** Derived combat stats including owner scaling + level growth. */
export interface EffectivePetStats {
  maxHealth: number;
  attack: number;
  defense: number;
  moveSpeed: number;
}

export interface OwnerScalingInput {
  ownerAttack: number;
  ownerDefense: number;
  /** 0 if progression disabled; clamped to `progression.maxLevel`. */
  level: number;
}

/** Listener invoked after every successful `load()` / `loadFromJson()`. */
export type PetReloadListener = () => void;

export class PetRegistry {
  private _byId = new Map<string, Pet>();
  private _reloadListeners = new Set<PetReloadListener>();

  constructor(manifest?: PetCompanionManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: PetCompanionManifest): void {
    this._byId.clear();
    for (const p of manifest) this._byId.set(p.id, p);
    this._emitReloaded();
  }

  loadFromJson(raw: unknown): void {
    this.load(PetCompanionManifestSchema.parse(raw));
  }

  /**
   * Subscribe to reload notifications. Returns unsubscribe.
   * Listener throws are caught + logged. Pattern matches
   * `SkillIconsRegistry.onReloaded`.
   */
  onReloaded(cb: PetReloadListener): () => void {
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
          "[petRegistry] reload listener threw:",
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

  get(id: string): Pet {
    const p = this._byId.get(id);
    if (!p) {
      throw new UnknownPetError(id, Array.from(this._byId.keys()));
    }
    return p;
  }

  ids(): string[] {
    return Array.from(this._byId.keys());
  }

  byCategory(category: PetCategory): Pet[] {
    return Array.from(this._byId.values()).filter(
      (p) => p.category === category,
    );
  }

  canSummon(petId: string, ctx: PetSummonContext): CanSummonPetResult {
    const p = this.get(petId);
    const rules = p.summonRules;
    if (ctx.inCombat && !rules.allowInCombat) {
      return { allowed: false, reason: "in-combat" };
    }
    if (ctx.inSafeZone && !rules.allowInSafeZones) {
      return { allowed: false, reason: "safe-zone-forbidden" };
    }
    if (ctx.mounted && !rules.allowWhileMounted) {
      return { allowed: false, reason: "mounted-forbidden" };
    }
    if (ctx.currentActiveCount >= rules.maxActive) {
      return { allowed: false, reason: "max-active" };
    }
    if (ctx.secondsSinceLastSummon < rules.summonCooldownSec) {
      return { allowed: false, reason: "cooldown" };
    }
    return { allowed: true, reason: "allowed" };
  }

  /**
   * Derive the pet's effective combat stats given owner stats + level.
   * Non-combat pets still get a result (all stat math still applies)
   * but callers are expected to skip for cosmetic/utility pets.
   */
  effectiveStats(petId: string, owner: OwnerScalingInput): EffectivePetStats {
    const p = this.get(petId);
    const base = p.stats;
    const level = p.progression.enabled
      ? clamp(owner.level, 0, p.progression.maxLevel)
      : 0;
    // level-1 boundary: lvl 1 = no growth; lvl 2 = 1x growth; etc.
    const growthMul =
      1 + p.progression.statGrowthPerLevel * Math.max(0, level - 1);
    const scaling = base.ownerStatScaling;
    return {
      maxHealth: Math.round(base.maxHealth * growthMul),
      attack: Math.round(
        base.baseAttack * growthMul + owner.ownerAttack * scaling,
      ),
      defense: Math.round(
        base.baseDefense * growthMul + owner.ownerDefense * scaling,
      ),
      moveSpeed: base.moveSpeed,
    };
  }

  /**
   * Walk the pet's XP curve to the given total xp, returning the
   * derived level + leftover xp. Flat `xpPerLevel` model.
   */
  resolveLevel(
    petId: string,
    totalXp: number,
  ): { level: number; xpIntoNext: number; xpForNext: number } {
    const p = this.get(petId);
    if (!p.progression.enabled) {
      return { level: 0, xpIntoNext: 0, xpForNext: 0 };
    }
    const xpPerLevel = p.progression.xpPerLevel;
    const maxLevel = p.progression.maxLevel;
    const rawLevel = Math.floor(totalXp / xpPerLevel) + 1;
    if (rawLevel >= maxLevel) {
      return { level: maxLevel, xpIntoNext: 0, xpForNext: 0 };
    }
    const xpIntoNext = totalXp - (rawLevel - 1) * xpPerLevel;
    return { level: rawLevel, xpIntoNext, xpForNext: xpPerLevel };
  }

  /**
   * Rank the pet's abilities by priority (descending). Ties preserve
   * manifest order (stable sort). Cosmetic pets always return [].
   */
  prioritizedAbilities(petId: string): readonly PetAbility[] {
    const p = this.get(petId);
    if (p.category === "cosmetic") return [];
    return [...p.abilities].sort((a, b) => b.priority - a.priority);
  }
}

function clamp(v: number, lo: number, hi: number): number {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

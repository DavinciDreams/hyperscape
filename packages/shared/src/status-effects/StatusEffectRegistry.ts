/**
 * Status-effect registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s
 * `status-effects.ts`. Indexes authored effects by id + tag, and
 * provides pure resolvers for:
 *
 *   - `applyStack(existing, def, now)` — given the existing
 *     instances of this effect on a target and the effect
 *     definition, returns the new instance list after one fresh
 *     application. Encodes all four stacking rules.
 *   - `tickInstance(def, inst, dtSec, now)` — advance an instance's
 *     internal clock, return accumulated damage/heal + whether it
 *     just expired. Caller owns the target's HP bookkeeping.
 *   - `cleanse(existing, filter)` — remove every instance matching
 *     a tag-based or category-based filter (respecting the
 *     effect's `undispellable` flag).
 *
 * Scope: pure logic. Does not touch ECS, VFX, or networking.
 */

import {
  type StatusEffect,
  type StatusEffectCategory,
  type StatusEffectsManifest,
  StatusEffectsManifestSchema,
} from "@hyperforge/manifest-schema";

/**
 * Live instance of a status effect on a target. Created by
 * `applyStack`, mutated in place by `tickInstance`.
 */
export interface StatusEffectInstance {
  /** Effect id this instance is an application of. */
  effectId: string;
  /** Absolute world time (seconds) when this instance was applied. */
  appliedAt: number;
  /** Absolute world time at which the instance will expire. */
  expiresAt: number;
  /** Time of the next scheduled tick (set to `appliedAt + tickIntervalSec` on apply). */
  nextTickAt: number;
  /** Stack count (≥1). Only meaningful for `stack-count` rule. */
  stacks: number;
}

export interface StatusEffectTickResult {
  damageDealt: number;
  healingDealt: number;
  expired: boolean;
}

export type CleanseFilter =
  | { kind: "byTag"; tag: string }
  | { kind: "byCategory"; category: StatusEffectCategory };

export class UnknownStatusEffectError extends Error {
  readonly effectId: string;
  readonly availableIds: readonly string[];
  constructor(effectId: string, availableIds: readonly string[]) {
    super(
      `status effect "${effectId}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownStatusEffectError";
    this.effectId = effectId;
    this.availableIds = availableIds;
  }
}

/** Listener invoked after every successful `load()` / `loadFromJson()`. */
export type StatusEffectReloadListener = () => void;

export class StatusEffectRegistry {
  private _byId = new Map<string, StatusEffect>();
  private _byTag = new Map<string, StatusEffect[]>();
  private _reloadListeners = new Set<StatusEffectReloadListener>();

  constructor(manifest?: StatusEffectsManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: StatusEffectsManifest): void {
    this._byId.clear();
    this._byTag.clear();
    for (const e of manifest) {
      this._byId.set(e.id, e);
      for (const t of e.tags) {
        const arr = this._byTag.get(t) ?? [];
        arr.push(e);
        this._byTag.set(t, arr);
      }
    }
    this._emitReloaded();
  }

  loadFromJson(raw: unknown): void {
    this.load(StatusEffectsManifestSchema.parse(raw));
  }

  /**
   * Subscribe to reload notifications. Returns unsubscribe.
   * Listener throws are caught + logged. Pattern matches
   * `SkillIconsRegistry.onReloaded`.
   */
  onReloaded(cb: StatusEffectReloadListener): () => void {
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
          "[statusEffectRegistry] reload listener threw:",
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

  get ids(): readonly string[] {
    return Array.from(this._byId.keys());
  }

  has(id: string): boolean {
    return this._byId.has(id);
  }

  get(id: string): StatusEffect {
    const e = this._byId.get(id);
    if (!e) {
      throw new UnknownStatusEffectError(id, Array.from(this._byId.keys()));
    }
    return e;
  }

  /** Effects carrying the given gameplay tag. */
  byTag(tag: string): readonly StatusEffect[] {
    return this._byTag.get(tag) ?? [];
  }

  /**
   * Apply a fresh instance. `existing` is the caller's current
   * list of instances of THIS effect on the target (not all
   * effects). Returns the new list — does not mutate the input.
   */
  applyStack(
    existing: readonly StatusEffectInstance[],
    def: StatusEffect,
    now: number,
  ): readonly StatusEffectInstance[] {
    if (!Number.isFinite(now)) {
      throw new TypeError(`now must be finite (got ${String(now)})`);
    }
    const fresh: StatusEffectInstance = {
      effectId: def.id,
      appliedAt: now,
      expiresAt: now + def.durationSec,
      nextTickAt:
        def.tickIntervalSec > 0
          ? now + def.tickIntervalSec
          : Number.POSITIVE_INFINITY,
      stacks: 1,
    };
    switch (def.stackRule) {
      case "refresh":
        return [fresh];
      case "reject":
        return existing.length > 0 ? existing.slice() : [fresh];
      case "independent":
        return [...existing, fresh];
      case "stack-count": {
        if (existing.length === 0) return [fresh];
        // Keep a single consolidated instance with the longer expiry
        // and incremented stacks (capped at maxStacks).
        const head = existing[0];
        const merged: StatusEffectInstance = {
          effectId: def.id,
          appliedAt: now,
          expiresAt: Math.max(head.expiresAt, fresh.expiresAt),
          nextTickAt: head.nextTickAt,
          stacks: Math.min(def.maxStacks, head.stacks + 1),
        };
        return [merged];
      }
    }
  }

  /**
   * Advance `inst` by `dtSec`. Mutates `inst.nextTickAt` in place
   * when a tick fires. Returns accumulated damage/heal delta for
   * the window and whether the instance just expired (by `now`).
   *
   * Damage/heal scale by `stacks` — `stack-count` effects hit
   * harder per tick.
   */
  tickInstance(
    def: StatusEffect,
    inst: StatusEffectInstance,
    now: number,
  ): StatusEffectTickResult {
    if (!Number.isFinite(now)) {
      throw new TypeError(`now must be finite (got ${String(now)})`);
    }
    let damageDealt = 0;
    let healingDealt = 0;
    if (def.tickIntervalSec > 0) {
      while (inst.nextTickAt <= now && inst.nextTickAt <= inst.expiresAt) {
        damageDealt += def.perTickDamage * inst.stacks;
        healingDealt += def.perTickHeal * inst.stacks;
        inst.nextTickAt += def.tickIntervalSec;
      }
    }
    return {
      damageDealt,
      healingDealt,
      expired: now >= inst.expiresAt,
    };
  }

  /**
   * Remove instances whose effect matches `filter`. Respects
   * `undispellable` — those instances are kept regardless.
   * Returns the filtered list; does not mutate the input.
   */
  cleanse(
    instances: readonly StatusEffectInstance[],
    filter: CleanseFilter,
  ): readonly StatusEffectInstance[] {
    return instances.filter((inst) => {
      const def = this._byId.get(inst.effectId);
      if (!def) return true; // unknown effect: preserve
      if (def.undispellable) return true;
      if (filter.kind === "byTag") {
        return !def.tags.includes(filter.tag);
      }
      return def.category !== filter.category;
    });
  }
}

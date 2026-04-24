/**
 * Mount registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `mounts.ts`.
 * Pure logic: given an authored mount catalog, resolves speed/stamina
 * math + summon-rule gates. Does NOT own runtime mount-controller
 * physics, network replication, or per-player mount-state storage —
 * that is the separate `MountSystem` follow-up.
 */

import {
  type Mount,
  type MountCategory,
  type MountLocomotion,
  type MountsManifest,
  MountsManifestSchema,
} from "@hyperforge/manifest-schema";

export class UnknownMountError extends Error {
  readonly mountId: string;
  readonly availableIds: readonly string[];
  constructor(id: string, availableIds: readonly string[]) {
    super(
      `mount "${id}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownMountError";
    this.mountId = id;
    this.availableIds = availableIds;
  }
}

/** Caller-supplied world/player context used by `canSummon`. */
export interface MountSummonContext {
  inCombat: boolean;
  inSafeZone: boolean;
  indoors: boolean;
  underwater: boolean;
  ridingLevel: number;
  /** Seconds since the last summon by this player (Infinity = never). */
  secondsSinceLastSummon: number;
}

export type CanSummonReason =
  | "allowed"
  | "in-combat"
  | "safe-zone-forbidden"
  | "indoor-forbidden"
  | "underwater-forbidden"
  | "level-gate"
  | "cooldown";

export interface CanSummonResult {
  allowed: boolean;
  reason: CanSummonReason;
}

/** Locomotion gait — drives which speed value is selected. */
export type MountGait = "walk" | "run" | "sprint" | "fly" | "swim";

export interface StaminaTickInput {
  sprinting: boolean;
  stationary: boolean;
}

export class MountRegistry {
  private _byId = new Map<string, Mount>();

  constructor(manifest?: MountsManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: MountsManifest): void {
    this._byId.clear();
    for (const m of manifest) this._byId.set(m.id, m);
  }

  loadFromJson(raw: unknown): void {
    this.load(MountsManifestSchema.parse(raw));
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

  get(id: string): Mount {
    const m = this._byId.get(id);
    if (!m) {
      throw new UnknownMountError(id, Array.from(this._byId.keys()));
    }
    return m;
  }

  ids(): string[] {
    return Array.from(this._byId.keys());
  }

  byCategory(category: MountCategory): Mount[] {
    return Array.from(this._byId.values()).filter(
      (m) => m.category === category,
    );
  }

  byLocomotion(mode: MountLocomotion): Mount[] {
    return Array.from(this._byId.values()).filter((m) =>
      m.locomotion.includes(mode),
    );
  }

  /** Evaluate whether the player can summon this mount right now. */
  canSummon(mountId: string, ctx: MountSummonContext): CanSummonResult {
    const m = this.get(mountId);
    const rules = m.summonRules;
    if (ctx.ridingLevel < m.requiredRidingLevel) {
      return { allowed: false, reason: "level-gate" };
    }
    if (ctx.inCombat && !rules.allowInCombat) {
      return { allowed: false, reason: "in-combat" };
    }
    if (ctx.inSafeZone && !rules.allowInSafeZones) {
      return { allowed: false, reason: "safe-zone-forbidden" };
    }
    if (ctx.indoors && !rules.allowIndoors) {
      return { allowed: false, reason: "indoor-forbidden" };
    }
    if (ctx.underwater && !rules.allowUnderwater) {
      return { allowed: false, reason: "underwater-forbidden" };
    }
    if (ctx.secondsSinceLastSummon < rules.summonCooldownSec) {
      return { allowed: false, reason: "cooldown" };
    }
    return { allowed: true, reason: "allowed" };
  }

  /**
   * Select the speed (world units/sec) for the given gait. Caller
   * passes `currentStamina` to gate sprint; if stamina is depleted,
   * sprint falls back to run.
   */
  effectiveSpeed(
    mountId: string,
    gait: MountGait,
    opts: { currentStamina?: number } = {},
  ): number {
    const m = this.get(mountId);
    const s = m.speeds;
    switch (gait) {
      case "walk":
        return s.walkSpeed;
      case "run":
        return s.runSpeed;
      case "sprint": {
        if (m.stamina.maxStamina === 0) return s.sprintSpeed;
        const cur = opts.currentStamina ?? m.stamina.maxStamina;
        if (cur <= 0) return s.runSpeed;
        return s.sprintSpeed;
      }
      case "fly":
        return s.flySpeed;
      case "swim":
        return s.swimSpeed;
    }
  }

  /**
   * Advance stamina by `dtSec`. Returns new clamped stamina.
   *
   * Rules:
   * - maxStamina === 0 → unlimited; returns the input unchanged
   *   (caller may store a sentinel).
   * - sprinting & !stationary (or sprinting while `pauseWhenStationary`
   *   === false) drains at `drainPerSecondSprint`.
   * - otherwise regens at `regenPerSecond` up to `maxStamina`.
   */
  tickStamina(
    mountId: string,
    currentStamina: number,
    dtSec: number,
    input: StaminaTickInput,
  ): number {
    const m = this.get(mountId);
    const s = m.stamina;
    if (s.maxStamina === 0) return currentStamina;
    if (dtSec <= 0) return clamp(currentStamina, 0, s.maxStamina);
    const draining =
      input.sprinting && (!input.stationary || !s.pauseWhenStationary);
    if (draining) {
      return clamp(
        currentStamina - s.drainPerSecondSprint * dtSec,
        0,
        s.maxStamina,
      );
    }
    return clamp(currentStamina + s.regenPerSecond * dtSec, 0, s.maxStamina);
  }
}

function clamp(v: number, lo: number, hi: number): number {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

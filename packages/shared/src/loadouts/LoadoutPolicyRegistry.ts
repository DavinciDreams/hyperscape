/**
 * Loadout policy registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `loadouts.ts`.
 * Pure logic: slot-limit checks, category eligibility, swap gating,
 * export/import permission checks. Runtime `LoadoutSystem` owns
 * per-character saved slots and swap execution.
 *
 * Loadouts manifest is a single policy blob — this is a singleton
 * driver, not an id-keyed registry.
 */

import {
  type LoadoutSlotCategory,
  type LoadoutsManifest,
  LoadoutsManifestSchema,
} from "@hyperforge/manifest-schema";

export class LoadoutPolicyNotLoadedError extends Error {
  constructor() {
    super("LoadoutPolicyRegistry used before load()");
    this.name = "LoadoutPolicyNotLoadedError";
  }
}

export type SwapCheckReason =
  | "allowed"
  | "disabled"
  | "in-combat"
  | "not-in-safe-zone"
  | "cooldown"
  | "invalid-slot";

export interface SwapCheckResult {
  allowed: boolean;
  reason: SwapCheckReason;
}

export interface SwapContext {
  slotIndex: number;
  inCombat: boolean;
  inSafeZone: boolean;
  /** Seconds since last swap completion (Infinity = never swapped). */
  secondsSinceLastSwap: number;
}

export type SaveCheckReason =
  | "allowed"
  | "disabled"
  | "invalid-slot"
  | "free-slot-only"
  | "name-too-long"
  | "no-categories";

export interface SaveCheckResult {
  allowed: boolean;
  reason: SaveCheckReason;
}

export interface SaveContext {
  slotIndex: number;
  /** Whether this slot is a premium/paid slot. */
  premiumSlotsUnlocked: number;
  name: string;
  categoriesSnapshot: readonly LoadoutSlotCategory[];
}

export class LoadoutPolicyRegistry {
  private _policy: LoadoutsManifest | null = null;

  constructor(manifest?: LoadoutsManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: LoadoutsManifest): void {
    this._policy = manifest;
  }

  loadFromJson(raw: unknown): void {
    this.load(LoadoutsManifestSchema.parse(raw));
  }

  isLoaded(): boolean {
    return this._policy !== null;
  }

  get policy(): LoadoutsManifest {
    if (!this._policy) throw new LoadoutPolicyNotLoadedError();
    return this._policy;
  }

  get loaded(): boolean {
    return this._policy !== null;
  }

  /** Is the loadout system active? */
  isEnabled(): boolean {
    return this.policy.enabled;
  }

  /** Max saveable slots for a character. */
  maxSlots(): number {
    return this.policy.maxSlotsPerCharacter;
  }

  /** Free slot count (before requiring premium/paid unlocks). */
  freeSlotCount(): number {
    return this.policy.freeSlotCount;
  }

  /** Is the slot index within the free range? */
  isFreeSlot(slotIndex: number): boolean {
    return slotIndex < this.policy.freeSlotCount;
  }

  /** Is the category snapshot-able by the active slot rules? */
  isCategoryAllowed(category: LoadoutSlotCategory): boolean {
    return this.policy.slot.categories.includes(category);
  }

  /** Check whether a swap is permissible right now. */
  checkSwap(ctx: SwapContext): SwapCheckResult {
    const p = this.policy;
    if (!p.enabled) return { allowed: false, reason: "disabled" };
    if (ctx.slotIndex < 0 || ctx.slotIndex >= p.maxSlotsPerCharacter) {
      return { allowed: false, reason: "invalid-slot" };
    }
    const policy = p.swap.policy;
    if (policy === "outOfCombat" && ctx.inCombat) {
      return { allowed: false, reason: "in-combat" };
    }
    if (policy === "safeZoneOnly" && !ctx.inSafeZone) {
      return { allowed: false, reason: "not-in-safe-zone" };
    }
    if (ctx.secondsSinceLastSwap < p.swap.cooldownSec) {
      return { allowed: false, reason: "cooldown" };
    }
    return { allowed: true, reason: "allowed" };
  }

  /** Check whether saving into the given slot is allowed. */
  checkSave(ctx: SaveContext): SaveCheckResult {
    const p = this.policy;
    if (!p.enabled) return { allowed: false, reason: "disabled" };
    if (ctx.slotIndex < 0 || ctx.slotIndex >= p.maxSlotsPerCharacter) {
      return { allowed: false, reason: "invalid-slot" };
    }
    // premium gate: slot indices >= freeSlotCount require premium unlock count
    if (ctx.slotIndex >= p.freeSlotCount) {
      const premiumIndex = ctx.slotIndex - p.freeSlotCount;
      if (premiumIndex >= ctx.premiumSlotsUnlocked) {
        return { allowed: false, reason: "free-slot-only" };
      }
    }
    if (ctx.name.length > p.naming.maxNameLength) {
      return { allowed: false, reason: "name-too-long" };
    }
    if (ctx.categoriesSnapshot.length === 0) {
      return { allowed: false, reason: "no-categories" };
    }
    return { allowed: true, reason: "allowed" };
  }

  /** Can the player export a build code? */
  canExport(): boolean {
    return this.policy.enabled && this.policy.sharing.allowExport;
  }

  /** Can the player import a build code? */
  canImport(): boolean {
    return this.policy.enabled && this.policy.sharing.allowImport;
  }

  /** Can the player share directly to party? */
  canPartyShare(): boolean {
    return this.policy.enabled && this.policy.sharing.allowPartyShare;
  }
}

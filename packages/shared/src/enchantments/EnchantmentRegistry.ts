/**
 * Enchantment registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `enchantments.ts`.
 * Pure logic: slot eligibility, tier lookup, stat delta resolution,
 * and recipe gating. Runtime `EnchantmentSystem` owns enchant instances
 * on item instances, stacked-modifier aggregation, and the crafting
 * flow itself.
 */

import {
  type Enchantment,
  type EnchantmentKind,
  type EnchantmentSlot,
  type EnchantmentStat,
  type EnchantmentTierEntry,
  type EnchantmentsManifest,
  EnchantmentsManifestSchema,
} from "@hyperforge/manifest-schema";

export class UnknownEnchantmentError extends Error {
  readonly enchantmentId: string;
  readonly availableIds: readonly string[];
  constructor(id: string, availableIds: readonly string[]) {
    super(
      `enchantment "${id}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownEnchantmentError";
    this.enchantmentId = id;
    this.availableIds = availableIds;
  }
}

/** Resolved stat delta at a given tier. */
export interface StatDelta {
  stat: EnchantmentStat;
  op: "add" | "multiply";
  value: number;
}

export type ApplyCheckReason =
  | "allowed"
  | "slot-mismatch"
  | "tier-too-high"
  | "level-too-low";

export interface ApplyCheckResult {
  allowed: boolean;
  reason: ApplyCheckReason;
}

export class EnchantmentRegistry {
  private _byId = new Map<string, Enchantment>();

  constructor(manifest?: EnchantmentsManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: EnchantmentsManifest): void {
    this._byId.clear();
    for (const e of manifest) this._byId.set(e.id, e);
  }

  loadFromJson(raw: unknown): void {
    this.load(EnchantmentsManifestSchema.parse(raw));
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

  get(id: string): Enchantment {
    const e = this._byId.get(id);
    if (!e) {
      throw new UnknownEnchantmentError(id, Array.from(this._byId.keys()));
    }
    return e;
  }

  ids(): string[] {
    return Array.from(this._byId.keys());
  }

  byKind(kind: EnchantmentKind): Enchantment[] {
    return Array.from(this._byId.values()).filter((e) => e.kind === kind);
  }

  /** Enchantments that can attach to the given slot. */
  bySlot(slot: EnchantmentSlot): Enchantment[] {
    return Array.from(this._byId.values()).filter(
      (e) => e.slots.includes("any") || e.slots.includes(slot),
    );
  }

  /** Can this enchant apply to the given slot at the given tier? */
  canApply(
    enchantmentId: string,
    slot: EnchantmentSlot,
    opts: { tier: number; characterLevel: number },
  ): ApplyCheckResult {
    const e = this.get(enchantmentId);
    const supportsSlot = e.slots.includes("any") || e.slots.includes(slot);
    if (!supportsSlot) return { allowed: false, reason: "slot-mismatch" };
    if (opts.tier > e.maxTier) {
      return { allowed: false, reason: "tier-too-high" };
    }
    // Level gate: any modifier's tier entry at the requested tier must meet level.
    for (const mod of e.modifiers) {
      const entry = mod.tiers.find((t) => t.tier === opts.tier);
      if (entry && opts.characterLevel < entry.requiredLevel) {
        return { allowed: false, reason: "level-too-low" };
      }
    }
    return { allowed: true, reason: "allowed" };
  }

  /**
   * Resolve the stat deltas granted at the given tier. Missing tier
   * entries yield no delta for that modifier (sparse ladders allowed).
   */
  deltasAtTier(enchantmentId: string, tier: number): StatDelta[] {
    const e = this.get(enchantmentId);
    const out: StatDelta[] = [];
    for (const mod of e.modifiers) {
      const entry = mod.tiers.find((t) => t.tier === tier);
      if (entry) {
        out.push({ stat: mod.stat, op: mod.op, value: entry.value });
      }
    }
    return out;
  }

  /** Tier entry for a specific modifier stat at a specific tier. */
  tierEntry(
    enchantmentId: string,
    stat: EnchantmentStat,
    tier: number,
  ): EnchantmentTierEntry | null {
    const e = this.get(enchantmentId);
    const mod = e.modifiers.find((m) => m.stat === stat);
    if (!mod) return null;
    return mod.tiers.find((t) => t.tier === tier) ?? null;
  }

  /** Is this enchantment player-craftable? */
  isCraftable(enchantmentId: string): boolean {
    const e = this.get(enchantmentId);
    return e.recipe.reagentIds.length > 0;
  }
}

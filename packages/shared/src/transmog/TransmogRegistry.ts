/**
 * Transmog registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `transmog.ts`.
 * Pure logic: source lookup, unlock eligibility, apply-cost math,
 * slot lock enforcement, and restriction matching. Runtime
 * `TransmogSystem` owns per-character unlocked appearance state +
 * outfit persistence.
 */

import {
  type TransmogManifest,
  type TransmogRestriction,
  type TransmogSlot,
  type TransmogSource,
  type TransmogUnlockModel,
  TransmogManifestSchema,
} from "@hyperforge/manifest-schema";

export class TransmogNotLoadedError extends Error {
  constructor() {
    super("TransmogRegistry used before load()");
    this.name = "TransmogNotLoadedError";
  }
}

export class UnknownTransmogSourceError extends Error {
  readonly sourceId: string;
  readonly availableIds: readonly string[];
  constructor(id: string, availableIds: readonly string[]) {
    super(
      `transmog source "${id}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownTransmogSourceError";
    this.sourceId = id;
    this.availableIds = availableIds;
  }
}

export type ApplyCheckReason =
  | "allowed"
  | "disabled"
  | "unknown-source"
  | "slot-locked"
  | "restricted"
  | "source-required"
  | "not-unlocked";

export interface ApplyCheckResult {
  allowed: boolean;
  reason: ApplyCheckReason;
  /** Currency cost (0 if not allowed). */
  cost: number;
}

export interface ApplyContext {
  sourceId: string;
  raceId: string;
  classId: string;
  factionId: string;
  /** Source ids the player has unlocked. */
  unlockedSourceIds: ReadonlySet<string>;
  /** Item ids currently in inventory/bank. */
  possessedItemIds: ReadonlySet<string>;
}

/** Listener invoked after every successful `load()` / `loadFromJson()`. */
export type TransmogReloadListener = () => void;

export class TransmogRegistry {
  private _manifest: TransmogManifest | null = null;
  private _byId = new Map<string, TransmogSource>();
  private _byItemId = new Map<string, string[]>();
  private _reloadListeners = new Set<TransmogReloadListener>();

  constructor(manifest?: TransmogManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: TransmogManifest): void {
    this._manifest = manifest;
    this._byId.clear();
    this._byItemId.clear();
    for (const s of manifest.sources) {
      this._byId.set(s.id, s);
      if (s.itemId) {
        const arr = this._byItemId.get(s.itemId);
        if (arr) arr.push(s.id);
        else this._byItemId.set(s.itemId, [s.id]);
      }
    }
    this._emitReloaded();
  }

  loadFromJson(raw: unknown): void {
    this.load(TransmogManifestSchema.parse(raw));
  }

  /**
   * Subscribe to reload notifications. Returns unsubscribe.
   * Listener throws are caught + logged. Pattern matches
   * `SkillIconsRegistry.onReloaded`.
   */
  onReloaded(cb: TransmogReloadListener): () => void {
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
          "[transmogRegistry] reload listener threw:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  isLoaded(): boolean {
    return this._manifest !== null;
  }

  get manifest(): TransmogManifest {
    if (!this._manifest) throw new TransmogNotLoadedError();
    return this._manifest;
  }

  get size(): number {
    return this._byId.size;
  }

  has(id: string): boolean {
    return this._byId.has(id);
  }

  get(id: string): TransmogSource {
    const s = this._byId.get(id);
    if (!s) {
      throw new UnknownTransmogSourceError(id, Array.from(this._byId.keys()));
    }
    return s;
  }

  ids(): string[] {
    return Array.from(this._byId.keys());
  }

  bySlot(slot: TransmogSlot): TransmogSource[] {
    return Array.from(this._byId.values()).filter((s) => s.slot === slot);
  }

  /** Sources triggered by acquiring/equipping this item. */
  sourcesFromItem(itemId: string): TransmogSource[] {
    const ids = this._byItemId.get(itemId) ?? [];
    return ids
      .map((id) => this._byId.get(id))
      .filter((x): x is TransmogSource => !!x);
  }

  /** Is the slot globally locked from transmog? */
  isSlotLocked(slot: TransmogSlot): boolean {
    return this.manifest.global.lockedSlots.includes(slot);
  }

  /**
   * Resolve which unlock trigger, if any, fires when the player
   * acquires/equips `itemId`.
   */
  unlocksOnAcquire(itemId: string): TransmogSource[] {
    return this.sourcesFromItem(itemId).filter(
      (s) => s.unlockModel === "onFirstAcquire",
    );
  }

  unlocksOnEquip(itemId: string): TransmogSource[] {
    return this.sourcesFromItem(itemId).filter(
      (s) => s.unlockModel === "onFirstEquip",
    );
  }

  /**
   * Check whether applying the given source to a slot is allowed.
   */
  checkApply(ctx: ApplyContext): ApplyCheckResult {
    const m = this.manifest;
    if (!m.global.enabled) {
      return { allowed: false, reason: "disabled", cost: 0 };
    }
    const source = this._byId.get(ctx.sourceId);
    if (!source) return { allowed: false, reason: "unknown-source", cost: 0 };
    if (this.isSlotLocked(source.slot)) {
      return { allowed: false, reason: "slot-locked", cost: 0 };
    }
    if (
      !matchesRestriction(source.restriction, {
        raceId: ctx.raceId,
        classId: ctx.classId,
        factionId: ctx.factionId,
      })
    ) {
      return { allowed: false, reason: "restricted", cost: 0 };
    }
    if (!ctx.unlockedSourceIds.has(ctx.sourceId)) {
      return { allowed: false, reason: "not-unlocked", cost: 0 };
    }
    if (
      m.global.requireSourceInInventory &&
      source.itemId !== "" &&
      !ctx.possessedItemIds.has(source.itemId)
    ) {
      return { allowed: false, reason: "source-required", cost: 0 };
    }
    return {
      allowed: true,
      reason: "allowed",
      cost: m.global.applyCostPerSlotCurrency,
    };
  }

  /** Sources purchasable from the given vendor price cap. */
  sourcesByVendorCostAtMost(maxCost: number): TransmogSource[] {
    return Array.from(this._byId.values()).filter(
      (s) => s.unlockModel === "vendorPurchase" && s.vendorCost <= maxCost,
    );
  }

  /** Filter sources by unlock model. */
  byUnlockModel(model: TransmogUnlockModel): TransmogSource[] {
    return Array.from(this._byId.values()).filter(
      (s) => s.unlockModel === model,
    );
  }
}

interface RestrictionSubject {
  raceId: string;
  classId: string;
  factionId: string;
}

function matchesRestriction(
  r: TransmogRestriction,
  subject: RestrictionSubject,
): boolean {
  const raceOk =
    r.raceAllowList === "all" || r.raceAllowList.includes(subject.raceId);
  const classOk =
    r.classAllowList === "all" || r.classAllowList.includes(subject.classId);
  const factionOk =
    r.factionAllowList === "all" ||
    r.factionAllowList.includes(subject.factionId);
  return raceOk && classOk && factionOk;
}

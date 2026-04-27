/**
 * Duel-rules registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `duel.ts`.
 * Indexes duel rule definitions and equipment-slot metadata, and
 * supports rule-incompatibility + slot-ordering checks the duel
 * challenge UI needs.
 */

import {
  type DuelEquipmentSlotDefinition,
  type DuelManifest,
  DuelManifestSchema,
  type DuelRuleDefinition,
} from "@hyperforge/manifest-schema";

export class DuelRulesNotLoadedError extends Error {
  constructor() {
    super("DuelRulesRegistry used before load()");
    this.name = "DuelRulesNotLoadedError";
  }
}

export class UnknownDuelRuleError extends Error {
  readonly ruleKey: string;
  readonly availableKeys: readonly string[];
  constructor(key: string, availableKeys: readonly string[]) {
    super(
      `duel rule "${key}" not found. Known keys: ${
        availableKeys.length > 0 ? availableKeys.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownDuelRuleError";
    this.ruleKey = key;
    this.availableKeys = availableKeys;
  }
}

export class UnknownDuelEquipmentSlotError extends Error {
  readonly slotKey: string;
  readonly availableKeys: readonly string[];
  constructor(key: string, availableKeys: readonly string[]) {
    super(
      `duel equipment slot "${key}" not found. Known keys: ${
        availableKeys.length > 0 ? availableKeys.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownDuelEquipmentSlotError";
    this.slotKey = key;
    this.availableKeys = availableKeys;
  }
}

/** Listener invoked after every successful `load()` / `loadFromJson()`. */
export type DuelRulesReloadListener = () => void;

export class DuelRulesRegistry {
  private _manifest: DuelManifest | null = null;
  private _reloadListeners = new Set<DuelRulesReloadListener>();

  constructor(manifest?: DuelManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: DuelManifest): void {
    this._manifest = manifest;
    this._emitReloaded();
  }

  loadFromJson(raw: unknown): void {
    this.load(DuelManifestSchema.parse(raw));
  }

  /**
   * Subscribe to reload notifications. Returns unsubscribe.
   * Listener throws are caught + logged. Pattern matches
   * `SkillIconsRegistry.onReloaded`.
   */
  onReloaded(cb: DuelRulesReloadListener): () => void {
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
          "[duelRulesRegistry] reload listener threw:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  isLoaded(): boolean {
    return this._manifest !== null;
  }

  get manifest(): DuelManifest {
    if (!this._manifest) throw new DuelRulesNotLoadedError();
    return this._manifest;
  }

  get challengeTimeoutMs(): number {
    return this.manifest.challengeTimeoutMs;
  }

  get ruleKeys(): string[] {
    return Object.keys(this.manifest.rules);
  }

  hasRule(key: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.manifest.rules, key);
  }

  rule(key: string): DuelRuleDefinition {
    const r = this.manifest.rules[key];
    if (!r) throw new UnknownDuelRuleError(key, this.ruleKeys);
    return r;
  }

  /**
   * Rule keys incompatible with the selected set (excluding the
   * rules already in `selected` itself). Symmetric: if A lists B as
   * incompatible, B is also treated as incompatible when A is selected.
   */
  incompatibleWith(selected: readonly string[]): string[] {
    const selectedSet = new Set(selected);
    const blocked = new Set<string>();
    for (const sel of selected) {
      const rule = this.manifest.rules[sel];
      if (!rule) continue;
      for (const other of rule.incompatibleWith) blocked.add(other);
    }
    // Also: anything that *declares* one of our selected rules incompatible
    for (const [key, def] of Object.entries(this.manifest.rules)) {
      if (selectedSet.has(key)) continue;
      if (def.incompatibleWith.some((i) => selectedSet.has(i)))
        blocked.add(key);
    }
    for (const s of selected) blocked.delete(s);
    return Array.from(blocked);
  }

  get equipmentSlotKeys(): string[] {
    return Object.keys(this.manifest.equipmentSlots);
  }

  equipmentSlot(key: string): DuelEquipmentSlotDefinition {
    const s = this.manifest.equipmentSlots[key];
    if (!s)
      throw new UnknownDuelEquipmentSlotError(key, this.equipmentSlotKeys);
    return s;
  }

  /** Slot keys sorted by authored `order`, ascending, then alpha as tiebreaker. */
  orderedSlotKeys(): string[] {
    return Object.keys(this.manifest.equipmentSlots).sort((a, b) => {
      const oa = this.manifest.equipmentSlots[a].order;
      const ob = this.manifest.equipmentSlots[b].order;
      if (oa !== ob) return oa - ob;
      return a.localeCompare(b);
    });
  }

  ecsSlotFor(duelSlot: string): string | undefined {
    return this.manifest.duelSlotToEquipmentSlot[duelSlot];
  }
}

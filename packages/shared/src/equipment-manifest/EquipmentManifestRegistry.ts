/**
 * Equipment manifest registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `equipment.ts`.
 * Pure logic: slot definition lookup + bank equipment grid layout +
 * error-message resolution for `BankEquipmentError` enum keys.
 *
 * Named `EquipmentManifestRegistry` to avoid collision with the
 * `EquipmentSystem` runtime (which handles live equip/unequip logic).
 */

import {
  type BankEquipmentErrorKey,
  type BankEquipmentSlotDef,
  type EquipmentManifest,
  type EquipmentSlotId,
  EquipmentManifestSchema,
} from "@hyperforge/manifest-schema";

export class EquipmentManifestNotLoadedError extends Error {
  constructor() {
    super("EquipmentManifestRegistry used before load()");
    this.name = "EquipmentManifestNotLoadedError";
  }
}

export class UnknownEquipmentSlotError extends Error {
  readonly slotId: string;
  readonly availableIds: readonly string[];
  constructor(id: string, availableIds: readonly string[]) {
    super(
      `equipment slot "${id}" not found in bank layout. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownEquipmentSlotError";
    this.slotId = id;
    this.availableIds = availableIds;
  }
}

export class UnknownBankEquipmentErrorKey extends Error {
  readonly key: string;
  constructor(key: string) {
    super(`bank equipment error "${key}" not present in manifest messages`);
    this.name = "UnknownBankEquipmentErrorKey";
    this.key = key;
  }
}

export class EquipmentManifestRegistry {
  private _manifest: EquipmentManifest | null = null;
  private _bankById = new Map<EquipmentSlotId, BankEquipmentSlotDef>();

  constructor(manifest?: EquipmentManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: EquipmentManifest): void {
    this._manifest = manifest;
    this._bankById.clear();
    for (const s of manifest.bankEquipmentSlots) this._bankById.set(s.key, s);
  }

  loadFromJson(raw: unknown): void {
    this.load(EquipmentManifestSchema.parse(raw));
  }

  isLoaded(): boolean {
    return this._manifest !== null;
  }

  get manifest(): EquipmentManifest {
    if (!this._manifest) throw new EquipmentManifestNotLoadedError();
    return this._manifest;
  }

  /** Authored slot iteration order. */
  get implementedSlots(): readonly EquipmentSlotId[] {
    return this.manifest.implementedSlots;
  }

  isImplemented(slot: EquipmentSlotId): boolean {
    return this.manifest.implementedSlots.includes(slot);
  }

  /** Bank-equipment UI grid definitions, as authored. */
  get bankSlots(): readonly BankEquipmentSlotDef[] {
    return this.manifest.bankEquipmentSlots;
  }

  bankSlot(id: EquipmentSlotId): BankEquipmentSlotDef {
    const s = this._bankById.get(id);
    if (!s) {
      throw new UnknownEquipmentSlotError(
        id,
        Array.from(this._bankById.keys()),
      );
    }
    return s;
  }

  /** Error message for a `BankEquipmentError` enum key. */
  bankErrorMessage(key: BankEquipmentErrorKey): string {
    const msg = this.manifest.bankEquipmentErrorMessages[key];
    if (msg === undefined) throw new UnknownBankEquipmentErrorKey(key);
    return msg;
  }

  /** Grid bounds implied by authored positions (inclusive, zero-origin). */
  bankGridBounds(): { rows: number; cols: number } {
    let rows = 0;
    let cols = 0;
    for (const s of this.manifest.bankEquipmentSlots) {
      if (s.gridPosition.row + 1 > rows) rows = s.gridPosition.row + 1;
      if (s.gridPosition.col + 1 > cols) cols = s.gridPosition.col + 1;
    }
    return { rows, cols };
  }
}

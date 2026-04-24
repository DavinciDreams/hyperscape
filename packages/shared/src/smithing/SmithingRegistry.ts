/**
 * Smithing registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `smithing.ts`.
 * Wraps the smithing/smelting constants (item ids, timing defaults,
 * validation limits, user-facing messages) behind typed accessors.
 */

import {
  type SmithingManifest,
  SmithingManifestSchema,
  type SmithingMessages,
} from "@hyperforge/manifest-schema";

export class SmithingNotLoadedError extends Error {
  constructor() {
    super("SmithingRegistry used before load()");
    this.name = "SmithingNotLoadedError";
  }
}

export class SmithingRegistry {
  private _manifest: SmithingManifest | null = null;

  constructor(manifest?: SmithingManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: SmithingManifest): void {
    this._manifest = manifest;
  }

  loadFromJson(raw: unknown): void {
    this.load(SmithingManifestSchema.parse(raw));
  }

  isLoaded(): boolean {
    return this._manifest !== null;
  }

  get manifest(): SmithingManifest {
    if (!this._manifest) throw new SmithingNotLoadedError();
    return this._manifest;
  }

  get hammerItemId(): string {
    return this.manifest.items.hammerItemId;
  }

  get coalItemId(): string {
    return this.manifest.items.coalItemId;
  }

  get defaultSmeltingTicks(): number {
    return this.manifest.timing.defaultSmeltingTicks;
  }

  get defaultSmithingTicks(): number {
    return this.manifest.timing.defaultSmithingTicks;
  }

  get validation(): SmithingManifest["validation"] {
    return this.manifest.validation;
  }

  get messages(): SmithingMessages {
    return this.manifest.messages;
  }

  isQuantityInRange(quantity: number): boolean {
    const v = this.manifest.validation;
    return quantity >= v.minQuantity && quantity <= v.maxQuantity;
  }

  isItemIdLengthValid(itemId: string): boolean {
    return (
      itemId.length > 0 &&
      itemId.length <= this.manifest.validation.maxItemIdLength
    );
  }
}

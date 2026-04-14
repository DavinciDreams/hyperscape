/**
 * EntityTypeRegistry — Runtime index of a GameModule's entity types.
 *
 * Provides O(1) lookups by type ID, selection type, storage key,
 * palette category, and outliner layer. Constructed once per module
 * and shared via React context.
 */

import type { GameModule, EntityTypeSchema } from "./GameModule";

export class EntityTypeRegistry {
  private _schemas = new Map<string, EntityTypeSchema>();
  private _bySelection = new Map<string, EntityTypeSchema>();
  private _byStorage = new Map<string, EntityTypeSchema>();
  private _byPalette = new Map<string, EntityTypeSchema[]>();
  private _byLayer = new Map<string, EntityTypeSchema[]>();

  constructor(module: GameModule) {
    for (const et of module.entityTypes) {
      this._schemas.set(et.id, et);
      this._bySelection.set(et.selectionType, et);
      this._byStorage.set(et.storage.stateKey, et);

      // Index by palette category
      const paletteArr = this._byPalette.get(et.paletteCategory);
      if (paletteArr) {
        paletteArr.push(et);
      } else {
        this._byPalette.set(et.paletteCategory, [et]);
      }

      // Index by outliner layer
      const layerArr = this._byLayer.get(et.outlinerLayer);
      if (layerArr) {
        layerArr.push(et);
      } else {
        this._byLayer.set(et.outlinerLayer, [et]);
      }
    }
  }

  /** Get entity type schema by type ID. */
  get(typeId: string): EntityTypeSchema | undefined {
    return this._schemas.get(typeId);
  }

  /** Get entity type schema by Selection.type value. */
  getBySelectionType(sel: string): EntityTypeSchema | undefined {
    return this._bySelection.get(sel);
  }

  /** Get entity type schema by extendedLayers state key. */
  getByStorageKey(key: string): EntityTypeSchema | undefined {
    return this._byStorage.get(key);
  }

  /** Get all entity type schemas in a palette category. */
  getByPaletteCategory(cat: string): EntityTypeSchema[] {
    return this._byPalette.get(cat) ?? [];
  }

  /** Get all entity type schemas in an outliner layer. */
  getByOutlinerLayer(layer: string): EntityTypeSchema[] {
    return this._byLayer.get(layer) ?? [];
  }

  /** Get all registered entity type schemas. */
  getAll(): EntityTypeSchema[] {
    return Array.from(this._schemas.values());
  }

  /** Check if a type ID is registered. */
  has(typeId: string): boolean {
    return this._schemas.has(typeId);
  }

  /** Check if a selection type is registered. */
  hasSelectionType(sel: string): boolean {
    return this._bySelection.has(sel);
  }
}

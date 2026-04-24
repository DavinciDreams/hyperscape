/**
 * Save-data migrator.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `save-data.ts`.
 * Walks the per-slice migration chain to bring an on-disk save row up
 * to the slice's current version. Plugin-owned migrator functions are
 * registered by name against this instance; the manifest describes
 * *what* migration exists at each step, and the migrator fills in
 * *how* it executes.
 *
 * Scope: pure logic. No deps on DB, filesystem, Drizzle, or the
 * server. The caller reads a row from storage, hands it to
 * `migrator.migrate(sliceId, row)`, and writes the returned row back
 * (or commits it in-memory for the current session).
 */

import {
  type SaveDataManifest,
  type SaveField,
  type SaveMigration,
  type SaveSlice,
  SaveDataManifestSchema,
} from "@hyperforge/manifest-schema";

/** The JSON-serializable shape of a persisted save row. */
export interface SaveRow {
  version: number;
  data: Record<string, unknown>;
}

/**
 * Migrator function signature. Input: slice data for version `from`.
 * Output: slice data for version `from + 1`. Pure-ish — implementations
 * may return a new object (preferred) or mutate the input and return it.
 */
export type MigratorFn = (
  data: Record<string, unknown>,
) => Record<string, unknown>;

export class UnknownSaveSliceError extends Error {
  readonly sliceId: string;
  readonly availableIds: readonly string[];
  constructor(sliceId: string, availableIds: readonly string[]) {
    super(
      `save slice "${sliceId}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownSaveSliceError";
    this.sliceId = sliceId;
    this.availableIds = availableIds;
  }
}

export class UnknownMigratorError extends Error {
  readonly migratorName: string;
  readonly sliceId: string;
  readonly fromVersion: number;
  constructor(migratorName: string, sliceId: string, fromVersion: number) {
    super(
      `migrator "${migratorName}" for slice "${sliceId}" v${fromVersion}→v${fromVersion + 1} is not registered`,
    );
    this.name = "UnknownMigratorError";
    this.migratorName = migratorName;
    this.sliceId = sliceId;
    this.fromVersion = fromVersion;
  }
}

export class NoMigrationPathError extends Error {
  readonly sliceId: string;
  readonly fromVersion: number;
  readonly toVersion: number;
  constructor(sliceId: string, fromVersion: number, toVersion: number) {
    super(
      `no migration registered from v${fromVersion} for slice "${sliceId}" (target v${toVersion})`,
    );
    this.name = "NoMigrationPathError";
    this.sliceId = sliceId;
    this.fromVersion = fromVersion;
    this.toVersion = toVersion;
  }
}

export class FutureSaveVersionError extends Error {
  readonly sliceId: string;
  readonly rowVersion: number;
  readonly sliceVersion: number;
  constructor(sliceId: string, rowVersion: number, sliceVersion: number) {
    super(
      `save row for slice "${sliceId}" has version v${rowVersion} but current schema is v${sliceVersion} — code rolled back?`,
    );
    this.name = "FutureSaveVersionError";
    this.sliceId = sliceId;
    this.rowVersion = rowVersion;
    this.sliceVersion = sliceVersion;
  }
}

/** Registry of save slices keyed by id. */
export class SaveDataRegistry {
  private _byId = new Map<string, SaveSlice>();

  constructor(manifest?: SaveDataManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: SaveDataManifest): void {
    this._byId.clear();
    for (const s of manifest) this._byId.set(s.id, s);
  }

  loadFromJson(raw: unknown): void {
    this.load(SaveDataManifestSchema.parse(raw));
  }

  get size(): number {
    return this._byId.size;
  }

  get ids(): readonly string[] {
    return Array.from(this._byId.keys());
  }

  has(id: string): boolean {
    return this._byId.has(id);
  }

  get(id: string): SaveSlice {
    const s = this._byId.get(id);
    if (!s) {
      throw new UnknownSaveSliceError(id, Array.from(this._byId.keys()));
    }
    return s;
  }
}

/**
 * Applies field-default values to a row's data for any `required` field
 * that is missing a value. Pure helper — callers use it after migration
 * to normalize shape before handing to plugin code.
 */
export function applyFieldDefaults(
  slice: SaveSlice,
  data: Record<string, unknown>,
): Record<string, unknown> {
  const out = { ...data };
  for (const field of slice.fields) {
    if (out[field.name] !== undefined) continue;
    if (field.defaultValue !== undefined) {
      out[field.name] = field.defaultValue;
    }
  }
  return out;
}

/** Checks whether a required field is missing and has no default. */
export function collectMissingFields(
  slice: SaveSlice,
  data: Record<string, unknown>,
): SaveField[] {
  const missing: SaveField[] = [];
  for (const field of slice.fields) {
    if (!field.required) continue;
    if (data[field.name] !== undefined) continue;
    if (field.defaultValue !== undefined) continue;
    missing.push(field);
  }
  return missing;
}

/** Applies registered migrators to migrate a save row to the slice's current version. */
export class SaveDataMigrator {
  readonly registry: SaveDataRegistry;
  private _migrators = new Map<string, MigratorFn>();

  constructor(registry: SaveDataRegistry = new SaveDataRegistry()) {
    this.registry = registry;
  }

  /** Register a migrator function by name. Overwrites previous registration. */
  register(name: string, fn: MigratorFn): void {
    this._migrators.set(name, fn);
  }

  unregister(name: string): void {
    this._migrators.delete(name);
  }

  isRegistered(name: string): boolean {
    return this._migrators.has(name);
  }

  /**
   * Migrate a save row up to `slice.version`. Pure against the input:
   * returns a new row. Throws on gaps in the chain, unregistered
   * migrators, or row versions ahead of the current schema.
   */
  migrate(sliceId: string, row: SaveRow): SaveRow {
    if (!Number.isInteger(row.version) || row.version < 0) {
      throw new TypeError(
        `row.version must be a non-negative integer (got ${String(row.version)})`,
      );
    }
    const slice = this.registry.get(sliceId);
    if (row.version > slice.version) {
      throw new FutureSaveVersionError(sliceId, row.version, slice.version);
    }
    if (row.version === slice.version) {
      return { version: row.version, data: { ...row.data } };
    }
    // Index migrations by `from` for O(1) lookup.
    const byFrom = new Map<number, SaveMigration>();
    for (const m of slice.migrations) byFrom.set(m.from, m);

    let data = row.data;
    for (let v = row.version; v < slice.version; v++) {
      const step = byFrom.get(v);
      if (!step) {
        throw new NoMigrationPathError(sliceId, v, slice.version);
      }
      const fn = this._migrators.get(step.migrator);
      if (!fn) {
        throw new UnknownMigratorError(step.migrator, sliceId, v);
      }
      data = fn(data);
    }
    return { version: slice.version, data };
  }
}

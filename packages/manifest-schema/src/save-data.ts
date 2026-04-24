/**
 * Save-data schema registry manifest.
 *
 * Section 14 of the World Studio AAA plan. Today the character save
 * shape is hardcoded in the server. As plugins contribute their own
 * state (banking, quest journals, housing, cosmetics, …) each needs
 * to declare which slices of state persist, how they version, and
 * how they migrate.
 *
 * This manifest is the schema-of-schemas: a registry that names each
 * save slice, pins its current version, lists supported migration
 * chains, and declares scope (per-character, per-account, per-world).
 *
 * The *shape* of each slice is described by a field list keyed by
 * lowerCamelCase identifiers with primitive kinds — the same set
 * used by `replication.ts`. Complex nested shapes are intentionally
 * not supported here; slices that need richer types should serialize
 * to `bytes` or `string` (JSON) and unwrap at the plugin layer.
 */

import { z } from "zod";

/** Scope of a save slice — determines which DB table owns it. */
export const SaveScopeSchema = z.enum([
  "character",
  "account",
  "world",
  "guild",
]);
export type SaveScope = z.infer<typeof SaveScopeSchema>;

/** Primitive kinds mirrored from `replication.ts` for serializer reuse. */
export const SaveFieldKindSchema = z.enum([
  "bool",
  "int",
  "uint",
  "float",
  "string",
  "vec2",
  "vec3",
  "vec4",
  "quaternion",
  "enum",
  "entity-ref",
  "bytes",
  "json",
]);
export type SaveFieldKind = z.infer<typeof SaveFieldKindSchema>;

/** One persisted property on a slice. */
export const SaveFieldSchema = z
  .object({
    name: z
      .string()
      .regex(
        /^[a-z][a-zA-Z0-9]*$/,
        "save field name must be lowerCamelCase ASCII identifier",
      ),
    kind: SaveFieldKindSchema,
    /** Required iff `kind === "enum"`. */
    enumValues: z.array(z.string().min(1)).optional(),
    /** If false the field is allowed to be missing on read. */
    required: z.boolean().default(true),
    /** Default JSON-literal used when column is added in a migration. */
    defaultValue: z
      .union([z.string(), z.number(), z.boolean(), z.null()])
      .optional(),
    description: z.string().default(""),
    /** If true the field is write-once and rejected on overwrite. */
    immutable: z.boolean().default(false),
  })
  .refine(
    ({ kind, enumValues }) =>
      kind === "enum"
        ? Array.isArray(enumValues) && enumValues.length > 0
        : true,
    { message: "enum fields require a non-empty `enumValues` array" },
  )
  .refine(
    ({ kind, enumValues }) =>
      kind !== "enum" ? enumValues === undefined : true,
    { message: "`enumValues` only applies when kind === 'enum'" },
  );
export type SaveField = z.infer<typeof SaveFieldSchema>;

/**
 * Migration chain — `from` → `to` versions. The runtime resolves a
 * path from the on-disk version to the current version by composing
 * these in order. The `migrator` is a registered function name; the
 * concrete migration code lives in the plugin that owns the slice.
 */
export const SaveMigrationSchema = z
  .object({
    from: z.number().int().nonnegative(),
    to: z.number().int().nonnegative(),
    migrator: z.string().min(1),
    description: z.string().default(""),
  })
  .refine(({ from, to }) => to === from + 1, {
    message: "migrations must step exactly one version forward (from → from+1)",
  });
export type SaveMigration = z.infer<typeof SaveMigrationSchema>;

/** A single persisted slice — typically one per plugin concern. */
export const SaveSliceSchema = z
  .object({
    /** Slice id — reverse-domain or plain lowerCamelCase; must be unique across the registry. */
    id: z
      .string()
      .regex(
        /^[a-z][a-zA-Z0-9_-]*(?:\.[a-z][a-zA-Z0-9_-]*)*$/,
        "save slice id must be dot-separated lowerCamelCase segments",
      ),
    name: z.string().min(1),
    description: z.string().default(""),
    scope: SaveScopeSchema,
    /** Current schema version — persisted rows below this version are migrated on load. */
    version: z.number().int().min(1).default(1),
    fields: z.array(SaveFieldSchema).min(1),
    migrations: z.array(SaveMigrationSchema).default([]),
    /** If true, the slice is snapshotted every N seconds; otherwise only on commit. */
    periodicSnapshot: z.boolean().default(false),
    snapshotIntervalSec: z.number().int().min(5).max(86400).default(60),
  })
  .refine(
    ({ fields }) => new Set(fields.map((f) => f.name)).size === fields.length,
    { message: "field names within a slice must be unique" },
  )
  .refine(
    ({ version, migrations }) => migrations.every((m) => m.to <= version),
    {
      message:
        "no migration may produce a version higher than the slice's current `version`",
    },
  )
  .refine(
    ({ migrations }) => {
      const keys = migrations.map((m) => `${m.from}->${m.to}`);
      return new Set(keys).size === keys.length;
    },
    { message: "migration (from,to) pairs must be unique" },
  );
export type SaveSlice = z.infer<typeof SaveSliceSchema>;

export const SaveDataManifestSchema = z
  .array(SaveSliceSchema)
  .refine((list) => new Set(list.map((s) => s.id)).size === list.length, {
    message: "save slice ids must be unique",
  });
export type SaveDataManifest = z.infer<typeof SaveDataManifestSchema>;

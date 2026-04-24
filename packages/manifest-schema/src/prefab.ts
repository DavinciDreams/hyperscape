/**
 * Prefab / blueprint manifest schema.
 *
 * Section 15 (UE5 parity — prefab/blueprint instancing) of the
 * World Studio AAA plan. A prefab captures a reusable composition
 * of entities with relative transforms + authored property values.
 * Instances reference a prefab id plus per-instance transform and
 * property overrides.
 *
 * Design goals:
 * - Deterministic IDs: each entity inside a prefab has a stable
 *   `localId` so overrides can target specific parts by name
 *   (e.g. `door/handle`), not by array index.
 * - Sparse overrides: an instance only stores what differs from
 *   the prefab's defaults — supports "nested-prefab" workflows.
 * - Type-safe primitives: overrides carry JSON-literal primitives
 *   only; complex values serialize as JSON strings.
 */

import { z } from "zod";

const Vec3 = z
  .object({
    x: z.number(),
    y: z.number(),
    z: z.number(),
  })
  .strict();

const Quat = z
  .object({
    x: z.number(),
    y: z.number(),
    z: z.number(),
    w: z.number(),
  })
  .strict();

/** Primitive value allowed in property defaults + overrides. */
export const PrefabPropertyValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.union([z.string(), z.number(), z.boolean()])),
]);
export type PrefabPropertyValue = z.infer<typeof PrefabPropertyValueSchema>;

/** Transform of an entity within a prefab (or an instance in the world). */
export const PrefabTransformSchema = z
  .object({
    position: Vec3,
    rotation: Quat.default({ x: 0, y: 0, z: 0, w: 1 }),
    scale: Vec3.default({ x: 1, y: 1, z: 1 }),
  })
  .strict();
export type PrefabTransform = z.infer<typeof PrefabTransformSchema>;

/** One entity composed inside a prefab. */
export const PrefabEntitySchema = z
  .object({
    /** Stable local id within the prefab — used as override target. */
    localId: z
      .string()
      .regex(
        /^[a-z][a-zA-Z0-9_-]*(?:\/[a-z][a-zA-Z0-9_-]*)*$/,
        "prefab entity localId must be slash-separated lowerCamelCase segments",
      ),
    /** Entity-type id — matches GameModule.entityTypes keys. */
    entityType: z.string().min(1),
    transform: PrefabTransformSchema,
    /** Authored default property values (shallow). */
    properties: z
      .record(z.string().min(1), PrefabPropertyValueSchema)
      .default({}),
    /** Optional nested prefab reference — the entity IS a prefab instance. */
    nestedPrefabId: z.string().default(""),
  })
  .refine(
    ({ nestedPrefabId, entityType }) =>
      nestedPrefabId === "" || entityType === "prefab-instance",
    {
      message:
        "entities with `nestedPrefabId` must declare `entityType: 'prefab-instance'`",
    },
  );
export type PrefabEntity = z.infer<typeof PrefabEntitySchema>;

export const PrefabSchema = z
  .object({
    /** Prefab id — unique across the manifest. */
    id: z
      .string()
      .regex(
        /^[a-z][a-zA-Z0-9_-]*(?:\.[a-z][a-zA-Z0-9_-]*)*$/,
        "prefab id must be dot-separated lowerCamelCase segments",
      ),
    name: z.string().min(1),
    description: z.string().default(""),
    /** Authoring tags for palette grouping. */
    tags: z.array(z.string().min(1)).default([]),
    /** Required: at least one entity. */
    entities: z.array(PrefabEntitySchema).min(1),
  })
  .refine(
    ({ entities }) =>
      new Set(entities.map((e) => e.localId)).size === entities.length,
    { message: "prefab entity localIds must be unique within the prefab" },
  );
export type Prefab = z.infer<typeof PrefabSchema>;

/** Per-instance override addressing one local entity + one property. */
export const PrefabOverrideSchema = z.object({
  /** localId of the entity inside the prefab to target. */
  targetLocalId: z
    .string()
    .regex(
      /^[a-z][a-zA-Z0-9_-]*(?:\/[a-z][a-zA-Z0-9_-]*)*$/,
      "override target must reference a valid prefab entity localId",
    ),
  /** Property name on that entity to override. */
  propertyName: z
    .string()
    .regex(
      /^[a-z][a-zA-Z0-9]*$/,
      "property name must be lowerCamelCase ASCII identifier",
    ),
  value: PrefabPropertyValueSchema,
});
export type PrefabOverride = z.infer<typeof PrefabOverrideSchema>;

/** An instance of a prefab placed in the world. */
export const PrefabInstanceSchema = z
  .object({
    /** Instance id — unique across the manifest; typically UUID. */
    id: z.string().min(1),
    prefabId: z.string().min(1),
    transform: PrefabTransformSchema,
    overrides: z.array(PrefabOverrideSchema).default([]),
  })
  .refine(
    ({ overrides }) => {
      const keys = overrides.map(
        (o) => `${o.targetLocalId}::${o.propertyName}`,
      );
      return new Set(keys).size === keys.length;
    },
    {
      message:
        "overrides must not duplicate (targetLocalId, propertyName) pairs",
    },
  );
export type PrefabInstance = z.infer<typeof PrefabInstanceSchema>;

export const PrefabManifestSchema = z
  .object({
    prefabs: z.array(PrefabSchema).default([]),
    instances: z.array(PrefabInstanceSchema).default([]),
  })
  .refine(
    ({ prefabs }) => new Set(prefabs.map((p) => p.id)).size === prefabs.length,
    { message: "prefab ids must be unique" },
  )
  .refine(
    ({ instances }) =>
      new Set(instances.map((i) => i.id)).size === instances.length,
    { message: "prefab instance ids must be unique" },
  )
  .refine(
    ({ prefabs, instances }) => {
      const ids = new Set(prefabs.map((p) => p.id));
      return instances.every((i) => ids.has(i.prefabId));
    },
    { message: "every instance `prefabId` must reference an existing prefab" },
  )
  .refine(
    ({ prefabs, instances }) => {
      const byId = new Map(prefabs.map((p) => [p.id, p]));
      return instances.every((i) => {
        const prefab = byId.get(i.prefabId);
        if (!prefab) return false;
        const localIds = new Set(prefab.entities.map((e) => e.localId));
        return i.overrides.every((o) => localIds.has(o.targetLocalId));
      });
    },
    {
      message:
        "every override `targetLocalId` must exist in the referenced prefab's entities",
    },
  )
  .refine(
    ({ prefabs }) => {
      const byId = new Map(prefabs.map((p) => [p.id, p]));
      const WHITE = 0,
        GRAY = 1,
        BLACK = 2;
      const color = new Map<string, number>();
      for (const p of prefabs) color.set(p.id, WHITE);
      function visit(id: string): boolean {
        const c = color.get(id);
        if (c === GRAY) return false;
        if (c === BLACK) return true;
        color.set(id, GRAY);
        const node = byId.get(id);
        if (node) {
          for (const e of node.entities) {
            if (e.nestedPrefabId && !visit(e.nestedPrefabId)) return false;
          }
        }
        color.set(id, BLACK);
        return true;
      }
      return prefabs.every((p) => visit(p.id));
    },
    { message: "nested-prefab graph must be acyclic" },
  );
export type PrefabManifest = z.infer<typeof PrefabManifestSchema>;

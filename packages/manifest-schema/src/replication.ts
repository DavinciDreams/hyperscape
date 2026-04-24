/**
 * Replication manifest schema.
 *
 * Section 13 of the World Studio AAA plan. Today all networking is
 * hand-coded per entity type. This manifest lets plugins declare
 * replicated state + events declaratively so the runtime can:
 *
 *   - Auto-generate delta snapshots (which fields changed this tick)
 *   - Filter by relevancy (only send to players who can see the entity)
 *   - Enforce authority (server-only writes vs. client-predict)
 *   - Generate typed client stubs for events (RPCs)
 *
 * A replication manifest is keyed by *component name* — the same
 * component names used by the ECS. Each component declares which
 * fields replicate + their cadence.
 *
 * Events complement state: server → client broadcasts, client →
 * server requests, and scoped peer-to-peer messages.
 */

import { z } from "zod";

/** Who writes this field. */
export const ReplicationAuthoritySchema = z.enum([
  "server",
  "client-owner",
  "client-any",
]);
export type ReplicationAuthority = z.infer<typeof ReplicationAuthoritySchema>;

/** Primitive field types the replicator can serialize without extra info. */
export const ReplicatedFieldKindSchema = z.enum([
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
]);
export type ReplicatedFieldKind = z.infer<typeof ReplicatedFieldKindSchema>;

/** Replication cadence — how aggressively to resend. */
export const ReplicationCadenceSchema = z.enum([
  "on-change",
  "interval",
  "always",
  "reliable-once",
]);
export type ReplicationCadence = z.infer<typeof ReplicationCadenceSchema>;

/** Field-level override for one replicated property. */
export const ReplicatedFieldSchema = z
  .object({
    name: z
      .string()
      .regex(
        /^[a-z][a-zA-Z0-9]*$/,
        "replicated field name must be lowerCamelCase ASCII identifier",
      ),
    kind: ReplicatedFieldKindSchema,
    /** Required iff `kind === "enum"` — the allowed string values. */
    enumValues: z.array(z.string().min(1)).optional(),
    authority: ReplicationAuthoritySchema.default("server"),
    cadence: ReplicationCadenceSchema.default("on-change"),
    /** Interval in ms when cadence === "interval" (default 100ms). */
    intervalMs: z.number().int().min(16).max(60000).default(100),
    /** Quantization bits for floats (0 = lossless). */
    bits: z.number().int().min(0).max(64).default(0),
    /** Do not replicate to observers who can't see the owner. */
    relevancyFiltered: z.boolean().default(true),
    description: z.string().default(""),
  })
  .refine(
    ({ kind, enumValues }) =>
      kind === "enum"
        ? Array.isArray(enumValues) && enumValues.length > 0
        : true,
    { message: "enum fields must supply a non-empty `enumValues` array" },
  )
  .refine(
    ({ kind, enumValues }) =>
      kind !== "enum" ? enumValues === undefined : true,
    { message: "`enumValues` only applies when kind === 'enum'" },
  );
export type ReplicatedField = z.infer<typeof ReplicatedFieldSchema>;

/** A component's entire replication surface. */
export const ReplicatedComponentSchema = z
  .object({
    component: z
      .string()
      .regex(/^[A-Z][A-Za-z0-9]*$/, "component name must be PascalCase"),
    description: z.string().default(""),
    fields: z.array(ReplicatedFieldSchema).min(1),
  })
  .refine(
    ({ fields }) => new Set(fields.map((f) => f.name)).size === fields.length,
    { message: "field names within a component must be unique" },
  );
export type ReplicatedComponent = z.infer<typeof ReplicatedComponentSchema>;

/** Event direction — who emits and who receives. */
export const EventDirectionSchema = z.enum([
  "server-to-all",
  "server-to-owner",
  "server-to-relevant",
  "client-to-server",
  "peer-to-peer",
]);
export type EventDirection = z.infer<typeof EventDirectionSchema>;

/** Event reliability — underlying transport guarantee. */
export const EventReliabilitySchema = z.enum([
  "reliable-ordered",
  "reliable-unordered",
  "unreliable-sequenced",
  "unreliable",
]);
export type EventReliability = z.infer<typeof EventReliabilitySchema>;

/** Parameter on a replicated event. Same primitive kinds as fields. */
export const ReplicatedEventParamSchema = z
  .object({
    name: z
      .string()
      .regex(
        /^[a-z][a-zA-Z0-9]*$/,
        "event param name must be lowerCamelCase ASCII identifier",
      ),
    kind: ReplicatedFieldKindSchema,
    enumValues: z.array(z.string().min(1)).optional(),
    required: z.boolean().default(true),
  })
  .refine(
    ({ kind, enumValues }) =>
      kind === "enum"
        ? Array.isArray(enumValues) && enumValues.length > 0
        : true,
    { message: "enum params must supply a non-empty `enumValues` array" },
  );
export type ReplicatedEventParam = z.infer<typeof ReplicatedEventParamSchema>;

export const ReplicatedEventSchema = z
  .object({
    /** Event id — snake_case dot-path. Same form as analytics events. */
    id: z
      .string()
      .regex(
        /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*$/,
        "event id must be dot-separated snake_case (`combat.damage_dealt`)",
      ),
    direction: EventDirectionSchema,
    reliability: EventReliabilitySchema.default("reliable-ordered"),
    params: z.array(ReplicatedEventParamSchema).default([]),
    /** Max events per sender per second — 0 = unlimited (dangerous on client-to-server). */
    rateLimitPerSec: z.number().int().min(0).max(1000).default(0),
    description: z.string().default(""),
  })
  .refine(
    ({ params }) => new Set(params.map((p) => p.name)).size === params.length,
    { message: "event param names must be unique" },
  );
export type ReplicatedEvent = z.infer<typeof ReplicatedEventSchema>;

export const ReplicationManifestSchema = z
  .object({
    components: z.array(ReplicatedComponentSchema).default([]),
    events: z.array(ReplicatedEventSchema).default([]),
  })
  .refine(
    ({ components }) =>
      new Set(components.map((c) => c.component)).size === components.length,
    { message: "component names must be unique across the manifest" },
  )
  .refine(
    ({ events }) => new Set(events.map((e) => e.id)).size === events.length,
    { message: "event ids must be unique across the manifest" },
  );
export type ReplicationManifest = z.infer<typeof ReplicationManifestSchema>;

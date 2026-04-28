/**
 * Pure helper that walks a Zod schema's top-level shape and produces
 * a `WidgetPropSummary[]`. Intentionally conservative: anything the
 * helper can't classify becomes `type: "unknown"` rather than
 * throwing. Callers that need full type fidelity should query the
 * underlying schema directly.
 *
 * Why a helper, not raw Zod introspection: Zod's internal types
 * change between versions, and several of the catalog's consumers
 * (AI agents, JSON dumps) only need a *summary* — name, optionality,
 * a coarse type label, an enum value list when applicable, and a
 * `.describe(...)` blurb. This module pins that summary contract so
 * the rest of the catalog code doesn't depend on Zod internals.
 */

import { z } from "zod";

import type { WidgetPropSummary } from "./types";

/**
 * Given a Zod schema (typically `widget.propsSchema`), return a
 * summary of every top-level field. Empty array when the schema
 * isn't a `z.object` at the root.
 */
export function extractPropSummary(
  schema: z.ZodTypeAny,
): ReadonlyArray<WidgetPropSummary> {
  const obj = unwrapToObject(schema);
  if (!obj) return [];
  const shape = obj.shape;
  if (!shape || typeof shape !== "object") return [];
  const entries: WidgetPropSummary[] = [];
  for (const [name, fieldSchema] of Object.entries(shape)) {
    if (!fieldSchema || typeof fieldSchema !== "object") continue;
    entries.push(summarizeField(name, fieldSchema as z.ZodTypeAny));
  }
  return entries;
}

/**
 * Walk through `.optional()`, `.default()`, `.nullable()` wrappers
 * to find the first `z.object` we can introspect. Returns `null`
 * when no object root is reachable.
 */
function unwrapToObject(
  schema: z.ZodTypeAny,
): z.ZodObject<Record<string, z.ZodTypeAny>> | null {
  let cursor: z.ZodTypeAny = schema;
  // Cap iterations defensively; Zod schema chains are typically 1-2
  // wrappers deep, but a runaway cyclic ref shouldn't hang.
  for (let i = 0; i < 16; i++) {
    if (isZodObject(cursor)) return cursor;
    const inner = unwrapOnce(cursor);
    if (!inner || inner === cursor) return null;
    cursor = inner;
  }
  return null;
}

function isZodObject(
  schema: z.ZodTypeAny,
): schema is z.ZodObject<Record<string, z.ZodTypeAny>> {
  return getDef(schema)?.type === "object";
}

function summarizeField(name: string, field: z.ZodTypeAny): WidgetPropSummary {
  const description = getDescription(field) ?? "";
  const optional = isOptionalOrDefaulted(field);
  const inner = unwrapToInnerType(field);
  const innerDef = getDef(inner);
  const innerType = innerDef?.type;

  if (innerType === "enum") {
    const values = (
      innerDef?.entries ? Object.values(innerDef.entries) : []
    ) as ReadonlyArray<string>;
    return {
      name,
      type: "enum",
      enumValues: values.filter((v) => typeof v === "string"),
      optional,
      description,
    };
  }
  if (innerType === "string") {
    return { name, type: "string", optional, description };
  }
  if (innerType === "number") {
    return { name, type: "number", optional, description };
  }
  if (innerType === "boolean") {
    return { name, type: "boolean", optional, description };
  }
  if (innerType === "array") {
    return { name, type: "array", optional, description };
  }
  if (innerType === "object" || innerType === "record") {
    return { name, type: "object", optional, description };
  }
  if (innerType === "union") {
    return { name, type: "union", optional, description };
  }
  return { name, type: "unknown", optional, description };
}

/**
 * Strip the outermost `.optional()` / `.default()` / `.nullable()` /
 * `.readonly()` wrapper if present. Returns the same schema if none.
 */
function unwrapOnce(schema: z.ZodTypeAny): z.ZodTypeAny | null {
  const def = getDef(schema);
  if (!def) return null;
  // Zod stores the wrapped schema under different keys depending on
  // the wrapper type. Probe the common ones; bail otherwise.
  const inner =
    (def.innerType as z.ZodTypeAny | undefined) ??
    (def.schema as z.ZodTypeAny | undefined) ??
    null;
  return inner;
}

/**
 * Walk every wrapper to find the underlying primitive/composite.
 * Used for the type-label summary so `optional + default + enum`
 * still classifies as `enum`.
 */
function unwrapToInnerType(schema: z.ZodTypeAny): z.ZodTypeAny {
  let cursor: z.ZodTypeAny = schema;
  for (let i = 0; i < 16; i++) {
    const def = getDef(cursor);
    const t = def?.type;
    if (
      t === "string" ||
      t === "number" ||
      t === "boolean" ||
      t === "enum" ||
      t === "array" ||
      t === "object" ||
      t === "record" ||
      t === "union"
    ) {
      return cursor;
    }
    const inner = unwrapOnce(cursor);
    if (!inner || inner === cursor) return cursor;
    cursor = inner;
  }
  return cursor;
}

/**
 * Detect whether a field is `.optional()` or has a `.default(...)`.
 * Either means the author can omit the prop.
 */
function isOptionalOrDefaulted(schema: z.ZodTypeAny): boolean {
  const def = getDef(schema);
  if (!def) return false;
  const t = def.type;
  if (t === "optional" || t === "default" || t === "nullable") return true;
  // Recurse one level — in some Zod versions a `.default()` wraps
  // an `.optional()` or vice versa, so we walk one step.
  const inner = unwrapOnce(schema);
  if (!inner || inner === schema) return false;
  const innerDef = getDef(inner);
  return (
    innerDef?.type === "optional" ||
    innerDef?.type === "default" ||
    innerDef?.type === "nullable"
  );
}

/**
 * Pull the `.describe(...)` doc string from a schema, walking
 * through wrappers. Returns null when no description is set.
 *
 * Zod 4 exposes `description` as a property on the schema instance
 * itself (not inside `_def`); older Zods stored it on `_def`. The
 * helper checks both, walking wrappers when the outer level is
 * undecorated.
 */
function getDescription(schema: z.ZodTypeAny): string | null {
  let cursor: z.ZodTypeAny = schema;
  for (let i = 0; i < 16; i++) {
    // Zod 4: schema.description on the instance
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const direct = (cursor as any).description;
    if (typeof direct === "string" && direct.length > 0) return direct;
    // Older Zod: _def.description
    const def = getDef(cursor);
    const desc = def?.description;
    if (typeof desc === "string" && desc.length > 0) return desc;
    const inner = unwrapOnce(cursor);
    if (!inner || inner === cursor) return null;
    cursor = inner;
  }
  return null;
}

/**
 * Reach into Zod's `_def` slot. Zod intentionally doesn't expose
 * this in its public surface, but the catalog needs structural
 * introspection that the public API doesn't offer. Typed as
 * `Record<string, unknown>` to keep the call sites honest.
 */
function getDef(schema: z.ZodTypeAny): Record<string, unknown> | null {
  if (!schema || typeof schema !== "object") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const def = (schema as any)._def ?? (schema as any).def;
  if (!def || typeof def !== "object") return null;
  return def as Record<string, unknown>;
}

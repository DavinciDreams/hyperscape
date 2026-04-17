/**
 * zodSchemaFromFields — Converts FieldSchema[] from a GameModule into a Zod
 * object schema for use with Vercel AI SDK `generateObject` structured output.
 *
 * Mapping:
 *   string    → z.string()
 *   number    → z.number().min().max()
 *   slider    → z.number().min().max()
 *   boolean   → z.boolean()
 *   select    → z.enum([...options])
 *   position  → z.object({ x: z.number(), y: z.number(), z: z.number() })
 *   rotation  → z.number().min(0).max(360)
 *   color     → z.string().regex(/#[0-9a-fA-F]{6}/)
 *   tags      → z.array(z.string())
 *   polygon   → z.array(z.object({ x: z.number(), z: z.number() }))
 *   waypoints → z.array(z.object({ x: z.number(), y: z.number(), z: z.number() }))
 *   json      → z.record(z.unknown())
 *   entityId  → z.string()
 */

import { z } from "zod";
import type { FieldSchema } from "../../src/gameModules/GameModule";

// ---------------------------------------------------------------------------
// Single field → Zod schema
// ---------------------------------------------------------------------------

function fieldToZod(field: FieldSchema): z.ZodTypeAny {
  switch (field.type) {
    case "string":
      return z.string().describe(field.description ?? field.label);

    case "number": {
      let num = z.number();
      if (field.config?.min !== undefined) num = num.min(field.config.min);
      if (field.config?.max !== undefined) num = num.max(field.config.max);
      return num.describe(field.description ?? field.label);
    }

    case "slider": {
      let slider = z.number();
      if (field.config?.min !== undefined)
        slider = slider.min(field.config.min);
      if (field.config?.max !== undefined)
        slider = slider.max(field.config.max);
      return slider.describe(field.description ?? field.label);
    }

    case "boolean":
      return z.boolean().describe(field.description ?? field.label);

    case "select": {
      const options = field.config?.options;
      if (options && options.length > 0) {
        const values = options.map((o) => o.value);
        return z
          .enum(values as [string, ...string[]])
          .describe(field.description ?? field.label);
      }
      return z.string().describe(field.description ?? field.label);
    }

    case "position":
      return z
        .object({
          x: z.number(),
          y: z.number(),
          z: z.number(),
        })
        .describe(field.description ?? `${field.label} (world position)`);

    case "rotation":
      return z
        .number()
        .min(0)
        .max(360)
        .describe(field.description ?? `${field.label} (degrees)`);

    case "color":
      return z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/)
        .describe(field.description ?? `${field.label} (hex color)`);

    case "tags":
      return z.array(z.string()).describe(field.description ?? field.label);

    case "polygon":
      return z
        .array(z.object({ x: z.number(), z: z.number() }))
        .describe(field.description ?? `${field.label} (polygon vertices)`);

    case "waypoints":
      return z
        .array(z.object({ x: z.number(), y: z.number(), z: z.number() }))
        .describe(field.description ?? `${field.label} (waypoint list)`);

    case "json":
      return z
        .record(z.string(), z.unknown())
        .describe(field.description ?? field.label);

    case "entityId":
      return z
        .string()
        .describe(
          field.description ??
            `${field.label} (reference to ${field.config?.referenceType ?? "entity"})`,
        );

    default:
      return z.string().describe(field.label);
  }
}

// ---------------------------------------------------------------------------
// Full field list → Zod object schema
// ---------------------------------------------------------------------------

/**
 * Convert an array of FieldSchema into a Zod object schema.
 * Read-only fields are excluded. Optional fields get `.optional()`.
 */
export function zodSchemaFromFields(
  fields: FieldSchema[],
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const field of fields) {
    // Skip read-only fields — they're display-only
    if (field.readOnly) continue;

    let schema = fieldToZod(field);
    if (!field.required) {
      schema = schema.optional();
    }
    shape[field.key] = schema;
  }

  return z.object(shape);
}

/**
 * Build a Zod schema for a complete entity of a given type,
 * including an `id` field and all schema-defined fields.
 */
export function zodEntitySchema(
  fields: FieldSchema[],
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const base = zodSchemaFromFields(fields);
  return base.extend({
    id: z.string().describe("Unique entity identifier"),
  });
}

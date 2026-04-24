/**
 * Widget-props introspection.
 *
 * Given a widget's Zod `propsSchema`, produce a flat list of
 * `UIPropField` descriptors that a property-editor UI can render as a
 * form. This parallels the `FieldSchema` pattern used by
 * `SchemaPropertyEditor` for game entities — same idea, different
 * origin (Zod schema vs. hand-declared `EntityTypeSchema`).
 *
 * We walk the JSON Schema emitted by `z.toJSONSchema` rather than
 * Zod's internal `_def` nodes so this stays forward-compatible with
 * Zod minor-version updates. JSON Schema is the public, stable
 * projection.
 */

import { z } from "zod";
import type { Widget } from "./widget";

export const UI_PROP_FIELD_TYPES = [
  "text",
  "number",
  "slider",
  "integer",
  "boolean",
  "enum",
  "json", // fallback for nested objects / arrays / things we don't model yet
] as const;

export type UIPropFieldType = (typeof UI_PROP_FIELD_TYPES)[number];

export interface UIPropField {
  /** Prop name on the widget. */
  key: string;
  /** The concrete UI control to render. */
  type: UIPropFieldType;
  /** Whether this prop is required by the schema. */
  required: boolean;
  /** Numeric bounds, if the schema declared them. */
  min?: number;
  max?: number;
  /** Integer-only numeric? */
  integer?: boolean;
  /** Enum choices, for `type === "enum"`. */
  options?: readonly string[];
  /** Human-readable label — defaults to `key`. Override via
   *  `.describe()` on the Zod leaf, or by passing `labelOverrides`. */
  label: string;
  /** Description / tooltip, pulled from `.describe()`. */
  description?: string;
}

interface InspectOptions {
  /** Override auto-generated labels per key. */
  labelOverrides?: Readonly<Record<string, string>>;
  /**
   * When true and both `min` and `max` are present on a number, render
   * as a slider instead of a plain number input. Default `true`.
   */
  useSliderWhenBounded?: boolean;
}

// JSON Schema leaf as emitted by Zod 4 `toJSONSchema`. We don't import
// an external JSON Schema types package — this is a minimal shape
// matching what Zod 4 actually emits.
interface JsonLeaf {
  type?: string | string[];
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  description?: string;
  // nested / composite markers — we treat anything we don't recognize
  // as `json` fallback.
  properties?: Record<string, unknown>;
  items?: unknown;
  anyOf?: unknown[];
  oneOf?: unknown[];
  allOf?: unknown[];
}

/**
 * Introspect a Zod object schema into a flat `UIPropField[]`.
 *
 * Non-object schemas, nested objects, and schemas with composite
 * keywords (`anyOf`, etc.) emit a `type: "json"` fallback rather than
 * throwing, so the caller can still render an editable JSON textarea.
 */
export function introspectPropsSchema(
  schema: z.ZodType<Record<string, unknown>>,
  options: InspectOptions = {},
): UIPropField[] {
  const useSlider = options.useSliderWhenBounded ?? true;
  const overrides = options.labelOverrides ?? {};

  const json = z.toJSONSchema(schema) as {
    type?: string;
    properties?: Record<string, JsonLeaf>;
    required?: string[];
  };

  if (json.type !== "object" || !json.properties) {
    return [];
  }

  const required = new Set(json.required ?? []);
  const fields: UIPropField[] = [];

  for (const [key, leaf] of Object.entries(json.properties)) {
    const label = overrides[key] ?? humanizeKey(key);
    const description =
      typeof leaf.description === "string" ? leaf.description : undefined;
    const isRequired = required.has(key);

    // enum
    if (
      Array.isArray(leaf.enum) &&
      leaf.enum.every((v) => typeof v === "string")
    ) {
      fields.push({
        key,
        type: "enum",
        required: isRequired,
        options: leaf.enum as readonly string[],
        label,
        description,
      });
      continue;
    }

    const leafType = Array.isArray(leaf.type) ? leaf.type[0] : leaf.type;

    if (leafType === "boolean") {
      fields.push({
        key,
        type: "boolean",
        required: isRequired,
        label,
        description,
      });
      continue;
    }

    if (leafType === "number" || leafType === "integer") {
      const isInt = leafType === "integer";
      // Zod 4 emits ±Number.MAX_SAFE_INTEGER as synthetic bounds on
      // integer types to express the JS safe-integer range. Those are
      // not user-declared and should not promote a field to a slider.
      const userMin = isSyntheticBound(leaf.minimum) ? undefined : leaf.minimum;
      const userMax = isSyntheticBound(leaf.maximum) ? undefined : leaf.maximum;
      const bounded = userMin !== undefined && userMax !== undefined;
      fields.push({
        key,
        type: useSlider && bounded ? "slider" : isInt ? "integer" : "number",
        required: isRequired,
        min: userMin,
        max: userMax,
        integer: isInt || undefined,
        label,
        description,
      });
      continue;
    }

    if (leafType === "string") {
      fields.push({
        key,
        type: "text",
        required: isRequired,
        label,
        description,
      });
      continue;
    }

    // Anything else — nested object, array, composite — falls back to
    // a JSON editor. The editor panel can special-case these later.
    fields.push({
      key,
      type: "json",
      required: isRequired,
      label,
      description,
    });
  }

  return fields;
}

/**
 * Convenience wrapper: introspect the props schema of a full Widget.
 */
export function inspectWidgetProps(
  widget: Widget<Record<string, unknown>>,
  options: InspectOptions = {},
): UIPropField[] {
  return introspectPropsSchema(widget.propsSchema, options);
}

// ----------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------

/**
 * Zod 4 emits ±Number.MAX_SAFE_INTEGER as synthetic bounds on `.int()`
 * numbers. We treat those as "no bound" so integer fields don't falsely
 * appear slider-worthy.
 */
function isSyntheticBound(v: number | undefined): boolean {
  if (v === undefined) return false;
  return v === Number.MAX_SAFE_INTEGER || v === -Number.MAX_SAFE_INTEGER;
}

/** `showNumeric` → `Show Numeric`, `maxWidth` → `Max Width`. */
function humanizeKey(key: string): string {
  const withSpaces = key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .trim();
  if (!withSpaces) return key;
  return withSpaces.replace(/\b\w/g, (c) => c.toUpperCase());
}

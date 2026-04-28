/**
 * Code emitters. Pure helpers that turn a `WidgetSpec` / `PropSpec`
 * into a string of TypeScript source. Each emitter is a one-purpose
 * function so it can be unit-tested in isolation and reused by
 * future templates.
 */

import type { PropSpec, WidgetSpec } from "./types.js";

/**
 * `FooBar` → `fooBar`. Used for variable / registration names.
 */
export function camelize(pascal: string): string {
  if (pascal.length === 0) return pascal;
  return pascal[0]!.toLowerCase() + pascal.slice(1);
}

/**
 * Encode a value as a TypeScript literal expression.
 *
 *   "hello"       → '"hello"'
 *   42            → '42'
 *   true          → 'true'
 */
export function emitLiteral(value: string | number | boolean): string {
  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "number":
      return String(value);
    case "boolean":
      return value ? "true" : "false";
    default:
      throw new Error(`emitLiteral: unsupported value type ${typeof value}`);
  }
}

/**
 * Emit one Zod schema field expression for a prop.
 *
 *   string with default "x"   → 'z.string().default("x")'
 *   enum of red/green/blue    → 'z.enum(["red","green","blue"]).default("red")'
 */
export function emitZodField(prop: PropSpec): string {
  switch (prop.type) {
    case "string":
      return chainDescribe(
        `z.string().default(${emitLiteral(prop.defaultValue as string)})`,
        prop.description,
      );
    case "number":
      return chainDescribe(
        `z.number().default(${emitLiteral(prop.defaultValue as number)})`,
        prop.description,
      );
    case "boolean":
      return chainDescribe(
        `z.boolean().default(${emitLiteral(prop.defaultValue as boolean)})`,
        prop.description,
      );
    case "enum": {
      const values = prop.enumValues ?? [];
      const valuesLiteral = `[${values.map((v) => JSON.stringify(v)).join(", ")}]`;
      return chainDescribe(
        `z.enum(${valuesLiteral}).default(${emitLiteral(prop.defaultValue as string)})`,
        prop.description,
      );
    }
  }
}

function chainDescribe(zodExpr: string, description?: string): string {
  if (!description || description.length === 0) return zodExpr;
  return `${zodExpr}.describe(${JSON.stringify(description)})`;
}

/**
 * Emit the body of `z.object({...})` — one line per prop.
 *
 * Includes a JSDoc comment when the prop has a description so the
 * generated source reads well to humans.
 */
export function emitPropsSchemaBody(spec: WidgetSpec): string {
  if (spec.props.length === 0) return "";
  const lines: string[] = [];
  for (const prop of spec.props) {
    if (prop.description && prop.description.length > 0) {
      lines.push(`  /** ${prop.description} */`);
    }
    lines.push(`  ${prop.name}: ${emitZodField(prop)},`);
  }
  return lines.join("\n");
}

/**
 * Emit the body of the `defaultProps` object literal — one entry
 * per prop. Defaults double as the test fixture for "props parse".
 */
export function emitDefaultPropsBody(spec: WidgetSpec): string {
  if (spec.props.length === 0) return "";
  return spec.props
    .map((p) => `    ${p.name}: ${emitLiteral(p.defaultValue)},`)
    .join("\n");
}

/**
 * Emit a comma-separated destructure list like `{ label, count }`
 * for the React component signature. Returns `{}` when there are
 * no props.
 */
export function emitDestructureList(spec: WidgetSpec): string {
  if (spec.props.length === 0) return "{}";
  return `{ ${spec.props.map((p) => p.name).join(", ")} }`;
}

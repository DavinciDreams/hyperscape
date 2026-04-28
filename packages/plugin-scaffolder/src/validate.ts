/**
 * Widget-spec validator.
 *
 * Pure function: spec in, list of issues out. The scaffolder calls
 * this before any code generation so callers see a complete error
 * report rather than the first failure.
 */

import type { PropSpec, WidgetSpec } from "./types";

export interface ScaffoldValidationIssue {
  /** Dotted path to the bad field, e.g. `"props[2].defaultValue"`. */
  readonly path: string;
  /** Human-readable explanation. */
  readonly message: string;
}

export interface ScaffoldValidationResult {
  readonly ok: boolean;
  readonly issues: ReadonlyArray<ScaffoldValidationIssue>;
}

const PASCAL_NAME_RE = /^[A-Z][A-Za-z0-9]+$/;
const MANIFEST_ID_RE = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9-]*)+$/;
const PROP_NAME_RE = /^[a-z][A-Za-z0-9]*$/;

const SCAFFOLD_PROP_TYPES = new Set([
  "string",
  "number",
  "boolean",
  "enum",
] as const);

export function validateWidgetSpec(spec: WidgetSpec): ScaffoldValidationResult {
  const issues: ScaffoldValidationIssue[] = [];

  if (!PASCAL_NAME_RE.test(spec.name)) {
    issues.push({
      path: "name",
      message: `must be PascalCase (got ${JSON.stringify(spec.name)})`,
    });
  }

  if (!MANIFEST_ID_RE.test(spec.manifestId)) {
    issues.push({
      path: "manifestId",
      message: `must look like "com.<org>.<plugin>.<name>" (got ${JSON.stringify(
        spec.manifestId,
      )})`,
    });
  }

  if (!Number.isInteger(spec.defaultSize.width) || spec.defaultSize.width < 1) {
    issues.push({
      path: "defaultSize.width",
      message: `must be a positive integer (got ${spec.defaultSize.width})`,
    });
  }
  if (
    !Number.isInteger(spec.defaultSize.height) ||
    spec.defaultSize.height < 1
  ) {
    issues.push({
      path: "defaultSize.height",
      message: `must be a positive integer (got ${spec.defaultSize.height})`,
    });
  }

  const seen = new Set<string>();
  spec.props.forEach((prop, idx) => {
    const path = `props[${idx}]`;
    issues.push(...validateProp(prop, path));
    if (seen.has(prop.name)) {
      issues.push({
        path: `${path}.name`,
        message: `duplicate prop name ${JSON.stringify(prop.name)}`,
      });
    }
    seen.add(prop.name);
  });

  return { ok: issues.length === 0, issues };
}

function validateProp(prop: PropSpec, path: string): ScaffoldValidationIssue[] {
  const issues: ScaffoldValidationIssue[] = [];

  if (!PROP_NAME_RE.test(prop.name)) {
    issues.push({
      path: `${path}.name`,
      message: `must be camelCase (got ${JSON.stringify(prop.name)})`,
    });
  }

  if (!SCAFFOLD_PROP_TYPES.has(prop.type)) {
    issues.push({
      path: `${path}.type`,
      message: `unknown prop type ${JSON.stringify(prop.type)}`,
    });
    return issues;
  }

  switch (prop.type) {
    case "string":
      if (typeof prop.defaultValue !== "string") {
        issues.push({
          path: `${path}.defaultValue`,
          message: `string prop default must be a string (got ${typeof prop.defaultValue})`,
        });
      }
      break;
    case "number":
      if (typeof prop.defaultValue !== "number") {
        issues.push({
          path: `${path}.defaultValue`,
          message: `number prop default must be a number (got ${typeof prop.defaultValue})`,
        });
      } else if (!Number.isFinite(prop.defaultValue)) {
        issues.push({
          path: `${path}.defaultValue`,
          message: `number prop default must be finite`,
        });
      }
      break;
    case "boolean":
      if (typeof prop.defaultValue !== "boolean") {
        issues.push({
          path: `${path}.defaultValue`,
          message: `boolean prop default must be a boolean (got ${typeof prop.defaultValue})`,
        });
      }
      break;
    case "enum": {
      const values = prop.enumValues ?? [];
      if (values.length === 0) {
        issues.push({
          path: `${path}.enumValues`,
          message: `enum prop must declare at least one value`,
        });
      }
      if (typeof prop.defaultValue !== "string") {
        issues.push({
          path: `${path}.defaultValue`,
          message: `enum prop default must be a string (got ${typeof prop.defaultValue})`,
        });
      } else if (values.length > 0 && !values.includes(prop.defaultValue)) {
        issues.push({
          path: `${path}.defaultValue`,
          message: `default ${JSON.stringify(
            prop.defaultValue,
          )} must be one of enumValues ${JSON.stringify(values)}`,
        });
      }
      const dupe = new Set<string>();
      values.forEach((v, i) => {
        if (typeof v !== "string" || v.length === 0) {
          issues.push({
            path: `${path}.enumValues[${i}]`,
            message: `enum value must be a non-empty string`,
          });
        }
        if (dupe.has(v)) {
          issues.push({
            path: `${path}.enumValues[${i}]`,
            message: `duplicate enum value ${JSON.stringify(v)}`,
          });
        }
        dupe.add(v);
      });
      break;
    }
  }

  return issues;
}

/**
 * Throws if the spec is invalid. Useful for callers that want
 * fail-fast semantics; otherwise call `validateWidgetSpec` for the
 * full issue list.
 */
export function assertWidgetSpec(spec: WidgetSpec): void {
  const result = validateWidgetSpec(spec);
  if (result.ok) return;
  const lines = result.issues
    .map((i) => `  ${i.path}: ${i.message}`)
    .join("\n");
  throw new Error(`Invalid WidgetSpec:\n${lines}`);
}

/**
 * Shared helpers for action handlers — option extraction, error
 * surfacing, etc.
 *
 * ElizaOS may pre-extract action parameters into `options.parameters`,
 * but the runtime is permissive — it might also pass raw values, or
 * nothing at all. These helpers normalize the shapes so handlers
 * stay short and intent-focused.
 */

import type { HandlerOptions } from "@elizaos/core";

type Options = HandlerOptions | Record<string, unknown> | undefined;

export function extractCategoryFromOptions(opts: Options): string | undefined {
  return readStringField(opts, "category");
}

export function extractIdFromOptions(opts: Options): string | undefined {
  return readStringField(opts, "id");
}

export function extractQueryFromOptions(opts: Options): string | undefined {
  return readStringField(opts, "query");
}

export function extractBooleanFromOptions(
  opts: Options,
  name: string,
  defaultValue = false,
): boolean {
  const params = (opts as { parameters?: Record<string, unknown> } | undefined)
    ?.parameters;
  const v =
    params?.[name] ?? (opts as Record<string, unknown> | undefined)?.[name];
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    if (v === "" || v === "false" || v === "0") return false;
    return true;
  }
  return defaultValue;
}

export function readStringField(
  opts: Options,
  name: string,
): string | undefined {
  const params = (opts as { parameters?: Record<string, unknown> } | undefined)
    ?.parameters;
  const fromParams = params?.[name];
  if (typeof fromParams === "string" && fromParams.length > 0)
    return fromParams;
  const direct = (opts as Record<string, unknown> | undefined)?.[name];
  if (typeof direct === "string" && direct.length > 0) return direct;
  return undefined;
}

export function readObjectField(
  opts: Options,
  name: string,
): Record<string, unknown> | undefined {
  const params = (opts as { parameters?: Record<string, unknown> } | undefined)
    ?.parameters;
  const fromParams = params?.[name];
  if (
    fromParams &&
    typeof fromParams === "object" &&
    !Array.isArray(fromParams)
  ) {
    return fromParams as Record<string, unknown>;
  }
  const direct = (opts as Record<string, unknown> | undefined)?.[name];
  if (direct && typeof direct === "object" && !Array.isArray(direct)) {
    return direct as Record<string, unknown>;
  }
  return undefined;
}

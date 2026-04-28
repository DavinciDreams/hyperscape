/**
 * Catalog loader. Wraps the filesystem read of `catalog.json`
 * produced by `@hyperforge/widget-catalog`'s `build:catalog`
 * script. Pure-data file in, validated `StaticCatalogDocument` out.
 *
 * The CLI accepts an explicit `--catalog=path`; if absent it
 * resolves the default workspace location relative to the cwd. If
 * the file isn't there, the caller (the command) returns an
 * IO-error `CommandResult` with a helpful pointer to
 * `bun run --filter @hyperforge/widget-catalog build:catalog`.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { StaticCatalogDocument } from "@hyperforge/widget-catalog";

const DEFAULT_RELATIVE = "packages/widget-catalog/dist/catalog.json";

export class CatalogNotFoundError extends Error {
  readonly attemptedPath: string;
  constructor(attemptedPath: string) {
    super(
      `Catalog not found at ${attemptedPath}. ` +
        `Run \`bun run --filter @hyperforge/widget-catalog build:catalog\` ` +
        `or pass --catalog=<path>.`,
    );
    this.name = "CatalogNotFoundError";
    this.attemptedPath = attemptedPath;
  }
}

export class CatalogParseError extends Error {
  constructor(path: string, cause: unknown) {
    const causeMsg = cause instanceof Error ? cause.message : String(cause);
    super(`Catalog at ${path} is not valid JSON: ${causeMsg}`);
    this.name = "CatalogParseError";
  }
}

export interface LoadCatalogOptions {
  /** Absolute or cwd-relative path. Falls back to the default. */
  readonly path?: string;
  /** Working directory used to resolve the default path. Defaults to `process.cwd()`. */
  readonly cwd?: string;
}

/**
 * Resolve the path the catalog *would* be read from, without
 * actually reading. Useful for diagnostics and tests.
 */
export function resolveCatalogPath(options: LoadCatalogOptions = {}): string {
  const cwd = options.cwd ?? process.cwd();
  if (options.path) return resolve(cwd, options.path);
  return resolve(cwd, DEFAULT_RELATIVE);
}

/**
 * Read + parse the catalog. Throws `CatalogNotFoundError` if the
 * file doesn't exist; `CatalogParseError` if it can't be parsed
 * as JSON.
 */
export function loadCatalog(
  options: LoadCatalogOptions = {},
): StaticCatalogDocument {
  const path = resolveCatalogPath(options);
  if (!existsSync(path)) {
    throw new CatalogNotFoundError(path);
  }
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (e) {
    throw new CatalogParseError(path, e);
  }
  try {
    return JSON.parse(raw) as StaticCatalogDocument;
  } catch (e) {
    throw new CatalogParseError(path, e);
  }
}

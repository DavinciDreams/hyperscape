/**
 * Plugin catalog — iterate a directory of plugin packages, load each,
 * aggregate successes and failures into a single result.
 *
 * The Plugin Browser UI needs to show BOTH loaded plugins and the
 * ones that failed to load (with their error) so authors can see and
 * diagnose broken packages. That means this layer must NEVER throw
 * on an individual plugin failure — it collects them into a parallel
 * `failed[]` array keyed by `baseDir`.
 *
 * What this module DOES:
 *   - Lists the direct children of `pluginsDir`
 *   - For each child that is a directory, checks for a manifest file
 *     (`plugin.json` by default)
 *   - Silently skips children without a manifest (not a failure — not
 *     every folder in a monorepo is a plugin)
 *   - Delegates to `loadPluginPackage` for each qualifying subdir
 *   - Captures any per-package error into `failed[]` keyed by baseDir
 *
 * What this module does NOT do:
 *   - Resolve dependency graphs (that's the host-side
 *     `PluginLoader`'s job)
 *   - Enable / disable plugins (that's the host's lifecycle, not the
 *     catalog's)
 *   - Recurse — only direct children are inspected. Nested plugin
 *     monorepos should point this at the inner directory.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";

import { loadPluginPackage, type LoadPluginPackageOptions } from "./package.js";
import type { LoadedPluginModule } from "./loader.js";

/** Default manifest filename — matches `loadPluginPackage` default. */
const DEFAULT_MANIFEST_FILENAME = "plugin.json";

/**
 * Options threaded through `loadPluginCatalog`. Extends the per-package
 * options so hosts can configure manifest filename / API range /
 * importer once and have it apply to every plugin in the catalog.
 */
export interface LoadPluginCatalogOptions extends LoadPluginPackageOptions {
  /**
   * Override the directory lister. Takes the absolute path of the
   * catalog root and returns the list of child directory basenames
   * (no paths, no non-directory entries).
   */
  readonly directoryLister?: (pluginsDir: string) => Promise<string[]>;

  /**
   * Override for the "does this file exist" check used to detect
   * packages that carry a manifest. Receives the absolute manifest
   * path. Default uses `fs.access(path)`.
   */
  readonly manifestExistsCheck?: (manifestPath: string) => Promise<boolean>;
}

/** A single per-package failure inside the catalog result. */
export interface CatalogLoadFailure {
  readonly baseDir: string;
  readonly error: unknown;
}

/** Aggregate result of `loadPluginCatalog`. */
export interface PluginCatalogResult<TContext = unknown> {
  readonly loaded: ReadonlyArray<LoadedPluginModule<TContext>>;
  readonly failed: ReadonlyArray<CatalogLoadFailure>;
}

/** Error thrown when the catalog directory itself cannot be listed. */
export class PluginCatalogReadError extends Error {
  constructor(
    public readonly pluginsDir: string,
    public readonly cause: unknown,
  ) {
    super(
      `Failed to enumerate plugin catalog at ${pluginsDir}: ` +
        (cause instanceof Error ? cause.message : String(cause)),
    );
    this.name = "PluginCatalogReadError";
  }
}

/**
 * Scan `pluginsDir` for plugin packages and load each.
 *
 * Returns a `{ loaded, failed }` aggregate — never throws on an
 * individual plugin failure. Throws `PluginCatalogReadError` only when
 * the catalog directory itself can't be read.
 *
 * Result ordering matches directory-listing order so hosts can preserve
 * a stable Plugin Browser sort by filename.
 */
export async function loadPluginCatalog<TContext = unknown>(
  pluginsDir: string,
  opts: LoadPluginCatalogOptions = {},
): Promise<PluginCatalogResult<TContext>> {
  const manifestFilename = opts.manifestFilename ?? DEFAULT_MANIFEST_FILENAME;

  // Step 1 — enumerate the catalog root. A read failure here is fatal
  // (the whole catalog can't be loaded). Per-package failures are
  // collected in step 2.
  let basenames: string[];
  try {
    const lister = opts.directoryLister ?? defaultDirectoryLister;
    basenames = await lister(pluginsDir);
  } catch (cause) {
    throw new PluginCatalogReadError(pluginsDir, cause);
  }

  const loaded: Array<LoadedPluginModule<TContext>> = [];
  const failed: CatalogLoadFailure[] = [];

  // Step 2 — attempt each subdir. Preserve listing order so Plugin
  // Browser's UI can stabilize sort-by-dirname without re-sorting.
  for (const basename of basenames) {
    const baseDir = path.join(pluginsDir, basename);
    const manifestPath = path.join(baseDir, manifestFilename);

    // Silently skip subdirs without a manifest — they aren't plugins.
    // A package that HAS plugin.json but fails to load IS a failure.
    const exists = await (
      opts.manifestExistsCheck ?? defaultManifestExistsCheck
    )(manifestPath);
    if (!exists) continue;

    try {
      const module = await loadPluginPackage<TContext>(baseDir, {
        hostApiRange: opts.hostApiRange,
        manifestFilename: opts.manifestFilename,
        factoryExport: opts.factoryExport,
        importer: opts.importer,
        manifestLoader: opts.manifestLoader,
      });
      loaded.push(module);
    } catch (error) {
      failed.push({ baseDir, error });
    }
  }

  return { loaded, failed };
}

/** Default `fs.readdir`-based lister — returns basenames of dir children only. */
async function defaultDirectoryLister(pluginsDir: string): Promise<string[]> {
  const entries = await fs.readdir(pluginsDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
    .map((entry) => entry.name);
}

/** Default existence check — `fs.access(manifestPath)` resolves iff accessible. */
async function defaultManifestExistsCheck(
  manifestPath: string,
): Promise<boolean> {
  try {
    await fs.access(manifestPath);
    return true;
  } catch {
    return false;
  }
}

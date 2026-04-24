/**
 * Host-side plugin package loader — the one-call entry point.
 *
 * Given just an absolute `baseDir` pointing at a plugin package root
 * (the directory containing `plugin.json`), this chains:
 *
 *   1. Read `plugin.json` from disk.
 *   2. Parse + validate via `PluginManifestSchema`.
 *   3. Optionally gate on the host's supported `hyperforgeApi` range
 *      via `satisfiesPluginVersionRange`.
 *   4. Delegate to `loadPluginFromManifest` to import the entry module
 *      and extract the `PluginFactory`.
 *
 * Hosts (or plugin catalogs) call this once per plugin package; the
 * returned `{ manifest, factory }` pair then feeds into
 * `@hyperforge/shared`'s `PluginHost` / `PluginLoader` runtime (or any
 * structurally-compatible host).
 *
 * All three failure modes are surfaced through typed errors so the
 * Plugin Browser can present actionable diagnostics:
 *   - `PluginManifestReadError` — couldn't read/parse the JSON file
 *   - `PluginManifestValidationError` — JSON parsed but schema rejected
 *   - `PluginApiIncompatibleError` — manifest.hyperforgeApi doesn't
 *     satisfy the host's range
 *
 * The factory-resolution errors (`PluginModuleImportError`,
 * `PluginFactoryResolutionError`) propagate unchanged from the
 * underlying loader.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";

import {
  PluginManifestSchema,
  type PluginManifest,
} from "@hyperforge/manifest-schema";

import { loadPluginFromManifest, type LoadedPluginModule } from "./loader.js";
import { satisfiesPluginVersionRange } from "./semver.js";

/** Default manifest filename — overridable for tests / custom layouts. */
const DEFAULT_MANIFEST_FILENAME = "plugin.json";

/** Options threaded through `loadPluginPackage`. */
export interface LoadPluginPackageOptions {
  /**
   * If provided, the host's supported gameplay-framework API range.
   * `manifest.hyperforgeApi` must satisfy this range or the call
   * throws `PluginApiIncompatibleError`. Use `"*"` to skip the check
   * (equivalent to omitting the option).
   */
  readonly hostApiRange?: string;

  /** Manifest filename. Defaults to `"plugin.json"`. */
  readonly manifestFilename?: string;

  /**
   * Named export to pick up from the entry module. Passed through to
   * `loadPluginFromManifest`. Defaults to `"default"`.
   */
  readonly factoryExport?: string;

  /**
   * Override for the dynamic `import()` call that loads the entry
   * module. Tests use this to avoid writing to disk.
   */
  readonly importer?: (specifier: string) => Promise<unknown>;

  /**
   * Override for reading the manifest JSON from disk. Takes the
   * absolute path to `plugin.json` (or the filename override) and
   * returns the parsed JSON value.
   */
  readonly manifestLoader?: (absolutePath: string) => Promise<unknown>;
}

/** Error thrown when the manifest file can't be read or parsed as JSON. */
export class PluginManifestReadError extends Error {
  constructor(
    public readonly manifestPath: string,
    public readonly cause: unknown,
  ) {
    super(
      `Failed to read plugin manifest at ${manifestPath}: ` +
        (cause instanceof Error ? cause.message : String(cause)),
    );
    this.name = "PluginManifestReadError";
  }
}

/** Error thrown when the manifest JSON fails Zod validation. */
export class PluginManifestValidationError extends Error {
  constructor(
    public readonly manifestPath: string,
    public readonly cause: unknown,
  ) {
    super(
      `Plugin manifest at ${manifestPath} failed schema validation: ` +
        (cause instanceof Error ? cause.message : String(cause)),
    );
    this.name = "PluginManifestValidationError";
  }
}

/** Error thrown when manifest.hyperforgeApi doesn't satisfy the host range. */
export class PluginApiIncompatibleError extends Error {
  constructor(
    public readonly pluginId: string,
    public readonly pluginApiVersion: string,
    public readonly hostApiRange: string,
  ) {
    super(
      `Plugin "${pluginId}" targets hyperforgeApi ${pluginApiVersion}, ` +
        `which does not satisfy host range ${hostApiRange}`,
    );
    this.name = "PluginApiIncompatibleError";
  }
}

/**
 * Load a plugin package from its root directory.
 *
 * `baseDir` must be absolute — callers resolve their own paths (this
 * function deliberately doesn't consult process.cwd() to keep test
 * behavior hermetic).
 */
export async function loadPluginPackage<TContext = unknown>(
  baseDir: string,
  opts: LoadPluginPackageOptions = {},
): Promise<LoadedPluginModule<TContext>> {
  const manifestFilename = opts.manifestFilename ?? DEFAULT_MANIFEST_FILENAME;
  const manifestPath = path.join(baseDir, manifestFilename);

  // Step 1 — read raw JSON. Wrap all I/O + parse errors together so
  // the caller doesn't have to distinguish between "file not found"
  // and "file corrupted" at this layer (both are diagnostic material).
  const rawJson = await readManifestJson(manifestPath, opts.manifestLoader);

  // Step 2 — schema-validate.
  const manifest = validateManifest(rawJson, manifestPath);

  // Step 3 — host-API gate (optional).
  if (opts.hostApiRange !== undefined && opts.hostApiRange !== "*") {
    if (
      !satisfiesPluginVersionRange(manifest.hyperforgeApi, opts.hostApiRange)
    ) {
      throw new PluginApiIncompatibleError(
        manifest.id,
        manifest.hyperforgeApi,
        opts.hostApiRange,
      );
    }
  }

  // Step 4 — delegate to the dynamic loader.
  return loadPluginFromManifest<TContext>(manifest, {
    baseDir,
    factoryExport: opts.factoryExport,
    importer: opts.importer,
  });
}

async function readManifestJson(
  manifestPath: string,
  manifestLoader: LoadPluginPackageOptions["manifestLoader"],
): Promise<unknown> {
  if (manifestLoader !== undefined) {
    try {
      return await manifestLoader(manifestPath);
    } catch (cause) {
      throw new PluginManifestReadError(manifestPath, cause);
    }
  }
  try {
    const text = await fs.readFile(manifestPath, "utf8");
    return JSON.parse(text);
  } catch (cause) {
    throw new PluginManifestReadError(manifestPath, cause);
  }
}

function validateManifest(raw: unknown, manifestPath: string): PluginManifest {
  try {
    return PluginManifestSchema.parse(raw);
  } catch (cause) {
    throw new PluginManifestValidationError(manifestPath, cause);
  }
}

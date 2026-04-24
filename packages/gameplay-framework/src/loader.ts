/**
 * Dynamic plugin module loader.
 *
 * A plugin ships as a directory containing a root `plugin.json` and a
 * built module referenced by `manifest.entry` (relative to the package
 * root). The host discovers plugins by parsing manifests, then calls
 * `loadPluginFromManifest` to pull the factory out of the entry module
 * and hand it to the runtime (`PluginHost`, `PluginLoader`, etc.).
 *
 * This closes the loop between the manifest and a registerable factory
 * — before this module existed, plugins had to be wired by hand in
 * application code, which defeats the point of a community plugin
 * shape.
 *
 * Scope:
 *   - Resolve `manifest.entry` against an absolute `baseDir`
 *   - Use dynamic `import()` (ESM only)
 *   - Extract a named export (`default` by default) and type-guard it
 *     to `PluginFactory<TContext>`
 *   - Surface loud, id-tagged errors for every failure mode so hosts
 *     can display them in the Plugin Browser without guessing
 *
 * Non-goals (future commits):
 *   - SemVer range resolution / compatibility checking — host does that
 *     before calling this
 *   - Sandboxing / isolation — a future `sandbox` option will hook in
 *   - Remote loading (HTTPS URLs) — possible, but defer until there's
 *     a concrete demand
 */

import * as path from "node:path";
import { pathToFileURL } from "node:url";

import type { PluginManifest } from "@hyperforge/manifest-schema";

import type { PluginFactory } from "./index.js";

/**
 * Result of a successful `loadPluginFromManifest` call.
 *
 * Bundles the validated manifest with the resolved factory so callers
 * don't have to track them separately — they travel together through
 * the rest of the plugin pipeline (catalog → loader → host).
 */
export interface LoadedPluginModule<TContext = unknown> {
  readonly manifest: PluginManifest;
  readonly factory: PluginFactory<TContext>;
}

/**
 * Options for `loadPluginFromManifest`.
 */
export interface LoadPluginOptions {
  /**
   * Absolute directory that `manifest.entry` is resolved relative to —
   * typically the plugin package root where `plugin.json` lives.
   */
  readonly baseDir: string;

  /**
   * Named export to pick up from the entry module. Defaults to
   * `"default"`. Plugins that prefer a named factory (e.g. `export
   * const pluginFactory = ...`) can pass `"pluginFactory"` here.
   */
  readonly factoryExport?: string;

  /**
   * Optional loader injection seam. Default is the runtime's dynamic
   * `import()`. Tests supply a stub so they don't have to write files
   * to disk.
   */
  readonly importer?: (specifier: string) => Promise<unknown>;
}

/** Error thrown when the entry module loads but doesn't expose a factory. */
export class PluginFactoryResolutionError extends Error {
  constructor(
    public readonly pluginId: string,
    public readonly specifier: string,
    public readonly exportName: string,
    reason: string,
  ) {
    super(
      `Failed to resolve plugin factory for "${pluginId}" from ${specifier} ` +
        `(export "${exportName}"): ${reason}`,
    );
    this.name = "PluginFactoryResolutionError";
  }
}

/** Error thrown when the entry module itself fails to import. */
export class PluginModuleImportError extends Error {
  constructor(
    public readonly pluginId: string,
    public readonly specifier: string,
    public readonly cause: unknown,
  ) {
    super(
      `Failed to import plugin module for "${pluginId}" at ${specifier}: ` +
        (cause instanceof Error ? cause.message : String(cause)),
    );
    this.name = "PluginModuleImportError";
  }
}

/**
 * Load a plugin factory from disk (or a caller-supplied importer).
 *
 * Contract:
 *   1. Resolve the entry file URL against `opts.baseDir`.
 *   2. Dynamically import it (or delegate to `opts.importer`).
 *   3. Extract the named export — defaults to `default`.
 *   4. Type-guard it as `PluginFactory<TContext>`; anything else
 *      throws `PluginFactoryResolutionError`.
 *
 * The function is generic on `TContext` because the host knows the
 * context shape it will thread through — the loader itself can't
 * verify that (structural typing is caller-enforced at factory-
 * invocation time).
 */
export async function loadPluginFromManifest<TContext = unknown>(
  manifest: PluginManifest,
  opts: LoadPluginOptions,
): Promise<LoadedPluginModule<TContext>> {
  const factoryExport = opts.factoryExport ?? "default";
  const specifier = resolveEntrySpecifier(opts.baseDir, manifest.entry);

  let mod: unknown;
  try {
    const importer = opts.importer ?? defaultImporter;
    mod = await importer(specifier);
  } catch (cause) {
    throw new PluginModuleImportError(manifest.id, specifier, cause);
  }

  const factory = extractFactory(mod, factoryExport, manifest.id, specifier);
  return { manifest, factory: factory as PluginFactory<TContext> };
}

/**
 * Convert `manifest.entry` (relative posix path) into an absolute
 * `file://` URL the runtime's `import()` can consume.
 *
 * Using `pathToFileURL` handles Windows drive letters and special
 * characters correctly — simple string concatenation would not.
 */
function resolveEntrySpecifier(baseDir: string, entry: string): string {
  const absolute = path.resolve(baseDir, entry);
  return pathToFileURL(absolute).href;
}

/** Default importer — just delegates to the host runtime's `import()`. */
async function defaultImporter(specifier: string): Promise<unknown> {
  return import(specifier);
}

/**
 * Pull `factoryExport` out of a loaded module record and verify it's a
 * function. Doesn't attempt to invoke the factory — that's the host's
 * job, and invocation errors should surface under the host's error
 * domain, not the loader's.
 */
function extractFactory(
  mod: unknown,
  factoryExport: string,
  pluginId: string,
  specifier: string,
): PluginFactory<unknown> {
  if (mod === null || typeof mod !== "object") {
    throw new PluginFactoryResolutionError(
      pluginId,
      specifier,
      factoryExport,
      `module did not resolve to an object (got ${typeof mod})`,
    );
  }

  const record = mod as Record<string, unknown>;
  if (!(factoryExport in record)) {
    throw new PluginFactoryResolutionError(
      pluginId,
      specifier,
      factoryExport,
      "export not found on module",
    );
  }

  const candidate = record[factoryExport];
  if (typeof candidate !== "function") {
    throw new PluginFactoryResolutionError(
      pluginId,
      specifier,
      factoryExport,
      `export is not a function (got ${typeof candidate})`,
    );
  }

  return candidate as PluginFactory<unknown>;
}

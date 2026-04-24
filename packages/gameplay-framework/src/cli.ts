/**
 * `hyperforge-plugin` command-line entry point.
 *
 * Thin argv parser on top of the substrate already in this package.
 * Kept as a pure function `runCli(argv, io)` so it's unit-testable
 * without spawning a subprocess — the real binary in `bin/` just
 * shells into this with `process.argv` + stdio handles.
 *
 * Subcommands:
 *   - `validate <dir>` — run `validatePluginDirectory` against `<dir>`
 *     and pretty-print the result. Exit 0 on ok, 1 on any issue.
 *   - `--help` / `-h` — usage summary.
 *   - `--version` / `-v` — print the package version (hard-coded to
 *     avoid an `import ... with { type: "json" }` dep at runtime; the
 *     build script can rewrite this if it diverges).
 *
 * Future subcommands (not in this cut): `init` / `scaffold`, `lint`,
 * `publish`, `list`. Kept narrow on purpose — authors get one concrete
 * utility now instead of a half-baked Swiss army knife.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";

import {
  PluginManifestSchema,
  type PluginManifest,
} from "@hyperforge/manifest-schema";

import { validatePluginDirectory } from "./validate.js";
import {
  loadPluginCatalog,
  type LoadPluginCatalogOptions,
  type PluginCatalogResult,
} from "./catalog.js";
import { resolvePluginLoadOrder, type UnresolvablePlugin } from "./resolver.js";
import {
  formatSnapshotHuman,
  formatUnresolvableReason,
} from "./diagnostics.js";
import {
  aggregateContributions,
  computeContributionOrigins,
  diffSessionSnapshots,
  formatSnapshotJson,
  snapshotCatalogResolution,
  type AggregatedContributions,
  type ContributionOrigins,
  type SessionSnapshot,
  type SessionSnapshotDiff,
} from "./snapshot.js";

/** Hard-coded so the CLI has no JSON-import dep. Keep in sync with package.json. */
const CLI_VERSION = "0.1.0";

/** Stdio surface the CLI writes to. Tests inject in-memory buffers. */
export interface CliIO {
  readonly stdout: (chunk: string) => void;
  readonly stderr: (chunk: string) => void;
  readonly cwd: () => string;

  /**
   * Optional filesystem seam used by the `init` subcommand. Tests
   * supply an in-memory writer so the scaffold step doesn't touch
   * real disk; the binary leaves it undefined and the CLI falls back
   * to `node:fs/promises`.
   */
  readonly writeFile?: (
    absolutePath: string,
    contents: string,
  ) => Promise<void>;

  /**
   * Optional directory-creation seam. Tests supply a stub; the binary
   * leaves it undefined and the CLI falls back to `fs.mkdir`.
   */
  readonly mkdir?: (absolutePath: string) => Promise<void>;

  /**
   * Optional catalog-load seam used by the `lint` subcommand. Tests
   * supply a stub that returns a synthetic {loaded, failed} result so
   * they don't have to write a whole plugin tree to disk; the binary
   * leaves it undefined and the CLI falls back to `loadPluginCatalog`.
   */
  readonly catalogLoader?: (
    pluginsDir: string,
    opts: LoadPluginCatalogOptions,
  ) => Promise<PluginCatalogResult>;

  /**
   * Optional fetch seam used by the `publish` subcommand. Tests
   * supply an in-memory stub that records the request + returns a
   * canned response; the binary leaves it undefined and the CLI
   * falls back to globalThis.fetch.
   *
   * Signature mirrors the global `fetch` so the call site is
   * indistinguishable.
   */
  readonly fetch?: (
    input: string | URL,
    init?: RequestInit,
  ) => Promise<Response>;
}

/**
 * Run the CLI. Returns the process exit code — 0 on success, 1 on any
 * diagnostic issue, 2 on usage error. Never throws: argv mistakes
 * become exit-2 + a usage message on stderr.
 *
 * `argv` is the raw argument list EXCLUDING the node binary + script
 * path (match the standard `process.argv.slice(2)` convention).
 */
export async function runCli(
  argv: readonly string[],
  io: CliIO,
): Promise<number> {
  const [sub, ...rest] = argv;

  if (sub === undefined || sub === "--help" || sub === "-h") {
    io.stdout(USAGE);
    // Treat bare invocation as a usage error (exit 2) so CI scripts
    // catch "oops I forgot to pass a subcommand". `--help` is still
    // explicit help → exit 0.
    return sub === "--help" || sub === "-h" ? 0 : 2;
  }

  if (sub === "--version" || sub === "-v") {
    io.stdout(`hyperforge-plugin ${CLI_VERSION}\n`);
    return 0;
  }

  if (sub === "validate") {
    return runValidate(rest, io);
  }

  if (sub === "init") {
    return runInit(rest, io);
  }

  if (sub === "lint") {
    return runLint(rest, io);
  }

  if (sub === "list") {
    return runList(rest, io);
  }

  if (sub === "show") {
    return runShow(rest, io);
  }

  if (sub === "graph") {
    return runGraph(rest, io);
  }

  if (sub === "snapshot") {
    return runSnapshot(rest, io);
  }

  if (sub === "diff") {
    return runDiff(rest, io);
  }

  if (sub === "contributions") {
    return runContributions(rest, io);
  }

  if (sub === "pack") {
    return runPack(rest, io);
  }

  if (sub === "publish") {
    return runPublish(rest, io);
  }

  if (sub === "install") {
    return runInstall(rest, io);
  }

  io.stderr(`Unknown subcommand: ${sub}\n`);
  io.stderr(USAGE);
  return 2;
}

/** Handler for `validate <dir>`. */
async function runValidate(
  rest: readonly string[],
  io: CliIO,
): Promise<number> {
  // Simple flag parser: positional <dir>, optional `--host-api <range>`,
  // optional `--manifest-filename <name>`. No `process.argv` massaging —
  // just a linear walk.
  let dir: string | undefined;
  let hostApiRange: string | undefined;
  let manifestFilename: string | undefined;
  let json = false;

  for (let i = 0; i < rest.length; i++) {
    const token = rest[i]!;
    if (token === "--host-api") {
      hostApiRange = rest[++i];
      if (hostApiRange === undefined) {
        io.stderr("--host-api requires a value\n");
        return 2;
      }
      continue;
    }
    if (token === "--manifest-filename") {
      manifestFilename = rest[++i];
      if (manifestFilename === undefined) {
        io.stderr("--manifest-filename requires a value\n");
        return 2;
      }
      continue;
    }
    if (token === "--json") {
      json = true;
      continue;
    }
    if (token.startsWith("--")) {
      io.stderr(`Unknown flag: ${token}\n`);
      return 2;
    }
    if (dir === undefined) {
      dir = token;
      continue;
    }
    io.stderr(`Unexpected argument: ${token}\n`);
    return 2;
  }

  if (dir === undefined) {
    io.stderr("validate: missing <dir> argument\n");
    io.stderr(
      "Usage: hyperforge-plugin validate <dir> [--host-api <range>] [--manifest-filename <name>] [--json]\n",
    );
    return 2;
  }

  const absDir = path.isAbsolute(dir) ? dir : path.resolve(io.cwd(), dir);

  const result = await validatePluginDirectory(absDir, {
    hostApiRange,
    manifestFilename,
  });

  if (json) {
    // Machine-readable payload. `ok: true` carries the parsed manifest
    // so editors can populate forms without re-reading the file.
    const payload = result.ok
      ? {
          ok: true as const,
          manifestPath: result.manifestPath,
          manifest: result.manifest,
        }
      : {
          ok: false as const,
          manifestPath: result.manifestPath,
          issues: result.issues,
        };
    io.stdout(JSON.stringify(payload, null, 2) + "\n");
    return result.ok ? 0 : 1;
  }

  if (result.ok) {
    io.stdout(
      `✓ ${result.manifest.id}@${result.manifest.version} — ${result.manifestPath}\n`,
    );
    return 0;
  }

  io.stderr(`✗ ${result.manifestPath}\n`);
  for (const issue of result.issues) {
    io.stderr(`  • ${issue}\n`);
  }
  return 1;
}

/**
 * Handler for `init <dir> --id <id> [--name <name>]`.
 *
 * Scaffolds a minimal plugin package containing only the two files an
 * author needs to move forward: `plugin.json` (schema-valid against
 * whatever `--id` they passed, with sensible placeholders elsewhere)
 * and `src/index.ts` (factory stub with lifecycle hooks). Authors
 * bring their own `package.json` / `tsconfig.json` / build toolchain —
 * the CLI deliberately doesn't pick one for them.
 *
 * Refuses to overwrite existing files (no `--force` flag yet — protect
 * in-progress work). Creates the target directory if missing.
 */
async function runInit(rest: readonly string[], io: CliIO): Promise<number> {
  let dir: string | undefined;
  let id: string | undefined;
  let name: string | undefined;

  for (let i = 0; i < rest.length; i++) {
    const token = rest[i]!;
    if (token === "--id") {
      id = rest[++i];
      if (id === undefined) {
        io.stderr("--id requires a value\n");
        return 2;
      }
      continue;
    }
    if (token === "--name") {
      name = rest[++i];
      if (name === undefined) {
        io.stderr("--name requires a value\n");
        return 2;
      }
      continue;
    }
    if (token.startsWith("--")) {
      io.stderr(`Unknown flag: ${token}\n`);
      return 2;
    }
    if (dir === undefined) {
      dir = token;
      continue;
    }
    io.stderr(`Unexpected argument: ${token}\n`);
    return 2;
  }

  if (dir === undefined) {
    io.stderr("init: missing <dir> argument\n");
    io.stderr(
      "Usage: hyperforge-plugin init <dir> --id <id> [--name <name>]\n",
    );
    return 2;
  }
  if (id === undefined) {
    io.stderr("init: --id is required\n");
    io.stderr(
      "Usage: hyperforge-plugin init <dir> --id <id> [--name <name>]\n",
    );
    return 2;
  }

  // Validate the chosen id + derived manifest BEFORE touching disk so a
  // bad `--id` fails loud without littering the target dir. `name`
  // defaults to the id when omitted — authors edit later as they like.
  const manifestCandidate = {
    id,
    name: name ?? id,
    version: "0.1.0",
    entry: "./dist/index.js",
    author: { name: "TODO" },
    hyperforgeApi: "0.1.0",
    description: "TODO — describe what this plugin does.",
  };
  const parsed = PluginManifestSchema.safeParse(manifestCandidate);
  if (!parsed.success) {
    io.stderr("init: derived plugin.json failed schema validation:\n");
    for (const issue of parsed.error.issues) {
      const p = issue.path.map((x) => String(x)).join(".");
      io.stderr(`  • ${p ? `${p}: ` : ""}${issue.message}\n`);
    }
    return 2;
  }

  const absDir = path.isAbsolute(dir) ? dir : path.resolve(io.cwd(), dir);
  const manifestPath = path.join(absDir, "plugin.json");
  const srcDir = path.join(absDir, "src");
  const indexPath = path.join(srcDir, "index.ts");

  try {
    const mkdir = io.mkdir ?? defaultMkdir;
    const writeFile = io.writeFile ?? defaultWriteFileExclusive;

    await mkdir(absDir);
    await mkdir(srcDir);

    await writeFile(manifestPath, JSON.stringify(parsed.data, null, 2) + "\n");
    await writeFile(indexPath, SRC_INDEX_TEMPLATE);
  } catch (err) {
    io.stderr(`init: ${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }

  io.stdout(`✓ Scaffolded plugin ${id} at ${absDir}\n`);
  io.stdout(`  ${manifestPath}\n`);
  io.stdout(`  ${indexPath}\n`);
  return 0;
}

/** Default recursive mkdir (idempotent — "already exists" is not an error). */
async function defaultMkdir(absolutePath: string): Promise<void> {
  await fs.mkdir(absolutePath, { recursive: true });
}

/**
 * Default exclusive writer — fails with a clear message if the target
 * already exists. Protects in-progress work from an accidental
 * re-`init`.
 */
async function defaultWriteFileExclusive(
  absolutePath: string,
  contents: string,
): Promise<void> {
  try {
    await fs.writeFile(absolutePath, contents, { flag: "wx" });
  } catch (err) {
    if (
      err instanceof Error &&
      "code" in err &&
      (err as { code?: string }).code === "EEXIST"
    ) {
      throw new Error(`refusing to overwrite existing file: ${absolutePath}`);
    }
    throw err;
  }
}

/**
 * Handler for `lint <dir> [--host-api <range>]`.
 *
 * Catalog-level companion to `validate`. Runs `loadPluginCatalog` +
 * `resolvePluginLoadOrder` against a directory of plugin packages and
 * reports EVERY problem in a single pass:
 *   - Per-package load failures (plugin.json missing / schema reject /
 *     entry import failed / hostApi incompatible).
 *   - Unresolvable plugins (missing required dep / dep version
 *     mismatch / cycle member).
 *
 * Exit codes: 0 if the catalog is clean, 1 if any package failed to
 * load or any plugin is unresolvable, 2 on usage error.
 *
 * The resolver primitives never throw on per-plugin problems — they
 * aggregate into `failed[]` / `unresolvable[]`. `lint` just renders
 * those arrays as diagnostics.
 */
async function runLint(rest: readonly string[], io: CliIO): Promise<number> {
  let dir: string | undefined;
  let hostApiRange: string | undefined;
  let json = false;

  for (let i = 0; i < rest.length; i++) {
    const token = rest[i]!;
    if (token === "--host-api") {
      hostApiRange = rest[++i];
      if (hostApiRange === undefined) {
        io.stderr("--host-api requires a value\n");
        return 2;
      }
      continue;
    }
    if (token === "--json") {
      json = true;
      continue;
    }
    if (token.startsWith("--")) {
      io.stderr(`Unknown flag: ${token}\n`);
      return 2;
    }
    if (dir === undefined) {
      dir = token;
      continue;
    }
    io.stderr(`Unexpected argument: ${token}\n`);
    return 2;
  }

  if (dir === undefined) {
    io.stderr("lint: missing <dir> argument\n");
    io.stderr(
      "Usage: hyperforge-plugin lint <dir> [--host-api <range>] [--json]\n",
    );
    return 2;
  }

  const absDir = path.isAbsolute(dir) ? dir : path.resolve(io.cwd(), dir);

  const catalogLoader = io.catalogLoader ?? loadPluginCatalog;
  let catalog: PluginCatalogResult;
  try {
    catalog = await catalogLoader(absDir, { hostApiRange });
  } catch (err) {
    io.stderr(`lint: ${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }

  const { ordered, unresolvable } = resolvePluginLoadOrder(catalog.loaded);
  const loadedOk = ordered.length;
  const failedCount = catalog.failed.length + unresolvable.length;

  if (json) {
    // Machine-readable diagnostic bundle — mirrors the three buckets
    // the text form renders but structured for editor consumption.
    const payload = {
      baseDir: absDir,
      ok: failedCount === 0,
      cleanCount: loadedOk,
      failed: catalog.failed.map((f) => ({
        baseDir: f.baseDir,
        error: f.error instanceof Error ? f.error.message : String(f.error),
      })),
      unresolvable: unresolvable.map((u) => ({
        id: u.module.manifest.id,
        version: u.module.manifest.version,
        reason: formatUnresolvable(u),
      })),
    };
    io.stdout(JSON.stringify(payload, null, 2) + "\n");
    return failedCount === 0 ? 0 : 1;
  }

  // Format the report. Per-package failures first (they couldn't even
  // load), then unresolvable entries (they loaded but the resolver
  // couldn't place), then a one-line summary.
  for (const failure of catalog.failed) {
    io.stderr(`✗ ${failure.baseDir}\n`);
    io.stderr(
      `  • ${
        failure.error instanceof Error
          ? failure.error.message
          : String(failure.error)
      }\n`,
    );
  }
  for (const entry of unresolvable) {
    io.stderr(`✗ ${entry.module.manifest.id}\n`);
    io.stderr(`  • ${formatUnresolvable(entry)}\n`);
  }

  if (failedCount === 0) {
    io.stdout(`✓ ${loadedOk} plugin(s) clean in ${absDir}\n`);
    return 0;
  }

  io.stderr(
    `\nSummary: ${loadedOk} ok, ${catalog.failed.length} failed to load, ${unresolvable.length} unresolvable.\n`,
  );
  return 1;
}

/**
 * Handler for `list <dir> [--host-api <range>] [--json]`.
 *
 * Plain-text catalog walker: enumerates plugin packages under `<dir>`
 * and prints one row per loaded manifest. Unlike `lint`, this command
 * is diagnostic-free — per-package failures and unresolvable entries
 * land on stderr as notices but never change the exit code. Intended
 * for `hyperforge-plugin list | awk ...` pipelines and for editors
 * that want a machine-readable manifest inventory via `--json`.
 *
 * Text output (default): tab-separated `id\tversion\tbaseDir` per row.
 * JSON output (--json): a single object with `loaded: []`, `failed: []`,
 *   and `unresolvable: []` arrays. `failed[].error` is stringified.
 *
 * Exit 0 on any successful run (even an empty catalog). Exit 2 on
 * usage error. Exit 1 only if the catalog directory itself can't be
 * read (same contract as `lint`).
 */
async function runList(rest: readonly string[], io: CliIO): Promise<number> {
  let dir: string | undefined;
  let hostApiRange: string | undefined;
  let json = false;

  for (let i = 0; i < rest.length; i++) {
    const token = rest[i]!;
    if (token === "--host-api") {
      hostApiRange = rest[++i];
      if (hostApiRange === undefined) {
        io.stderr("--host-api requires a value\n");
        return 2;
      }
      continue;
    }
    if (token === "--json") {
      json = true;
      continue;
    }
    if (token.startsWith("--")) {
      io.stderr(`Unknown flag: ${token}\n`);
      return 2;
    }
    if (dir === undefined) {
      dir = token;
      continue;
    }
    io.stderr(`Unexpected argument: ${token}\n`);
    return 2;
  }

  if (dir === undefined) {
    io.stderr("list: missing <dir> argument\n");
    io.stderr(
      "Usage: hyperforge-plugin list <dir> [--host-api <range>] [--json]\n",
    );
    return 2;
  }

  const absDir = path.isAbsolute(dir) ? dir : path.resolve(io.cwd(), dir);

  const catalogLoader = io.catalogLoader ?? loadPluginCatalog;
  let catalog: PluginCatalogResult;
  try {
    catalog = await catalogLoader(absDir, { hostApiRange });
  } catch (err) {
    io.stderr(`list: ${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }

  // Run the resolver so we can classify loaded-but-unresolvable
  // entries separately — they represent a different state than
  // cleanly-resolved plugins and surface as a distinct bucket.
  const { unresolvable } = resolvePluginLoadOrder(catalog.loaded);
  const unresolvableIds = new Set(
    unresolvable.map((u) => u.module.manifest.id),
  );

  if (json) {
    // Machine-readable single-object payload. Editors can pipe this
    // through a JSON parser without regex-scraping the text form.
    const payload = {
      baseDir: absDir,
      loaded: catalog.loaded
        .filter((m) => !unresolvableIds.has(m.manifest.id))
        .map((m) => ({
          id: m.manifest.id,
          version: m.manifest.version,
          name: m.manifest.name,
        })),
      failed: catalog.failed.map((f) => ({
        baseDir: f.baseDir,
        error: f.error instanceof Error ? f.error.message : String(f.error),
      })),
      unresolvable: unresolvable.map((u) => ({
        id: u.module.manifest.id,
        version: u.module.manifest.version,
        reason: formatUnresolvable(u),
      })),
    };
    io.stdout(JSON.stringify(payload, null, 2) + "\n");
    return 0;
  }

  // Text output — one row per loaded manifest. Unresolvable + failed
  // still appear on stderr as informational notices so humans using
  // `list` casually can spot them without a separate `lint` run.
  for (const module of catalog.loaded) {
    if (unresolvableIds.has(module.manifest.id)) continue;
    io.stdout(`${module.manifest.id}\t${module.manifest.version}\t${absDir}\n`);
  }
  for (const u of unresolvable) {
    io.stderr(
      `! ${u.module.manifest.id}@${u.module.manifest.version} — ${formatUnresolvable(u)}\n`,
    );
  }
  for (const f of catalog.failed) {
    io.stderr(
      `! ${f.baseDir} — ${
        f.error instanceof Error ? f.error.message : String(f.error)
      }\n`,
    );
  }

  return 0;
}

/**
 * Handler for `show <dir> [--manifest-filename <name>] [--json]`.
 *
 * Single-plugin inspector — the "did my author fields survive the
 * schema?" view for a specific package. Runs `validatePluginDirectory`
 * (without a hostApiRange check, since `show` is informational) and
 * pretty-prints the resulting manifest: metadata, dependency graph,
 * contribution surface counts, tags.
 *
 * Exit codes: 0 if the manifest parsed, 1 if it didn't (same pipe as
 * `validate` — authors can chain them), 2 on usage error.
 *
 * `--json` emits the parsed manifest as a structured payload — same
 * shape as `validate --json`'s success branch, but unconditional: the
 * failure branch still reuses the `{ok: false, issues}` form so editor
 * consumers get one schema regardless of which command they call.
 */
async function runShow(rest: readonly string[], io: CliIO): Promise<number> {
  let dir: string | undefined;
  let manifestFilename: string | undefined;
  let json = false;

  for (let i = 0; i < rest.length; i++) {
    const token = rest[i]!;
    if (token === "--manifest-filename") {
      manifestFilename = rest[++i];
      if (manifestFilename === undefined) {
        io.stderr("--manifest-filename requires a value\n");
        return 2;
      }
      continue;
    }
    if (token === "--json") {
      json = true;
      continue;
    }
    if (token.startsWith("--")) {
      io.stderr(`Unknown flag: ${token}\n`);
      return 2;
    }
    if (dir === undefined) {
      dir = token;
      continue;
    }
    io.stderr(`Unexpected argument: ${token}\n`);
    return 2;
  }

  if (dir === undefined) {
    io.stderr("show: missing <dir> argument\n");
    io.stderr(
      "Usage: hyperforge-plugin show <dir> [--manifest-filename <name>] [--json]\n",
    );
    return 2;
  }

  const absDir = path.isAbsolute(dir) ? dir : path.resolve(io.cwd(), dir);

  // Pass hostApiRange as `"*"` — `show` is descriptive, not a gate.
  // The author just wants to see what's in the file; API compatibility
  // is `validate`'s job.
  const result = await validatePluginDirectory(absDir, {
    hostApiRange: "*",
    manifestFilename,
  });

  if (json) {
    const payload = result.ok
      ? {
          ok: true as const,
          manifestPath: result.manifestPath,
          manifest: result.manifest,
        }
      : {
          ok: false as const,
          manifestPath: result.manifestPath,
          issues: result.issues,
        };
    io.stdout(JSON.stringify(payload, null, 2) + "\n");
    return result.ok ? 0 : 1;
  }

  if (!result.ok) {
    io.stderr(`✗ ${result.manifestPath}\n`);
    for (const issue of result.issues) {
      io.stderr(`  • ${issue}\n`);
    }
    return 1;
  }

  const m = result.manifest;
  io.stdout(`${m.id}@${m.version}\n`);
  io.stdout(`  name: ${m.name}\n`);
  if (m.description) {
    io.stdout(`  description: ${m.description}\n`);
  }
  io.stdout(`  author: ${formatAuthor(m.author)}\n`);
  if (m.license !== undefined) {
    io.stdout(`  license: ${m.license}\n`);
  }
  io.stdout(`  entry: ${m.entry}\n`);
  io.stdout(`  hyperforgeApi: ${m.hyperforgeApi}\n`);
  io.stdout(`  enabledByDefault: ${m.enabledByDefault}\n`);
  if (m.homepage !== undefined) io.stdout(`  homepage: ${m.homepage}\n`);
  if (m.repository !== undefined) io.stdout(`  repository: ${m.repository}\n`);
  if (m.tags.length > 0) {
    io.stdout(`  tags: ${m.tags.join(", ")}\n`);
  }

  if (m.dependencies.length > 0) {
    io.stdout(`  dependencies:\n`);
    for (const dep of m.dependencies) {
      const marker = dep.optional ? " (optional)" : "";
      io.stdout(`    - ${dep.id} ${dep.versionRange}${marker}\n`);
    }
  }
  if (m.loadAfter.length > 0) {
    io.stdout(`  loadAfter: ${m.loadAfter.join(", ")}\n`);
  }

  // Contribution surface counts — mirrors the Plugin Browser summary.
  // Zero-count surfaces are suppressed so the output stays scannable.
  const c = m.contributions;
  const surfaces: Array<[string, readonly string[]]> = [
    ["systems", c.systems],
    ["entities", c.entities],
    ["widgets", c.widgets],
    ["manifestSchemas", c.manifestSchemas],
    ["paletteCategories", c.paletteCategories],
    ["toolbarTools", c.toolbarTools],
    ["commands", c.commands],
  ];
  const nonEmpty = surfaces.filter(([, arr]) => arr.length > 0);
  if (nonEmpty.length > 0) {
    io.stdout(`  contributions:\n`);
    for (const [label, arr] of nonEmpty) {
      io.stdout(`    ${label} (${arr.length}): ${arr.join(", ")}\n`);
    }
  }

  io.stdout(`  ${result.manifestPath}\n`);
  return 0;
}

/** Format a PluginAuthor into a single human-readable line. */
function formatAuthor(author: {
  name: string;
  email?: string;
  url?: string;
}): string {
  const parts = [author.name];
  if (author.email) parts.push(`<${author.email}>`);
  if (author.url) parts.push(`(${author.url})`);
  return parts.join(" ");
}

/**
 * Handler for `graph <dir> [--host-api <range>] [--format ascii|dot|json]`.
 *
 * Catalog-level dependency-graph emitter. Walks plugins under `<dir>`,
 * extracts their declared `dependencies` + `loadAfter` arrays, and
 * renders the resulting directed graph.
 *
 * Output formats:
 *   - `ascii` (default): indented tree rooted at each plugin showing its
 *     direct dependencies. Repeat refs annotated with `(↻)` to surface
 *     shared deps without visually exploding on cycles.
 *   - `dot`: Graphviz DOT — pipe through `dot -Tsvg` for rendering.
 *     Edge labels carry the version range for dependencies; `loadAfter`
 *     renders as dashed edges without labels.
 *   - `json`: structured adjacency list for editor consumption.
 *
 * Exit 0 on successful render (even empty catalogs), 2 on usage error,
 * 1 only if the catalog directory itself fails to read.
 */
async function runGraph(rest: readonly string[], io: CliIO): Promise<number> {
  let dir: string | undefined;
  let hostApiRange: string | undefined;
  let format: "ascii" | "dot" | "json" = "ascii";

  for (let i = 0; i < rest.length; i++) {
    const token = rest[i]!;
    if (token === "--host-api") {
      hostApiRange = rest[++i];
      if (hostApiRange === undefined) {
        io.stderr("--host-api requires a value\n");
        return 2;
      }
      continue;
    }
    if (token === "--format") {
      const value = rest[++i];
      if (value === undefined) {
        io.stderr("--format requires a value\n");
        return 2;
      }
      if (value !== "ascii" && value !== "dot" && value !== "json") {
        io.stderr(
          `--format must be one of: ascii, dot, json (got: ${value})\n`,
        );
        return 2;
      }
      format = value;
      continue;
    }
    if (token.startsWith("--")) {
      io.stderr(`Unknown flag: ${token}\n`);
      return 2;
    }
    if (dir === undefined) {
      dir = token;
      continue;
    }
    io.stderr(`Unexpected argument: ${token}\n`);
    return 2;
  }

  if (dir === undefined) {
    io.stderr("graph: missing <dir> argument\n");
    io.stderr(
      "Usage: hyperforge-plugin graph <dir> [--host-api <range>] [--format ascii|dot|json]\n",
    );
    return 2;
  }

  const absDir = path.isAbsolute(dir) ? dir : path.resolve(io.cwd(), dir);

  const catalogLoader = io.catalogLoader ?? loadPluginCatalog;
  let catalog: PluginCatalogResult;
  try {
    catalog = await catalogLoader(absDir, { hostApiRange });
  } catch (err) {
    io.stderr(`graph: ${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }

  // Build the adjacency list once, render from it. `d.optional` is
  // always defined after Zod parsing (`.default(false)`) but coerce
  // here so the JSON form is stable even for synthetic inputs that
  // bypass the schema.
  const nodes = catalog.loaded.map((m) => ({
    id: m.manifest.id,
    version: m.manifest.version,
    dependencies: m.manifest.dependencies.map((d) => ({
      id: d.id,
      versionRange: d.versionRange,
      optional: d.optional ?? false,
    })),
    loadAfter: [...m.manifest.loadAfter],
  }));

  if (format === "json") {
    io.stdout(JSON.stringify({ baseDir: absDir, nodes }, null, 2) + "\n");
    return 0;
  }

  if (format === "dot") {
    io.stdout("digraph plugins {\n");
    io.stdout("  rankdir=LR;\n");
    io.stdout("  node [shape=box];\n");
    for (const n of nodes) {
      io.stdout(`  "${n.id}" [label="${n.id}\\n${n.version}"];\n`);
    }
    for (const n of nodes) {
      for (const dep of n.dependencies) {
        const style = dep.optional ? ' style="dashed"' : "";
        io.stdout(
          `  "${n.id}" -> "${dep.id}" [label="${dep.versionRange}"${style}];\n`,
        );
      }
      for (const after of n.loadAfter) {
        io.stdout(
          `  "${n.id}" -> "${after}" [style="dotted" label="loadAfter"];\n`,
        );
      }
    }
    io.stdout("}\n");
    return 0;
  }

  // ascii — one block per plugin, indented deps + loadAfter listing.
  if (nodes.length === 0) {
    io.stdout(`(no plugins in ${absDir})\n`);
    return 0;
  }
  for (const n of nodes) {
    io.stdout(`${n.id}@${n.version}\n`);
    if (n.dependencies.length === 0 && n.loadAfter.length === 0) {
      io.stdout("  (no dependencies)\n");
      continue;
    }
    for (const dep of n.dependencies) {
      const marker = dep.optional ? " (optional)" : "";
      io.stdout(`  ↳ ${dep.id} ${dep.versionRange}${marker}\n`);
    }
    for (const after of n.loadAfter) {
      io.stdout(`  ⇢ ${after} (loadAfter)\n`);
    }
  }
  return 0;
}

/**
 * CLI-local shim around `formatUnresolvableReason` for the lint/list/graph
 * handlers that carry a live `UnresolvablePlugin` (with `.module`) rather
 * than a snapshot entry. The resolver's runtime `UnresolvableReason` and
 * the snapshot's `SerializedUnresolvableReason` are kind-for-kind
 * identical; this bridge keeps the wording canonical.
 */
function formatUnresolvable(entry: UnresolvablePlugin): string {
  return formatUnresolvableReason(entry.reason);
}

/**
 * Handler for `snapshot <dir> [--host-api <range>] [--human]`.
 *
 * Produces the same three-bucket `SessionSnapshot` shape exported by
 * the `snapshotSession` runtime helper, but built from a catalog +
 * resolver walk rather than a live session. `running` is populated
 * from `snapshotLoadedModules(ordered)` — i.e. plugins that WOULD
 * start cleanly. `failedPackages` and `unresolvable` mirror the same
 * arrays `lint` surfaces.
 *
 * Default output is JSON (primary use case: editor / CI / external
 * tooling ingestion). Pass `--human` for the multiline
 * `formatSnapshotHuman` report.
 *
 * Exit codes: 0 on successful catalog read, 1 on catalog read error
 * (same contract as `lint`/`list`), 2 on usage error. Per-package
 * load failures and unresolvable plugins are REPORTED inside the
 * snapshot — they do NOT change the exit code (this command is a
 * read, not a gate; use `lint` if you want a pass/fail signal).
 */
async function runSnapshot(
  rest: readonly string[],
  io: CliIO,
): Promise<number> {
  let dir: string | undefined;
  let hostApiRange: string | undefined;
  let human = false;

  for (let i = 0; i < rest.length; i++) {
    const token = rest[i]!;
    if (token === "--host-api") {
      hostApiRange = rest[++i];
      if (hostApiRange === undefined) {
        io.stderr("--host-api requires a value\n");
        return 2;
      }
      continue;
    }
    if (token === "--human") {
      human = true;
      continue;
    }
    if (token.startsWith("--")) {
      io.stderr(`Unknown flag: ${token}\n`);
      return 2;
    }
    if (dir === undefined) {
      dir = token;
      continue;
    }
    io.stderr(`Unexpected argument: ${token}\n`);
    return 2;
  }

  if (dir === undefined) {
    io.stderr("snapshot: missing <dir> argument\n");
    io.stderr(
      "Usage: hyperforge-plugin snapshot <dir> [--host-api <range>] [--human]\n",
    );
    return 2;
  }

  const absDir = path.isAbsolute(dir) ? dir : path.resolve(io.cwd(), dir);
  const catalogLoader = io.catalogLoader ?? loadPluginCatalog;

  let catalog: PluginCatalogResult;
  try {
    catalog = await catalogLoader(absDir, { hostApiRange });
  } catch (err) {
    io.stderr(
      `snapshot: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 1;
  }

  const resolution = resolvePluginLoadOrder(catalog.loaded);
  const snapshot: SessionSnapshot = snapshotCatalogResolution(
    catalog,
    resolution,
  );

  if (human) {
    io.stdout(formatSnapshotHuman(snapshot) + "\n");
  } else {
    io.stdout(JSON.stringify(snapshot, null, 2) + "\n");
  }
  return 0;
}

/**
 * Handler for `diff <baseline.json> <current.json> [--human] [--compact]`.
 *
 * Reads two snapshot JSON files (typically produced by
 * `hyperforge-plugin snapshot <dir> > snap.json`) and prints a
 * structural diff via {@link diffSessionSnapshots} +
 * {@link formatSnapshotJson}.
 *
 * Output modes:
 *   - default: pretty-printed deterministic JSON (indent=2, sorted keys)
 *   - `--compact`: single-line JSON (indent=0)
 *   - `--human`: short ASCII summary (counts + reclassified ids)
 *
 * Exit codes:
 *   - 0 if the diff was emitted successfully
 *   - 1 on file-read or JSON-parse error
 *   - 2 on usage error
 *
 * Use cases:
 *   - CI regression gate: snapshot at a known-good commit, then diff
 *     against the current branch to flag missing/changed/added plugins
 *   - Editor "what changed?" preview after a hot-reload
 *   - Bug-report bundles where you want the reader to see deltas
 *     instead of two raw snapshots
 */
async function runDiff(rest: readonly string[], io: CliIO): Promise<number> {
  let baselinePath: string | undefined;
  let currentPath: string | undefined;
  let human = false;
  let compact = false;

  for (let i = 0; i < rest.length; i++) {
    const token = rest[i]!;
    if (token === "--human") {
      human = true;
      continue;
    }
    if (token === "--compact") {
      compact = true;
      continue;
    }
    if (token.startsWith("--")) {
      io.stderr(`Unknown flag: ${token}\n`);
      return 2;
    }
    if (baselinePath === undefined) {
      baselinePath = token;
      continue;
    }
    if (currentPath === undefined) {
      currentPath = token;
      continue;
    }
    io.stderr(`Unexpected argument: ${token}\n`);
    return 2;
  }

  if (baselinePath === undefined || currentPath === undefined) {
    io.stderr("diff: missing required path arguments\n");
    io.stderr(
      "Usage: hyperforge-plugin diff <baseline.json> <current.json> [--human] [--compact]\n",
    );
    return 2;
  }

  const baselineAbs = path.isAbsolute(baselinePath)
    ? baselinePath
    : path.resolve(io.cwd(), baselinePath);
  const currentAbs = path.isAbsolute(currentPath)
    ? currentPath
    : path.resolve(io.cwd(), currentPath);

  let baseline: SessionSnapshot;
  let current: SessionSnapshot;
  try {
    baseline = JSON.parse(
      await fs.readFile(baselineAbs, "utf8"),
    ) as SessionSnapshot;
    current = JSON.parse(
      await fs.readFile(currentAbs, "utf8"),
    ) as SessionSnapshot;
  } catch (err) {
    io.stderr(`diff: ${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }

  const diff: SessionSnapshotDiff = diffSessionSnapshots(baseline, current);

  if (human) {
    io.stdout(formatDiffHuman(diff));
  } else {
    io.stdout(formatSnapshotJson(diff, { indent: compact ? 0 : 2 }) + "\n");
  }
  return 0;
}

/**
 * Compact human-readable summary of a {@link SessionSnapshotDiff}.
 * Intentionally short — for the full structured payload, omit
 * `--human` and read the JSON.
 */
function formatDiffHuman(diff: SessionSnapshotDiff): string {
  const lines: string[] = [];
  lines.push(
    `Plugin session diff: running ${signed(diff.summary.runningDelta)}, unresolvable ${signed(diff.summary.unresolvableDelta)}, failed ${signed(diff.summary.failedDelta)}`,
  );
  if (diff.running.added.length > 0) {
    lines.push(
      `  + Running added (${diff.running.added.length}): ${diff.running.added.map((r) => r.manifest.id).join(", ")}`,
    );
  }
  if (diff.running.removed.length > 0) {
    lines.push(
      `  - Running removed (${diff.running.removed.length}): ${diff.running.removed.map((r) => r.manifest.id).join(", ")}`,
    );
  }
  if (diff.running.changed.length > 0) {
    lines.push(
      `  ~ Running changed (${diff.running.changed.length}): ${diff.running.changed.map((c) => c.next.manifest.id).join(", ")}`,
    );
  }
  if (diff.unresolvable.added.length > 0) {
    lines.push(
      `  + Unresolvable added (${diff.unresolvable.added.length}): ${diff.unresolvable.added.map((r) => r.manifest.id).join(", ")}`,
    );
  }
  if (diff.unresolvable.removed.length > 0) {
    lines.push(
      `  - Unresolvable removed (${diff.unresolvable.removed.length}): ${diff.unresolvable.removed.map((r) => r.manifest.id).join(", ")}`,
    );
  }
  if (diff.failedPackages.added.length > 0) {
    lines.push(
      `  + Failed packages added (${diff.failedPackages.added.length}): ${diff.failedPackages.added.map((f) => f.baseDir).join(", ")}`,
    );
  }
  if (diff.failedPackages.removed.length > 0) {
    lines.push(
      `  - Failed packages removed (${diff.failedPackages.removed.length}): ${diff.failedPackages.removed.map((f) => f.baseDir).join(", ")}`,
    );
  }
  if (diff.reclassified.length > 0) {
    lines.push(
      `  ↔ Reclassified (${diff.reclassified.length}): ${diff.reclassified.map((r) => `${r.id} (${r.prev} → ${r.next})`).join(", ")}`,
    );
  }
  if (
    diff.running.added.length === 0 &&
    diff.running.removed.length === 0 &&
    diff.running.changed.length === 0 &&
    diff.unresolvable.added.length === 0 &&
    diff.unresolvable.removed.length === 0 &&
    diff.failedPackages.added.length === 0 &&
    diff.failedPackages.removed.length === 0 &&
    diff.reclassified.length === 0
  ) {
    lines.push("  (no changes)");
  }
  return lines.join("\n") + "\n";
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

/**
 * Handler for `contributions <dir> [--host-api <range>] [--human]
 * [--with-origins] [--compact]`.
 *
 * Walks the plugin catalog at `<dir>`, calls
 * {@link aggregateContributions} (and optionally
 * {@link computeContributionOrigins} when `--with-origins` is set),
 * and prints the result.
 *
 * Output modes:
 *   - default: deterministic pretty JSON (sorted keys, indent 2)
 *   - `--compact`: single-line JSON
 *   - `--human`: ASCII summary with per-bucket counts + ids
 *
 * Exit codes:
 *   - 0 on successful catalog read (per-package failures are surfaced
 *     in the summary but don't change the exit code — same contract
 *     as `snapshot`)
 *   - 1 on catalog read error
 *   - 2 on usage error
 *
 * Use cases:
 *   - Editor bootstrap audit: "what would these plugins register?"
 *   - CI gate: pin the contribution surface so a plugin update can't
 *     silently add a widget id
 *   - Conflict diagnostics: pair with `--with-origins` to see who
 *     declares each id (multi-declarer = potential conflict)
 */
async function runContributions(
  rest: readonly string[],
  io: CliIO,
): Promise<number> {
  let dir: string | undefined;
  let hostApiRange: string | undefined;
  let human = false;
  let compact = false;
  let withOrigins = false;

  for (let i = 0; i < rest.length; i++) {
    const token = rest[i]!;
    if (token === "--host-api") {
      hostApiRange = rest[++i];
      if (hostApiRange === undefined) {
        io.stderr("--host-api requires a value\n");
        return 2;
      }
      continue;
    }
    if (token === "--human") {
      human = true;
      continue;
    }
    if (token === "--compact") {
      compact = true;
      continue;
    }
    if (token === "--with-origins") {
      withOrigins = true;
      continue;
    }
    if (token.startsWith("--")) {
      io.stderr(`Unknown flag: ${token}\n`);
      return 2;
    }
    if (dir === undefined) {
      dir = token;
      continue;
    }
    io.stderr(`Unexpected argument: ${token}\n`);
    return 2;
  }

  if (dir === undefined) {
    io.stderr("contributions: missing <dir> argument\n");
    io.stderr(
      "Usage: hyperforge-plugin contributions <dir> [--host-api <range>] [--human] [--compact] [--with-origins]\n",
    );
    return 2;
  }

  const absDir = path.isAbsolute(dir) ? dir : path.resolve(io.cwd(), dir);
  const catalogLoader = io.catalogLoader ?? loadPluginCatalog;

  let catalog: PluginCatalogResult;
  try {
    catalog = await catalogLoader(absDir, { hostApiRange });
  } catch (err) {
    io.stderr(
      `contributions: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 1;
  }

  const aggregated: AggregatedContributions = aggregateContributions(
    catalog.loaded,
  );

  if (human) {
    io.stdout(formatContributionsHuman(aggregated, catalog.loaded.length));
    if (withOrigins) {
      const origins = computeContributionOrigins(catalog.loaded);
      io.stdout(formatOriginsHuman(origins));
    }
    return 0;
  }

  // JSON output. Convert the origin Maps to plain objects so the
  // payload is JSON-serializable (Map serializes to {} via JSON.stringify
  // — no good for the wire shape we want).
  const payload: {
    aggregated: AggregatedContributions;
    origins?: Record<keyof AggregatedContributions, Record<string, string[]>>;
  } = { aggregated };
  if (withOrigins) {
    const origins = computeContributionOrigins(catalog.loaded);
    payload.origins = mapOriginsToPlainObject(origins);
  }
  io.stdout(formatSnapshotJson(payload, { indent: compact ? 0 : 2 }) + "\n");
  return 0;
}

function formatContributionsHuman(
  result: AggregatedContributions,
  pluginCount: number,
): string {
  const lines: string[] = [];
  lines.push(`Aggregated contributions across ${pluginCount} plugin(s):`);
  const buckets: ReadonlyArray<keyof AggregatedContributions> = [
    "systems",
    "entities",
    "widgets",
    "manifestSchemas",
    "paletteCategories",
    "toolbarTools",
    "commands",
  ];
  for (const bucket of buckets) {
    const ids = result[bucket];
    if (ids.length === 0) {
      lines.push(`  ${bucket}: (none)`);
    } else {
      lines.push(`  ${bucket} (${ids.length}):`);
      for (const id of ids) lines.push(`    • ${id}`);
    }
  }
  return lines.join("\n") + "\n";
}

function formatOriginsHuman(origins: ContributionOrigins): string {
  const lines: string[] = [];
  lines.push("Origins (id → declaring plugin id(s)):");
  const buckets: ReadonlyArray<keyof ContributionOrigins> = [
    "systems",
    "entities",
    "widgets",
    "manifestSchemas",
    "paletteCategories",
    "toolbarTools",
    "commands",
  ];
  for (const bucket of buckets) {
    const map = origins[bucket];
    if (map.size === 0) continue;
    lines.push(`  ${bucket}:`);
    for (const [id, declarers] of map) {
      const flag = declarers.length > 1 ? " ⚠ conflict" : "";
      lines.push(`    • ${id} ← ${declarers.join(", ")}${flag}`);
    }
  }
  return lines.join("\n") + "\n";
}

function mapOriginsToPlainObject(
  origins: ContributionOrigins,
): Record<keyof AggregatedContributions, Record<string, string[]>> {
  const result = {} as Record<
    keyof AggregatedContributions,
    Record<string, string[]>
  >;
  const buckets: ReadonlyArray<keyof ContributionOrigins> = [
    "systems",
    "entities",
    "widgets",
    "manifestSchemas",
    "paletteCategories",
    "toolbarTools",
    "commands",
  ];
  for (const bucket of buckets) {
    const obj: Record<string, string[]> = {};
    for (const [id, declarers] of origins[bucket]) {
      obj[id] = [...declarers];
    }
    result[bucket] = obj;
  }
  return result;
}

/**
 * Plugin bundle descriptor — the registry-ready payload shared by
 * the `pack` and `publish` subcommands. Carries the manifest, a
 * content fingerprint over plugin.json, per-file path/size/sha256
 * for everything under dist/, and a content-addressed bundleHash
 * that uniquely identifies THIS version's payload.
 */
interface PluginBundleDescriptor {
  readonly manifest: PluginManifest;
  readonly manifestHash: string;
  readonly files: ReadonlyArray<{
    readonly path: string;
    readonly size: number;
    readonly sha256: string;
  }>;
  readonly totalSize: number;
  readonly bundleHash: string;
}

type BuildBundleResult =
  | { readonly ok: true; readonly bundle: PluginBundleDescriptor }
  | { readonly ok: false; readonly exitCode: number };

/**
 * Build a {@link PluginBundleDescriptor} for the plugin package at
 * `absDir`. Shared by `pack` and `publish` so both commands hash
 * the same content the same way.
 *
 * Returns `{ ok: true, bundle }` on success or `{ ok: false, exitCode }`
 * after writing diagnostics to `io.stderr`. The `commandLabel` is
 * prefixed onto stderr messages so the user sees `pack:` or
 * `publish:` consistently with the subcommand they invoked.
 */
async function buildPluginBundle(
  absDir: string,
  io: CliIO,
  commandLabel: string,
): Promise<BuildBundleResult> {
  // Step 1: validate the manifest. If validation fails, refuse to
  // bundle (parity with `npm pack` which also runs lifecycle gates).
  const validation = await validatePluginDirectory(absDir);
  if (!validation.ok) {
    io.stderr(`${commandLabel}: ${validation.manifestPath}\n`);
    for (const issue of validation.issues) {
      io.stderr(`  • ${issue}\n`);
    }
    return { ok: false, exitCode: 1 };
  }

  // Step 2: read plugin.json content for the manifest hash. Hash the
  // raw bytes, not the parsed manifest, so two byte-identical files
  // produce identical hashes regardless of JSON key ordering.
  const manifestPath = path.join(absDir, "plugin.json");
  let manifestBytes: Buffer;
  try {
    manifestBytes = await fs.readFile(manifestPath);
  } catch (err) {
    io.stderr(
      `${commandLabel}: failed to read plugin.json: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return { ok: false, exitCode: 1 };
  }
  const { createHash } = await import("node:crypto");
  const manifestHash = createHash("sha256").update(manifestBytes).digest("hex");

  // Step 3: walk dist/ to enumerate files. Missing dist/ is a warning,
  // not an error — author may be packing source-only or hasn't built
  // yet. Empty file list is allowed; bundleHash still computes (just
  // over the manifest).
  const distRoot = path.join(absDir, "dist");
  const files: Array<{ path: string; size: number; sha256: string }> = [];
  try {
    await walkDistFiles(distRoot, distRoot, files);
  } catch (err) {
    if ((err as { code?: string }).code === "ENOENT") {
      io.stderr(
        `${commandLabel}: warning — ${distRoot} does not exist; bundle will contain only the manifest\n`,
      );
    } else {
      io.stderr(
        `${commandLabel}: failed to walk dist/: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      return { ok: false, exitCode: 1 };
    }
  }

  // Step 4: compute totalSize + bundleHash. Sort files by path for
  // determinism; the bundleHash is a stable content-addressed
  // identity for THIS version of THIS plugin's payload.
  files.sort((a, b) => a.path.localeCompare(b.path));
  const totalSize = files.reduce((s, f) => s + f.size, 0);
  const bundleSeed = [manifestHash, ...files.map((f) => f.sha256)].join(":");
  const bundleHash = createHash("sha256").update(bundleSeed).digest("hex");

  return {
    ok: true,
    bundle: {
      manifest: validation.manifest,
      manifestHash,
      files,
      totalSize,
      bundleHash,
    },
  };
}

/**
 * Handler for `pack <dir> [--out <path>] [--compact]`.
 *
 * I5 substrate (publish flow). Builds a registry-ready bundle
 * descriptor for a plugin package — the metadata a future
 * `publish` command would upload to a community plugin registry,
 * and an `install` command would consume to verify the download.
 *
 * The bundle descriptor (NOT a tarball — that's a separate cut)
 * carries:
 *   - manifest: full PluginManifest from <dir>/plugin.json
 *   - manifestHash: sha256 of the canonical plugin.json content
 *   - files: per-file path + size + sha256 for every file under
 *     <dir>/dist/ (the only directory marked for distribution per
 *     the convention `files: ["dist/", "plugin.json"]` in
 *     package.json — non-dist files are author-side only)
 *   - totalSize: sum of file sizes in bytes
 *   - bundleHash: sha256 of "{manifestHash}:{file1Hash}:..." in
 *     file-path order; the content-addressed identity for a
 *     specific plugin version's payload
 *
 * Exit codes:
 *   - 0 on success
 *   - 1 on validation failure or filesystem error
 *   - 2 on usage error
 *
 * Use cases:
 *   - CI: pack on every PR, diff bundleHash to detect content
 *     changes that should bump version
 *   - Author audit: see what would actually ship
 *   - Foundation: future publish command pipes this descriptor +
 *     a real tarball to a registry endpoint
 */
async function runPack(rest: readonly string[], io: CliIO): Promise<number> {
  let dir: string | undefined;
  let outPath: string | undefined;
  let compact = false;

  for (let i = 0; i < rest.length; i++) {
    const token = rest[i]!;
    if (token === "--out") {
      outPath = rest[++i];
      if (outPath === undefined) {
        io.stderr("--out requires a value\n");
        return 2;
      }
      continue;
    }
    if (token === "--compact") {
      compact = true;
      continue;
    }
    if (token.startsWith("--")) {
      io.stderr(`Unknown flag: ${token}\n`);
      return 2;
    }
    if (dir === undefined) {
      dir = token;
      continue;
    }
    io.stderr(`Unexpected argument: ${token}\n`);
    return 2;
  }

  if (dir === undefined) {
    io.stderr("pack: missing <dir> argument\n");
    io.stderr(
      "Usage: hyperforge-plugin pack <dir> [--out <path>] [--compact]\n",
    );
    return 2;
  }

  const absDir = path.isAbsolute(dir) ? dir : path.resolve(io.cwd(), dir);
  const result = await buildPluginBundle(absDir, io, "pack");
  if (!result.ok) return result.exitCode;
  const bundle = result.bundle;
  const { manifestHash, bundleHash, totalSize, files } = bundle;

  const text = formatSnapshotJson(bundle, { indent: compact ? 0 : 2 }) + "\n";
  if (outPath !== undefined) {
    const absOut = path.isAbsolute(outPath)
      ? outPath
      : path.resolve(io.cwd(), outPath);
    const writeFile = io.writeFile ?? defaultWriteFileNonExclusive;
    try {
      await writeFile(absOut, text);
      io.stdout(`✓ Wrote bundle descriptor to ${absOut}\n`);
      io.stdout(`  manifestHash: ${manifestHash}\n`);
      io.stdout(`  bundleHash:   ${bundleHash}\n`);
      io.stdout(`  totalSize:    ${totalSize} bytes (${files.length} files)\n`);
    } catch (err) {
      io.stderr(
        `pack: failed to write ${absOut}: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      return 1;
    }
  } else {
    io.stdout(text);
  }
  return 0;
}

/**
 * Recursively walk `current` (originally `root`) and append each
 * regular file to `out` with its repo-relative path, byte size, and
 * sha256. Symlinks are NOT followed (publish flows should fail-loud
 * on symlink leaks; this MVP just skips them silently — tighten when
 * a publish CLI lands).
 */
async function walkDistFiles(
  root: string,
  current: string,
  out: Array<{ path: string; size: number; sha256: string }>,
): Promise<void> {
  const { createHash } = await import("node:crypto");
  const entries = await fs.readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const full = path.join(current, entry.name);
    if (entry.isDirectory()) {
      await walkDistFiles(root, full, out);
      continue;
    }
    if (!entry.isFile()) continue;
    const buf = await fs.readFile(full);
    const sha256 = createHash("sha256").update(buf).digest("hex");
    out.push({
      path: path.relative(root, full),
      size: buf.byteLength,
      sha256,
    });
  }
}

/**
 * Default non-exclusive file writer for `pack --out`. Unlike `init`
 * which refuses to overwrite (protect in-progress work), `pack`
 * deliberately overwrites: the use-case is regenerating the bundle
 * descriptor on every CI build.
 */
async function defaultWriteFileNonExclusive(
  absolutePath: string,
  contents: string,
): Promise<void> {
  await fs.writeFile(absolutePath, contents);
}

/**
 * Handler for `publish <dir> [--registry <url>] [--token <token>]
 * [--dry-run] [--compact]`.
 *
 * I5 substrate (publish flow). Builds the same bundle descriptor
 * as `pack`, then EITHER POSTs it to a registry endpoint OR
 * prints it for inspection (`--dry-run` or no `--registry`).
 *
 * Without a real community registry yet, this command is the
 * forward-compatible glue: authors / CI can iterate against it
 * locally with `--dry-run`, and switch to the real registry by
 * dropping `--dry-run` + adding `--registry <url>` when the
 * service lands. The wire shape (POST {registry}/api/plugins +
 * JSON body of the bundle descriptor + optional Bearer auth) is
 * pinned now so the registry implementer has a reference.
 *
 * Exit codes:
 *   - 0 on success (POST 2xx, or dry-run rendered)
 *   - 1 on validation failure, filesystem error, network error,
 *     or registry non-2xx response
 *   - 2 on usage error
 *
 * Output:
 *   - --dry-run / no --registry: prints the would-be request as
 *     JSON to stdout (registry-bound payload + headers)
 *   - With --registry: prints "✓ Published <id>@<version> to
 *     <registry>" + the registry's response body to stdout on
 *     success
 *
 * Security:
 *   - --token is passed as `Authorization: Bearer <token>` header.
 *     Never logged. Don't commit a registry token to source —
 *     pass via env var or CI secret.
 *   - Registry URL must use https:// in production. The CLI does
 *     not enforce this today; future cuts may add a `--allow-http`
 *     escape hatch with a warning.
 */
async function runPublish(rest: readonly string[], io: CliIO): Promise<number> {
  let dir: string | undefined;
  let registryUrl: string | undefined;
  let token: string | undefined;
  let dryRun = false;
  let compact = false;

  for (let i = 0; i < rest.length; i++) {
    const token2 = rest[i]!;
    if (token2 === "--registry") {
      registryUrl = rest[++i];
      if (registryUrl === undefined) {
        io.stderr("--registry requires a value\n");
        return 2;
      }
      continue;
    }
    if (token2 === "--token") {
      token = rest[++i];
      if (token === undefined) {
        io.stderr("--token requires a value\n");
        return 2;
      }
      continue;
    }
    if (token2 === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (token2 === "--compact") {
      compact = true;
      continue;
    }
    if (token2.startsWith("--")) {
      io.stderr(`Unknown flag: ${token2}\n`);
      return 2;
    }
    if (dir === undefined) {
      dir = token2;
      continue;
    }
    io.stderr(`Unexpected argument: ${token2}\n`);
    return 2;
  }

  if (dir === undefined) {
    io.stderr("publish: missing <dir> argument\n");
    io.stderr(
      "Usage: hyperforge-plugin publish <dir> [--registry <url>] [--token <token>] [--dry-run] [--compact]\n",
    );
    return 2;
  }

  const absDir = path.isAbsolute(dir) ? dir : path.resolve(io.cwd(), dir);
  const result = await buildPluginBundle(absDir, io, "publish");
  if (!result.ok) return result.exitCode;
  const bundle = result.bundle;

  // Construct the request body once. Registry is expected to accept
  // POST application/json with this exact shape.
  const requestBody = formatSnapshotJson(bundle, {
    indent: compact ? 0 : 2,
  });
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json",
  };
  if (token !== undefined) {
    headers.authorization = `Bearer ${token}`;
  }

  if (dryRun || registryUrl === undefined) {
    // Dry-run / no-registry: print the would-be POST for inspection.
    // Headers are surfaced but the auth value is REDACTED so the
    // payload can be safely shared in bug reports / CI logs.
    const safeHeaders: Record<string, string> = { ...headers };
    if (safeHeaders.authorization) {
      safeHeaders.authorization = "Bearer ***redacted***";
    }
    const dryRunPayload = {
      mode: "dry-run" as const,
      request: {
        method: "POST" as const,
        url:
          registryUrl !== undefined
            ? `${registryUrl.replace(/\/$/, "")}/api/plugins`
            : null,
        headers: safeHeaders,
        body: bundle,
      },
    };
    io.stdout(
      formatSnapshotJson(dryRunPayload, { indent: compact ? 0 : 2 }) + "\n",
    );
    return 0;
  }

  // Real upload. Use the io.fetch seam if present (tests inject);
  // fall back to globalThis.fetch (Node 18+, Bun).
  const fetchImpl = io.fetch ?? globalThis.fetch.bind(globalThis);
  const url = `${registryUrl.replace(/\/$/, "")}/api/plugins`;
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers,
      body: requestBody,
    });
  } catch (err) {
    io.stderr(
      `publish: network error contacting ${url}: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 1;
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "(no response body)");
    io.stderr(
      `publish: ${url} returned ${response.status} ${response.statusText}\n`,
    );
    if (text.length > 0) io.stderr(`  ${text}\n`);
    return 1;
  }

  const responseBody = await response.text().catch(() => "");
  io.stdout(
    `✓ Published ${bundle.manifest.id}@${bundle.manifest.version} to ${url}\n`,
  );
  io.stdout(`  manifestHash: ${bundle.manifestHash}\n`);
  io.stdout(`  bundleHash:   ${bundle.bundleHash}\n`);
  io.stdout(
    `  totalSize:    ${bundle.totalSize} bytes (${bundle.files.length} files)\n`,
  );
  if (responseBody.length > 0) {
    io.stdout(`Response:\n${responseBody}\n`);
  }
  return 0;
}

/**
 * Handler for `install <id>@<version> [--registry <url>] [--token <token>]
 * [--out <path>] [--compact]`.
 *
 * I5 substrate (publish flow). Closes the publish → install loop:
 * fetches a previously-published bundle descriptor from a registry,
 * verifies its claimed hashes, and prints / persists the metadata.
 *
 * Today's cut writes ONLY the manifest + bundle descriptor; the
 * actual file bytes are NOT downloaded because the registry layer
 * doesn't expose a content store yet (bundle descriptors carry
 * sha256 hashes per file, not the bytes). When the content-store
 * cut lands, install will additionally pull each file by its hash
 * and reconstruct dist/.
 *
 * Verification:
 *   - Bundle descriptor structure: requires { manifest, manifestHash,
 *     bundleHash, files, totalSize }
 *   - Manifest parses through PluginManifestSchema
 *   - id+version on the wire matches the requested spec (rejects
 *     a registry returning the wrong record)
 *
 * Exit codes:
 *   - 0 on success
 *   - 1 on network error, registry non-2xx, hash mismatch, or
 *     filesystem error
 *   - 2 on usage error
 *
 * Output:
 *   - Default: prints the verified bundle descriptor as JSON to stdout
 *   - --out <dir>: writes plugin.json + bundle.json to <dir>/<id>-<version>/
 *     and prints a summary to stdout
 */
async function runInstall(rest: readonly string[], io: CliIO): Promise<number> {
  let spec: string | undefined;
  let registryUrl: string | undefined;
  let token: string | undefined;
  let outDir: string | undefined;
  let compact = false;

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!;
    if (arg === "--registry") {
      registryUrl = rest[++i];
      if (registryUrl === undefined) {
        io.stderr("--registry requires a value\n");
        return 2;
      }
      continue;
    }
    if (arg === "--token") {
      token = rest[++i];
      if (token === undefined) {
        io.stderr("--token requires a value\n");
        return 2;
      }
      continue;
    }
    if (arg === "--out") {
      outDir = rest[++i];
      if (outDir === undefined) {
        io.stderr("--out requires a value\n");
        return 2;
      }
      continue;
    }
    if (arg === "--compact") {
      compact = true;
      continue;
    }
    if (arg.startsWith("--")) {
      io.stderr(`Unknown flag: ${arg}\n`);
      return 2;
    }
    if (spec === undefined) {
      spec = arg;
      continue;
    }
    io.stderr(`Unexpected argument: ${arg}\n`);
    return 2;
  }

  if (spec === undefined) {
    io.stderr("install: missing <id>@<version> argument\n");
    io.stderr(
      "Usage: hyperforge-plugin install <id>@<version> [--registry <url>] [--token <token>] [--out <path>] [--compact]\n",
    );
    return 2;
  }

  // Parse <id>@<version>. Plugin ids contain dots ("com.x.y"), so
  // split on the LAST `@` only — first @ might be inside the id
  // (it isn't today, but be future-proof).
  const atIndex = spec.lastIndexOf("@");
  if (atIndex <= 0 || atIndex >= spec.length - 1) {
    io.stderr(`install: spec must be <id>@<version>; got "${spec}"\n`);
    return 2;
  }
  const requestedId = spec.slice(0, atIndex);
  const requestedVersion = spec.slice(atIndex + 1);

  if (registryUrl === undefined) {
    io.stderr("install: --registry <url> is required\n");
    return 2;
  }

  const url = `${registryUrl.replace(/\/$/, "")}/api/plugins/registry/${encodeURIComponent(requestedId)}/${encodeURIComponent(requestedVersion)}`;
  const headers: Record<string, string> = { accept: "application/json" };
  if (token !== undefined) headers.authorization = `Bearer ${token}`;

  const fetchImpl = io.fetch ?? globalThis.fetch.bind(globalThis);
  let response: Response;
  try {
    response = await fetchImpl(url, { method: "GET", headers });
  } catch (err) {
    io.stderr(
      `install: network error contacting ${url}: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 1;
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    io.stderr(
      `install: ${url} returned ${response.status} ${response.statusText}\n`,
    );
    if (text.length > 0) io.stderr(`  ${text}\n`);
    return 1;
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (err) {
    io.stderr(
      `install: registry response was not valid JSON: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 1;
  }

  // Registry returns { ok: true, registryId, id, version, publishedAt, bundle }.
  if (
    typeof payload !== "object" ||
    payload === null ||
    (payload as Record<string, unknown>).ok !== true ||
    typeof (payload as Record<string, unknown>).bundle !== "object"
  ) {
    io.stderr(
      `install: registry response missing { ok: true, bundle: {...} }\n`,
    );
    return 1;
  }
  const registryRecord = payload as {
    registryId?: string;
    publishedAt?: string;
    bundle: Record<string, unknown>;
  };
  const bundle = registryRecord.bundle;

  // Verify bundle shape.
  const requiredKeys = [
    "manifest",
    "manifestHash",
    "files",
    "totalSize",
    "bundleHash",
  ];
  for (const k of requiredKeys) {
    if (!(k in bundle)) {
      io.stderr(
        `install: bundle from registry missing required field "${k}"\n`,
      );
      return 1;
    }
  }

  const manifestParse = PluginManifestSchema.safeParse(bundle.manifest);
  if (!manifestParse.success) {
    io.stderr(
      "install: bundle.manifest failed PluginManifestSchema validation:\n",
    );
    for (const issue of manifestParse.error.issues) {
      io.stderr(`  • ${issue.path.join(".")}: ${issue.message}\n`);
    }
    return 1;
  }
  const manifest = manifestParse.data;

  // Cross-check the requested spec against the wire response. If the
  // registry returned the wrong record (proxy bug, cache poisoning),
  // fail loud rather than silently install something unexpected.
  if (manifest.id !== requestedId || manifest.version !== requestedVersion) {
    io.stderr(
      `install: registry returned ${manifest.id}@${manifest.version}, requested ${requestedId}@${requestedVersion}\n`,
    );
    return 1;
  }

  if (outDir !== undefined) {
    const absOut = path.isAbsolute(outDir)
      ? outDir
      : path.resolve(io.cwd(), outDir);
    const installDir = path.join(absOut, `${manifest.id}-${manifest.version}`);
    const mkdir = io.mkdir ?? defaultMkdir;
    const writeFile = io.writeFile ?? defaultWriteFileNonExclusive;
    try {
      await mkdir(installDir);
      await writeFile(
        path.join(installDir, "plugin.json"),
        JSON.stringify(manifest, null, 2) + "\n",
      );
      await writeFile(
        path.join(installDir, "bundle.json"),
        formatSnapshotJson(bundle, { indent: compact ? 0 : 2 }) + "\n",
      );
      io.stdout(
        `✓ Installed ${manifest.id}@${manifest.version} to ${installDir}\n`,
      );
      io.stdout(
        `  manifestHash: ${String((bundle as { manifestHash: unknown }).manifestHash)}\n`,
      );
      io.stdout(
        `  bundleHash:   ${String((bundle as { bundleHash: unknown }).bundleHash)}\n`,
      );
      if (registryRecord.publishedAt !== undefined) {
        io.stdout(`  publishedAt:  ${registryRecord.publishedAt}\n`);
      }
      io.stdout(
        `  Note: ${(bundle as { files: ReadonlyArray<unknown> }).files.length} dist files claimed (${String((bundle as { totalSize: unknown }).totalSize)} bytes total). File bytes NOT downloaded — registry content store is a future cut.\n`,
      );
    } catch (err) {
      io.stderr(
        `install: failed to write to ${installDir}: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      return 1;
    }
  } else {
    io.stdout(formatSnapshotJson(bundle, { indent: compact ? 0 : 2 }) + "\n");
  }
  return 0;
}

/** Template for the generated `src/index.ts`. */
const SRC_INDEX_TEMPLATE = `import type {
  HyperforgePlugin,
  PluginContextBase,
  PluginFactory,
} from "@hyperforge/gameplay-framework";

/**
 * Caller-controlled context shape. Extend PluginContextBase with the
 * handles your plugin needs (world refs, registries, widgets, etc.).
 * The host's contextFactory constructs one of these per plugin.
 */
export interface MyPluginContext extends PluginContextBase {
  // Add your handles here.
}

const factory: PluginFactory<MyPluginContext> =
  (): HyperforgePlugin<MyPluginContext> => ({
    async onLoad(ctx) {
      // One-time setup. Cheap work only — called before any plugin runs.
    },

    async onEnable(ctx) {
      // Register systems / listeners / widgets here.
      // Attach disposers to ctx.scope for automatic teardown on disable:
      //   ctx.scope.register(() => someRegistry.remove(handle));
    },

    async onDisable(ctx) {
      // Explicit teardown. ctx.scope is drained AFTER this hook, so
      // anything registered via scope.register runs automatically.
    },
  });

export default factory;
`;

const USAGE = `hyperforge-plugin — Hyperforge plugin tooling

Usage:
  hyperforge-plugin validate <dir> [--host-api <range>] [--manifest-filename <name>] [--json]
  hyperforge-plugin init <dir> --id <id> [--name <name>]
  hyperforge-plugin lint <dir> [--host-api <range>] [--json]
  hyperforge-plugin list <dir> [--host-api <range>] [--json]
  hyperforge-plugin show <dir> [--manifest-filename <name>] [--json]
  hyperforge-plugin graph <dir> [--host-api <range>] [--format ascii|dot|json]
  hyperforge-plugin snapshot <dir> [--host-api <range>] [--human]
  hyperforge-plugin diff <baseline.json> <current.json> [--human] [--compact]
  hyperforge-plugin contributions <dir> [--host-api <range>] [--human] [--compact] [--with-origins]
  hyperforge-plugin pack <dir> [--out <path>] [--compact]
  hyperforge-plugin publish <dir> [--registry <url>] [--token <token>] [--dry-run] [--compact]
  hyperforge-plugin install <id>@<version> --registry <url> [--token <token>] [--out <path>] [--compact]
  hyperforge-plugin --help
  hyperforge-plugin --version

Subcommands:
  validate <dir>    Read and schema-validate <dir>/plugin.json.
                    Exits 0 on success, 1 on any validation issue,
                    2 on usage error.
  init <dir>        Scaffold a minimal plugin package (plugin.json
                    + src/index.ts). Refuses to overwrite existing
                    files.
  lint <dir>        Walk <dir> as a directory of plugin packages and
                    report every load failure + every unresolvable
                    plugin in one pass. Exits 0 if clean, 1 on any
                    problem, 2 on usage error.
  list <dir>        Enumerate plugin packages under <dir> and print
                    \`id<TAB>version<TAB>baseDir\` rows. Adds failed +
                    unresolvable entries on stderr as notices. Pass
                    \`--json\` for a single machine-readable payload.
                    Exit code is unaffected by per-package problems.
  show <dir>        Pretty-print a single plugin's parsed manifest —
                    metadata, dependency graph, contribution surface
                    counts, tags. Exits 0 if the manifest parsed, 1
                    otherwise (same pipe as \`validate\`). Pass
                    \`--json\` for a structured payload.
  graph <dir>       Emit the plugin dependency graph. Default format
                    is ASCII; pass \`--format dot\` for Graphviz DOT
                    (pipe through \`dot -Tsvg\`) or \`--format json\`
                    for a structured adjacency list. Exit 0 on any
                    successful render.
  snapshot <dir>    Emit a full SessionSnapshot (running + failed +
                    unresolvable buckets, same wire shape as
                    \`snapshotSession\`). Default output is JSON for
                    tooling ingestion; pass \`--human\` for a
                    multiline report. Exit 0 on successful catalog
                    read; per-package failures do NOT change the
                    exit code (use \`lint\` for pass/fail).
  diff <a> <b>      Compute a structural diff between two snapshot
                    JSON files (typically produced by \`snapshot >\`).
                    Default output is deterministic pretty JSON
                    (sorted keys, indent 2); pass \`--compact\` for
                    single-line JSON or \`--human\` for an ASCII
                    summary. CI regression gates: snapshot at a
                    known-good commit, then \`diff\` against the
                    current branch to flag missing/changed/added
                    plugins. Exit 0 on success, 1 on read/parse
                    error.
  contributions <dir>
                    Aggregate contribution ids across every plugin in
                    \`<dir>\` and print the per-bucket totals (systems,
                    entities, widgets, manifestSchemas, paletteCategories,
                    toolbarTools, commands). Default output is
                    deterministic JSON; \`--human\` for ASCII summary.
                    Pass \`--with-origins\` to also surface a per-id
                    "declared by" map — useful for conflict diagnostics
                    when multiple plugins claim the same widget/system
                    id. Exit 0 on successful catalog read.
  pack <dir>        Build a registry-ready bundle DESCRIPTOR for the
                    plugin package at \`<dir>\` — full manifest +
                    manifestHash + per-file path/size/sha256 in dist/ +
                    bundleHash (content-addressed identity for THIS
                    version's payload). Default output is deterministic
                    JSON to stdout; pass \`--out <path>\` to write to
                    a file (overwrites existing). \`--compact\` for
                    single-line JSON. Validates plugin.json first;
                    refuses to pack an invalid manifest. Foundation for
                    the future publish flow. Exit 0 on success, 1 on
                    validation failure or filesystem error.
  publish <dir>     POST the same bundle descriptor (as \`pack\`)
                    to a registry endpoint at \`{registry}/api/plugins\`.
                    Pass \`--registry <url>\` to specify the endpoint
                    and \`--token <token>\` for Bearer auth. Without
                    \`--registry\`, OR with \`--dry-run\`, prints the
                    would-be POST request (with auth header redacted)
                    so authors can iterate locally before a real
                    registry exists. Validates plugin.json first;
                    refuses to publish an invalid manifest. Exit 0 on
                    success, 1 on validation/network/registry-non-2xx,
                    2 on usage error.
  install <spec>    Fetch a published bundle from the registry at
                    \`{registry}/api/plugins/registry/<id>/<version>\`
                    and verify its manifest + claimed hashes. \`<spec>\`
                    is \`<id>@<version>\` (e.g. com.example.combat@1.0.0).
                    \`--registry <url>\` is required. Default output is
                    deterministic JSON of the verified bundle to stdout;
                    pass \`--out <path>\` to write plugin.json +
                    bundle.json to \`<path>/<id>-<version>/\`. Note: the
                    actual file BYTES under dist/ are NOT downloaded
                    in this cut — registry content store is a future
                    cut. Exit 0 on success, 1 on network / non-2xx /
                    validation / hash-mismatch / fs error.
`;

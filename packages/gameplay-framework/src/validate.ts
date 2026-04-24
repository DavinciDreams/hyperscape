/**
 * Programmatic plugin-manifest validator.
 *
 * Lighter-weight companion to `loadPluginPackage` — reads and
 * schema-validates `plugin.json` WITHOUT invoking the entry module's
 * dynamic `import()`. Perfect for:
 *   - CI gates (check the manifest is well-formed before publishing)
 *   - Editor "validate before save" flows (the factory may not even
 *     exist yet — the author is editing manifest-only)
 *   - A future `hyperforge-plugin validate <dir>` CLI binary — this
 *     module is the programmatic core it will wrap
 *
 * Returns a discriminated-union result `ValidationResult` instead of
 * throwing, so callers can surface aggregated diagnostics to the user
 * without try/catch plumbing. All three failure modes surface the same
 * way (read-failed / schema-rejected / API-incompatible) — `issues[]`
 * is always a flat string array.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";

import {
  PluginManifestSchema,
  type PluginManifest,
} from "@hyperforge/manifest-schema";

import { satisfiesPluginVersionRange } from "./semver.js";

/** Default manifest filename — matches `loadPluginPackage` default. */
const DEFAULT_MANIFEST_FILENAME = "plugin.json";

/** Result of `validatePluginDirectory`. Discriminated on `ok`. */
export type ValidationResult =
  | {
      readonly ok: true;
      readonly manifest: PluginManifest;
      readonly manifestPath: string;
    }
  | {
      readonly ok: false;
      readonly issues: readonly string[];
      readonly manifestPath: string;
    };

/** Options for `validatePluginDirectory`. */
export interface ValidatePluginOptions {
  /** Manifest filename. Defaults to `"plugin.json"`. */
  readonly manifestFilename?: string;

  /**
   * If provided, also gate `manifest.hyperforgeApi` against this host
   * range via `satisfiesPluginVersionRange`. Mismatch produces an
   * issue. Use `"*"` (or omit) to skip the check.
   */
  readonly hostApiRange?: string;

  /**
   * Override for reading the manifest JSON from disk. Tests + editor
   * integrations (unsaved buffer) use this to skip `fs.readFile`.
   */
  readonly manifestLoader?: (absolutePath: string) => Promise<unknown>;
}

/**
 * Result of {@link validatePluginManifestJson}. Narrower than
 * {@link ValidationResult} because pure-in-memory validation carries
 * no filesystem path.
 */
export type ManifestValidationResult =
  | {
      readonly ok: true;
      readonly manifest: PluginManifest;
    }
  | {
      readonly ok: false;
      readonly issues: readonly string[];
    };

/** Options for {@link validatePluginManifestJson}. */
export interface ValidateManifestOptions {
  /**
   * If provided, also gate `manifest.hyperforgeApi` against this host
   * range via `satisfiesPluginVersionRange`. Mismatch produces an
   * issue. Use `"*"` (or omit) to skip the check.
   */
  readonly hostApiRange?: string;
}

/**
 * Pure in-memory variant of {@link validatePluginDirectory}. Takes an
 * already-parsed JSON value (`raw`) and runs the same schema check +
 * optional host-API gate — no filesystem I/O.
 *
 * Lands the same three failure modes as the directory variant minus
 * read-failed (which can't happen here). Use for:
 *   - Editor `validate before save` flows (unsaved buffer)
 *   - Remote registry ingestion (manifest arrives as HTTP body)
 *   - Tests / CI pre-publish lints of already-parsed manifests
 *
 * The directory variant delegates to this function internally after
 * reading + parsing `plugin.json`, so every schema/API-gate code path
 * is shared.
 */
export function validatePluginManifestJson(
  raw: unknown,
  opts: ValidateManifestOptions = {},
): ManifestValidationResult {
  const parsed = PluginManifestSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map(formatZodIssue),
    };
  }
  const manifest = parsed.data;

  if (opts.hostApiRange !== undefined && opts.hostApiRange !== "*") {
    if (
      !satisfiesPluginVersionRange(manifest.hyperforgeApi, opts.hostApiRange)
    ) {
      return {
        ok: false,
        issues: [
          `hyperforgeApi ${manifest.hyperforgeApi} does not satisfy host range ${opts.hostApiRange}`,
        ],
      };
    }
  }

  return { ok: true, manifest };
}

/**
 * Validate the `plugin.json` inside `baseDir` WITHOUT loading the
 * entry module.
 *
 * `baseDir` must be absolute — callers resolve their own paths (this
 * function deliberately doesn't consult process.cwd() to keep test
 * behavior hermetic).
 */
export async function validatePluginDirectory(
  baseDir: string,
  opts: ValidatePluginOptions = {},
): Promise<ValidationResult> {
  const manifestFilename = opts.manifestFilename ?? DEFAULT_MANIFEST_FILENAME;
  const manifestPath = path.join(baseDir, manifestFilename);

  // Step 1 — read raw JSON. Any I/O or parse error becomes a single
  // issue string; the caller can't meaningfully distinguish "file not
  // found" from "file corrupted" at this layer.
  let raw: unknown;
  try {
    raw = await readManifestJson(manifestPath, opts.manifestLoader);
  } catch (cause) {
    return {
      ok: false,
      manifestPath,
      issues: [
        `Failed to read ${manifestFilename}: ` +
          (cause instanceof Error ? cause.message : String(cause)),
      ],
    };
  }

  // Steps 2-3 — schema-validate + optional host-API gate. Delegated
  // to the pure `validatePluginManifestJson` helper so in-memory and
  // on-disk callers share one schema/gate code path.
  const result = validatePluginManifestJson(raw, {
    hostApiRange: opts.hostApiRange,
  });
  if (!result.ok) {
    return { ok: false, manifestPath, issues: result.issues };
  }
  return { ok: true, manifest: result.manifest, manifestPath };
}

async function readManifestJson(
  manifestPath: string,
  manifestLoader: ValidatePluginOptions["manifestLoader"],
): Promise<unknown> {
  if (manifestLoader !== undefined) {
    return await manifestLoader(manifestPath);
  }
  const text = await fs.readFile(manifestPath, "utf8");
  return JSON.parse(text);
}

/**
 * Format a Zod issue into a short one-line string like
 * `"dependencies.0.id: Invalid input"`. Root-level issues (no path)
 * collapse to just the message.
 */
function formatZodIssue(issue: {
  path: ReadonlyArray<PropertyKey>;
  message: string;
}): string {
  const path = issue.path.map((p) => String(p)).join(".");
  return path.length > 0 ? `${path}: ${issue.message}` : issue.message;
}

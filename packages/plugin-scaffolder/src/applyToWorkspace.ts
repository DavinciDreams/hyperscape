/**
 * `applyToWorkspace` — write a `ScaffoldResult` to disk.
 *
 * The scaffolder itself is pure (spec → files in memory). This
 * helper is the thin filesystem-touching layer the CLI, MCP server,
 * and Eliza dispatcher all share. Kept in this package so callers
 * don't have to re-implement the same write loop.
 *
 * Behavior:
 *   - Creates parent directories as needed.
 *   - Refuses to overwrite existing files unless `force: true`.
 *     Returns each conflicting path so the caller can list them.
 *   - In `dryRun: true` mode, performs no writes — only computes
 *     the would-be plan. Same return shape, `written: []`.
 */

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { ScaffoldResult } from "./types.js";

export interface ApplyToWorkspaceOptions {
  /**
   * Workspace root. Every file path in `result.files` is resolved
   * relative to this. Defaults to `process.cwd()`.
   */
  readonly workspaceRoot?: string;
  /** Skip writes; just report what would happen. */
  readonly dryRun?: boolean;
  /** Overwrite files that already exist. Default false. */
  readonly force?: boolean;
}

export interface ApplyToWorkspaceReport {
  /** Workspace-relative paths that were written (empty when dryRun). */
  readonly written: ReadonlyArray<string>;
  /** Workspace-relative paths skipped because they already exist. */
  readonly skipped: ReadonlyArray<string>;
  /** Workspace-relative paths the caller still needs to edit by hand. */
  readonly registrationSites: ReadonlyArray<{
    readonly path: string;
    readonly hint: string;
  }>;
}

export function applyToWorkspace(
  result: ScaffoldResult,
  options: ApplyToWorkspaceOptions = {},
): ApplyToWorkspaceReport {
  const root = options.workspaceRoot ?? process.cwd();
  const dryRun = options.dryRun ?? false;
  const force = options.force ?? false;

  const written: string[] = [];
  const skipped: string[] = [];

  for (const file of result.files) {
    const abs = resolve(root, file.path);
    const exists = existsSync(abs);
    if (exists && !force) {
      skipped.push(file.path);
      continue;
    }
    if (!dryRun) {
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, file.content, "utf8");
    }
    written.push(file.path);
  }

  return {
    written: dryRun ? [] : written,
    skipped,
    registrationSites: result.registrationSites.map((s) => ({
      path: s.path,
      hint: s.hint,
    })),
  };
}

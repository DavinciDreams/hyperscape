/**
 * `bun run scripts/build-catalog.ts` — emits `dist/catalog.json`.
 *
 * Phase A1.3 of `PLAN_AI_AUTHORING_FOUNDATIONS.md`.
 *
 * Walks every `*Widget.tsx` file in known widget directories,
 * dynamically imports it, looks for a `*Registration`-shaped export
 * (`{ widget, Component }`), and emits a single static catalog
 * document keyed by widget id.
 *
 * Why a small script + an in-process import (instead of pure AST):
 *   - Each widget file is self-contained: it imports only
 *     `@hyperforge/ui-framework`, `react`, and `zod`. None of
 *     those trigger the duel-arena module-load failure that
 *     blocks the plugin barrel today.
 *   - Importing the file gives us the *real* Zod schema, so the
 *     prop summary in the static catalog matches what the runtime
 *     catalog produces. Pure AST parsing would have to re-implement
 *     the schema introspection.
 *   - The script is bun-runnable; no build step required for the
 *     script itself.
 *
 * The output `dist/catalog.json` is consumed by external tools
 * (CLI, MCP server, AI agents that don't boot the framework) that
 * want to query "what widgets exist in HyperForge today?".
 */

import { promises as fs } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { Widget, WidgetRegistration } from "@hyperforge/ui-framework";

import { buildStaticCatalogDocument, buildStaticEntry } from "../src/index";
import type { StaticCatalogEntry } from "../src/index";

// ---- config --------------------------------------------------------

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_DIR = resolve(SCRIPT_DIR, "..");
const REPO_ROOT = resolve(PACKAGE_DIR, "../..");

/**
 * Directories that contain `*Widget.tsx` files we want to index.
 * Add new directories here when new plugins / widget packages
 * land in the monorepo.
 */
const WIDGET_DIRS: ReadonlyArray<string> = [
  "packages/hyperscape-plugin/src/widgets",
  "packages/ui-widgets/src/widgets",
];

const OUTPUT_FILE = resolve(PACKAGE_DIR, "dist/catalog.json");

// ---- helpers -------------------------------------------------------

/**
 * Test whether a value walks like a `WidgetRegistration` —
 * `{ widget: { manifest: { id, ... }, propsSchema, defaultProps },
 * Component: ... }`. We can't use `instanceof` because the type
 * is structural; this duck-typing is sufficient for our purposes.
 */
function isWidgetRegistration(
  v: unknown,
): v is WidgetRegistration<Record<string, unknown>, unknown> {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  if (!r.widget || typeof r.widget !== "object") return false;
  const w = r.widget as Record<string, unknown>;
  if (!w.manifest || typeof w.manifest !== "object") return false;
  const m = w.manifest as Record<string, unknown>;
  if (typeof m.id !== "string") return false;
  if (typeof r.Component !== "function") return false;
  return true;
}

interface DiscoveredRegistration {
  readonly widget: Widget<Record<string, unknown>>;
  readonly source: string;
  readonly sourcePath: string;
}

async function listWidgetFiles(): Promise<string[]> {
  const out: string[] = [];
  for (const dir of WIDGET_DIRS) {
    const abs = resolve(REPO_ROOT, dir);
    let entries: string[];
    try {
      entries = await fs.readdir(abs);
    } catch {
      // Skip dirs that don't exist (allows the config to be
      // forward-looking without breaking the build).
      continue;
    }
    for (const name of entries) {
      if (!name.endsWith("Widget.tsx")) continue;
      out.push(resolve(abs, name));
    }
  }
  return out.sort();
}

async function discoverRegistrations(
  filePath: string,
): Promise<ReadonlyArray<DiscoveredRegistration>> {
  const source = await fs.readFile(filePath, "utf8");
  const sourcePath = relative(REPO_ROOT, filePath).replace(/\\/g, "/");
  let mod: Record<string, unknown>;
  try {
    mod = (await import(filePath)) as Record<string, unknown>;
  } catch (err) {
    console.warn(
      `[build-catalog] skipping ${sourcePath}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return [];
  }
  const out: DiscoveredRegistration[] = [];
  for (const value of Object.values(mod)) {
    if (isWidgetRegistration(value)) {
      out.push({
        widget: value.widget as Widget<Record<string, unknown>>,
        source,
        sourcePath,
      });
    }
  }
  return out;
}

// ---- main ----------------------------------------------------------

async function main(): Promise<void> {
  const files = await listWidgetFiles();
  console.log(
    `[build-catalog] scanning ${files.length} widget file(s) across ${WIDGET_DIRS.length} dir(s)`,
  );

  const entries: StaticCatalogEntry[] = [];
  const seenIds = new Set<string>();
  for (const filePath of files) {
    const discovered = await discoverRegistrations(filePath);
    for (const d of discovered) {
      const id = d.widget.manifest.id;
      if (seenIds.has(id)) {
        console.warn(
          `[build-catalog] duplicate id "${id}" — keeping first occurrence`,
        );
        continue;
      }
      seenIds.add(id);
      entries.push(buildStaticEntry(d));
    }
  }

  const doc = buildStaticCatalogDocument(entries);
  await fs.mkdir(dirname(OUTPUT_FILE), { recursive: true });
  await fs.writeFile(OUTPUT_FILE, JSON.stringify(doc, null, 2) + "\n");

  const outRel = relative(REPO_ROOT, OUTPUT_FILE).replace(/\\/g, "/");
  console.log(
    `[build-catalog] wrote ${doc.widgets.length} entries to ${outRel}`,
  );
  console.log(
    `[build-catalog] by category: ${JSON.stringify(doc.stats.byCategory)}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

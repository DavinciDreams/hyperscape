/**
 * Bulk lifecycle operations over a *subset* of plugins.
 *
 * `PluginLoader.enableAll` / `disableAll` already handle the full
 * catalog. But editor multi-select — "disable these three" or
 * "reload every failed plugin" — needs dependency-safe ordering
 * over an explicit subset. That's what this module provides.
 *
 * Ordering rules match the bulk whole-catalog methods:
 *   - `enablePluginSubset`  → forward topological order (deps first)
 *   - `disablePluginSubset` → reverse topological order (dependents first)
 *   - `reloadPluginSubset`  → reverse-then-forward (tear down → rebuild)
 *
 * Each plugin is attempted independently via
 * `executePluginCommand`-shaped lifecycle methods. Individual
 * failures are captured into a `BulkOperationResult` entry rather
 * than throwing mid-stream — callers receive one entry per input
 * id so multi-select UI can render a per-row success/fail state.
 */

import type { PluginCatalog } from "./PluginCatalog.js";
import type { PluginHost, PluginContextBase } from "./PluginHost.js";

export type BulkMutation = "enable" | "disable" | "reload";

export type BulkItemResult =
  | {
      readonly kind: "applied";
      readonly pluginId: string;
      readonly mutation: BulkMutation;
    }
  | {
      readonly kind: "skipped";
      readonly pluginId: string;
      readonly mutation: BulkMutation;
      readonly reason: string;
    }
  | {
      readonly kind: "failed";
      readonly pluginId: string;
      readonly mutation: BulkMutation;
      readonly error: Error;
    };

export interface BulkOperationResult {
  readonly mutation: BulkMutation;
  readonly items: readonly BulkItemResult[];
}

export interface BulkOptions {
  /**
   * Passed through to `disablePlugin`. Only meaningful for the
   * disable/reload mutations. When true, disable skips the
   * enabled-dependent check.
   */
  readonly force?: boolean;
  /**
   * When true, a failure on one plugin short-circuits the rest of
   * the batch; remaining ids come back as `skipped` with
   * `reason:"batch-aborted"`. Default: false (continue-on-error).
   */
  readonly abortOnError?: boolean;
}

function orderedSubset(
  catalog: PluginCatalog,
  ids: readonly string[],
  reverse: boolean,
): string[] {
  const idSet = new Set(ids);
  const order = catalog
    .loadOrder()
    .map((m) => m.id)
    .filter((id) => idSet.has(id));
  return reverse ? order.reverse() : order;
}

export async function enablePluginSubset<TContext extends PluginContextBase>(
  host: PluginHost<TContext>,
  pluginIds: readonly string[],
  options: BulkOptions = {},
): Promise<BulkOperationResult> {
  const order = orderedSubset(host.catalog, pluginIds, false);
  return runBatch(order, "enable", options, async (id) => {
    await host.enablePlugin(id);
  });
}

export async function disablePluginSubset<TContext extends PluginContextBase>(
  host: PluginHost<TContext>,
  pluginIds: readonly string[],
  options: BulkOptions = {},
): Promise<BulkOperationResult> {
  const order = orderedSubset(host.catalog, pluginIds, true);
  return runBatch(order, "disable", options, async (id) => {
    await host.disablePlugin(id, { force: options.force });
  });
}

/**
 * Reload every plugin in the subset. Order is reverse-topo (so
 * dependents are torn down first during the implicit disable) and
 * each plugin's own `reloadPlugin` call internally restores its
 * prior state. The final graph ends up in the same state
 * configuration it started in, with fresh instances.
 */
export async function reloadPluginSubset<TContext extends PluginContextBase>(
  host: PluginHost<TContext>,
  pluginIds: readonly string[],
  options: BulkOptions = {},
): Promise<BulkOperationResult> {
  const order = orderedSubset(host.catalog, pluginIds, true);
  return runBatch(order, "reload", options, async (id) => {
    await host.reloadPlugin(id);
  });
}

async function runBatch(
  order: readonly string[],
  mutation: BulkMutation,
  options: BulkOptions,
  op: (id: string) => Promise<void>,
): Promise<BulkOperationResult> {
  const items: BulkItemResult[] = [];
  let aborted = false;
  for (const id of order) {
    if (aborted) {
      items.push({
        kind: "skipped",
        pluginId: id,
        mutation,
        reason: "batch-aborted",
      });
      continue;
    }
    try {
      await op(id);
      items.push({ kind: "applied", pluginId: id, mutation });
    } catch (e) {
      items.push({
        kind: "failed",
        pluginId: id,
        mutation,
        error: e instanceof Error ? e : new Error(String(e)),
      });
      if (options.abortOnError) aborted = true;
    }
  }
  return { mutation, items };
}

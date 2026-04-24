/**
 * Plugin discovery routes — Phase I3 bridge.
 *
 * Surfaces the @hyperforge/gameplay-framework plugin substrate to
 * the asset-forge editor frontend. The editor's bootstrap fetches
 * `/api/plugins/contributions?dir=...` to know which widgets,
 * systems, palette categories, and commands are declared by the
 * plugins it loaded — so it can register them in the UI.
 *
 * Today this route is read-only — the frontend doesn't yet WIRE the
 * returned contributions into the editor. That's the next slice.
 * Landing this server-side surface first means the frontend can
 * iterate against a real backend instead of a mock.
 *
 * Security: the `dir` query param is resolved against `process.cwd()`
 * if relative; absolute paths are accepted but only DEV nodes
 * traverse them — production deployments should pin the directory
 * via a server-side config (TODO when there's a deployment context).
 */

import { Elysia, t } from "elysia";

import {
  aggregateContributions,
  computeContributionOrigins,
  loadPluginCatalog,
  resolvePluginLoadOrder,
  snapshotCatalogResolution,
  type AggregatedContributions,
} from "@hyperforge/gameplay-framework";
import path from "path";

export const pluginRoutes = new Elysia({ prefix: "/api", name: "plugins" })
  .get(
    "/plugins/contributions",
    async ({ query }) => {
      const dir = (query.dir ?? "").trim();
      if (dir.length === 0) {
        return {
          ok: false as const,
          error: "missing required query param: dir",
        };
      }

      const absDir = path.isAbsolute(dir)
        ? dir
        : path.resolve(process.cwd(), dir);

      try {
        const catalog = await loadPluginCatalog(absDir, {});
        const aggregated: AggregatedContributions = aggregateContributions(
          catalog.loaded,
        );
        const origins = query.withOrigins
          ? computeContributionOrigins(catalog.loaded)
          : undefined;

        return {
          ok: true as const,
          dir: absDir,
          pluginCount: catalog.loaded.length,
          failedCount: catalog.failed.length,
          aggregated,
          // Convert Maps → plain objects so the JSON response carries
          // the per-bucket "id → declarers" data structurally (Map
          // serializes to {} via JSON.stringify; useless on the wire).
          origins: origins ? mapOriginsToPlainObject(origins) : undefined,
        };
      } catch (err) {
        return {
          ok: false as const,
          dir: absDir,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
    {
      query: t.Object({
        dir: t.String({
          description:
            "Plugin catalog directory (relative resolves from server cwd)",
        }),
        withOrigins: t.Optional(
          t.Boolean({
            description:
              "Include per-id 'declared by' map for conflict diagnostics",
          }),
        ),
      }),
      detail: {
        tags: ["Plugins"],
        summary: "Aggregate plugin contributions",
        description:
          "Walks the plugin catalog at `dir`, aggregates the per-bucket contribution ids declared by each plugin's manifest, and returns the result. Editor bootstrap calls this to know which widgets/systems/palette categories/commands to register.",
      },
    },
  )
  .get(
    "/plugins/snapshot",
    async ({ query }) => {
      const dir = (query.dir ?? "").trim();
      if (dir.length === 0) {
        return {
          ok: false as const,
          error: "missing required query param: dir",
        };
      }

      const absDir = path.isAbsolute(dir)
        ? dir
        : path.resolve(process.cwd(), dir);

      try {
        const catalog = await loadPluginCatalog(absDir, {});
        const resolution = resolvePluginLoadOrder(catalog.loaded);
        const snapshot = snapshotCatalogResolution(catalog, resolution);
        return {
          ok: true as const,
          dir: absDir,
          snapshot,
        };
      } catch (err) {
        return {
          ok: false as const,
          dir: absDir,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
    {
      query: t.Object({
        dir: t.String({
          description:
            "Plugin catalog directory (relative resolves from server cwd)",
        }),
      }),
      detail: {
        tags: ["Plugins"],
        summary: "Plugin session snapshot",
        description:
          "Walks the plugin catalog at `dir`, resolves load order + dependencies, and returns the JSON-friendly SessionSnapshot — same wire shape produced by `hyperforge-plugin snapshot --json`. Editor uses this for the Plugin Browser status grid.",
      },
    },
  );

/**
 * Convert the per-bucket Maps returned by `computeContributionOrigins`
 * into plain `Record<id, string[]>` objects. JSON.stringify drops Map
 * contents (`new Map([['k','v']])` serializes to `{}`), so the API
 * boundary needs structural conversion.
 */
function mapOriginsToPlainObject(origins: {
  systems: ReadonlyMap<string, ReadonlyArray<string>>;
  entities: ReadonlyMap<string, ReadonlyArray<string>>;
  widgets: ReadonlyMap<string, ReadonlyArray<string>>;
  manifestSchemas: ReadonlyMap<string, ReadonlyArray<string>>;
  paletteCategories: ReadonlyMap<string, ReadonlyArray<string>>;
  toolbarTools: ReadonlyMap<string, ReadonlyArray<string>>;
  commands: ReadonlyMap<string, ReadonlyArray<string>>;
}): Record<string, Record<string, string[]>> {
  const buckets = [
    "systems",
    "entities",
    "widgets",
    "manifestSchemas",
    "paletteCategories",
    "toolbarTools",
    "commands",
  ] as const;
  const result: Record<string, Record<string, string[]>> = {};
  for (const bucket of buckets) {
    const obj: Record<string, string[]> = {};
    for (const [id, declarers] of origins[bucket]) {
      obj[id] = [...declarers];
    }
    result[bucket] = obj;
  }
  return result;
}

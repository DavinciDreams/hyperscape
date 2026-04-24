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
import { PluginManifestSchema } from "@hyperforge/manifest-schema";
import path from "path";

/**
 * Phase I5 community plugin registry — in-memory storage for the
 * substrate cut. Production will swap this for the deployment's
 * persistent store (postgres / s3 / cdn) without changing the
 * route surface or the publish payload shape.
 *
 * Keyed by `${manifest.id}@${manifest.version}` so the same plugin
 * id can have multiple versions; same id+version is treated as a
 * conflict (409). Stored entries carry the bundle descriptor +
 * server-assigned timestamp + monotonic registryId.
 */
interface RegistryEntry {
  readonly registryId: string;
  readonly id: string;
  readonly version: string;
  readonly publishedAt: string;
  readonly bundle: unknown;
}

const registry = new Map<string, RegistryEntry>();
let registryIdCounter = 0;

/**
 * Phase I5 content store — addresses the file-bytes gap in install.
 *
 * The bundle descriptor (cut #1: pack) carries sha256 hashes per
 * file but not the bytes. The content store holds the bytes,
 * keyed by sha256 — content-addressed storage. Publish uploads
 * each dist file BEFORE publishing the bundle metadata; install
 * downloads by sha256 + verifies hash + writes to disk.
 *
 * In-memory Map<sha256, Buffer> for the substrate cut. Production
 * swaps for S3 / CDN / object storage with the same content-
 * addressed semantics — clients verify integrity client-side, so
 * the storage layer can be untrusted (mirror, CDN, etc.).
 */
const contentStore = new Map<string, Buffer>();

/**
 * Test-only reset hook. Routes module exports it for the
 * forthcoming integration tests; production never calls it.
 */
export function _resetPluginRegistryForTests(): void {
  registry.clear();
  registryIdCounter = 0;
  contentStore.clear();
}

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
  )
  .post(
    "/plugins",
    async ({ body, set }) => {
      // Phase I5 community registry endpoint — accepts the bundle
      // descriptor produced by `hyperforge-plugin publish`. The
      // descriptor IS the publish payload (no separate tarball
      // upload yet — that's a future cut).
      //
      // Validation:
      //   1. body must be an object with a `manifest` key
      //   2. manifest must parse through PluginManifestSchema
      //   3. id+version pair must not already exist (409 conflict)
      //
      // On success: returns 201 + the stored entry's registryId,
      // publishedAt timestamp, and registry-relative URL the client
      // can fetch the bundle from later.
      if (typeof body !== "object" || body === null) {
        set.status = 400;
        return { ok: false as const, error: "request body must be an object" };
      }
      const bodyObj = body as Record<string, unknown>;
      if (
        bodyObj.manifest === undefined ||
        typeof bodyObj.manifest !== "object"
      ) {
        set.status = 400;
        return {
          ok: false as const,
          error: "request body missing required `manifest` field",
        };
      }

      const manifestParse = PluginManifestSchema.safeParse(bodyObj.manifest);
      if (!manifestParse.success) {
        set.status = 400;
        return {
          ok: false as const,
          error: "manifest failed schema validation",
          issues: manifestParse.error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        };
      }
      const manifest = manifestParse.data;

      const key = `${manifest.id}@${manifest.version}`;
      if (registry.has(key)) {
        set.status = 409;
        return {
          ok: false as const,
          error: `plugin ${manifest.id}@${manifest.version} already published — bump version to publish again`,
        };
      }

      const registryId = `reg_${(++registryIdCounter).toString(36)}`;
      const publishedAt = new Date().toISOString();
      const entry: RegistryEntry = {
        registryId,
        id: manifest.id,
        version: manifest.version,
        publishedAt,
        bundle: bodyObj,
      };
      registry.set(key, entry);

      set.status = 201;
      return {
        ok: true as const,
        registryId,
        id: manifest.id,
        version: manifest.version,
        publishedAt,
        url: `/api/plugins/registry/${manifest.id}/${manifest.version}`,
      };
    },
    {
      // Body shape varies (the bundle descriptor schema isn't
      // pinned here — we validate it manually above so we can
      // return rich error payloads). Accept arbitrary JSON.
      body: t.Unknown(),
      detail: {
        tags: ["Plugins"],
        summary: "Publish a plugin bundle",
        description:
          "Accepts the bundle descriptor produced by `hyperforge-plugin publish`. Validates the manifest against PluginManifestSchema, checks for id+version uniqueness, and stores the entry. Returns 201 + registryId on success, 400 on bad payload, 409 on duplicate id+version.",
      },
    },
  )
  .get(
    "/plugins/registry",
    () => {
      // List all published bundles. Ordered by publishedAt desc
      // (newest first) so the editor's Plugin Browser can render
      // a "recently published" feed without further sort.
      const entries = Array.from(registry.values()).sort((a, b) =>
        b.publishedAt.localeCompare(a.publishedAt),
      );
      return {
        ok: true as const,
        count: entries.length,
        entries: entries.map((e) => ({
          registryId: e.registryId,
          id: e.id,
          version: e.version,
          publishedAt: e.publishedAt,
          url: `/api/plugins/registry/${e.id}/${e.version}`,
        })),
      };
    },
    {
      detail: {
        tags: ["Plugins"],
        summary: "List published plugins",
        description:
          "Returns every entry in the in-memory plugin registry, ordered newest-first. Each entry carries id, version, publishedAt, registryId, and the URL to fetch the full bundle. Editor's Plugin Browser fetches this for the catalog view.",
      },
    },
  )
  .get(
    "/plugins/registry/:id/:version",
    ({ params, set }) => {
      const key = `${params.id}@${params.version}`;
      const entry = registry.get(key);
      if (!entry) {
        set.status = 404;
        return {
          ok: false as const,
          error: `plugin ${params.id}@${params.version} not found in registry`,
        };
      }
      return {
        ok: true as const,
        registryId: entry.registryId,
        id: entry.id,
        version: entry.version,
        publishedAt: entry.publishedAt,
        bundle: entry.bundle,
      };
    },
    {
      params: t.Object({
        id: t.String(),
        version: t.String(),
      }),
      detail: {
        tags: ["Plugins"],
        summary: "Fetch a published plugin bundle",
        description:
          "Returns the full bundle descriptor for the specified id+version, or 404 if not in the registry. Future install command consumes this URL to download + verify a plugin.",
      },
    },
  )
  .post(
    "/plugins/content",
    async ({ body, set }) => {
      // Phase I5 content store — accepts a single file upload as
      // base64. The client claims a sha256; the server verifies the
      // hash matches the decoded bytes BEFORE storing. Mismatch →
      // 400 (the client is broken or someone is trying to poison
      // the content store).
      //
      // Idempotent: re-uploading the same hash with the same bytes
      // is a no-op and returns 200 (not 201). Useful for retries
      // and parallel publishers uploading shared deps.
      if (typeof body !== "object" || body === null) {
        set.status = 400;
        return { ok: false as const, error: "request body must be an object" };
      }
      const bodyObj = body as Record<string, unknown>;
      const claimedSha = bodyObj.sha256;
      const base64Bytes = bodyObj.base64Bytes;
      if (
        typeof claimedSha !== "string" ||
        !/^[0-9a-f]{64}$/.test(claimedSha)
      ) {
        set.status = 400;
        return {
          ok: false as const,
          error: "sha256 must be a 64-char lowercase hex string",
        };
      }
      if (typeof base64Bytes !== "string" || base64Bytes.length === 0) {
        set.status = 400;
        return {
          ok: false as const,
          error: "base64Bytes must be a non-empty string",
        };
      }
      let bytes: Buffer;
      try {
        bytes = Buffer.from(base64Bytes, "base64");
      } catch {
        set.status = 400;
        return { ok: false as const, error: "base64Bytes failed to decode" };
      }
      const { createHash } = await import("node:crypto");
      const actualSha = createHash("sha256").update(bytes).digest("hex");
      if (actualSha !== claimedSha) {
        set.status = 400;
        return {
          ok: false as const,
          error: `sha256 mismatch: client claimed ${claimedSha}, server computed ${actualSha}`,
        };
      }

      const existing = contentStore.get(claimedSha);
      if (existing !== undefined) {
        // Idempotent re-upload — bytes match by content-addressed
        // semantics (we just verified the hash on both sides).
        set.status = 200;
        return {
          ok: true as const,
          sha256: claimedSha,
          size: bytes.byteLength,
          deduplicated: true as const,
        };
      }
      contentStore.set(claimedSha, bytes);
      set.status = 201;
      return {
        ok: true as const,
        sha256: claimedSha,
        size: bytes.byteLength,
        deduplicated: false as const,
      };
    },
    {
      body: t.Unknown(),
      detail: {
        tags: ["Plugins"],
        summary: "Upload plugin file content",
        description:
          "Accepts a single file's bytes (base64-encoded) for content-addressed storage. Server verifies the claimed sha256 matches the decoded bytes before storing. Idempotent on re-upload (200 with deduplicated:true). Use BEFORE POST /api/plugins so the bundle's referenced files are resolvable.",
      },
    },
  )
  .get(
    "/plugins/content/:sha256",
    ({ params, set }) => {
      // Content-addressed retrieval. Returns the raw bytes (octet-
      // stream) so the client can hash + verify locally without
      // base64 round-tripping. 404 if the hash isn't in the store.
      if (!/^[0-9a-f]{64}$/.test(params.sha256)) {
        set.status = 400;
        return new Response(
          JSON.stringify({
            ok: false,
            error: "sha256 must be a 64-char lowercase hex string",
          }),
          {
            status: 400,
            headers: { "content-type": "application/json" },
          },
        );
      }
      const bytes = contentStore.get(params.sha256);
      if (bytes === undefined) {
        set.status = 404;
        return new Response(
          JSON.stringify({
            ok: false,
            error: `content with sha256 ${params.sha256} not in store`,
          }),
          {
            status: 404,
            headers: { "content-type": "application/json" },
          },
        );
      }
      // Return raw bytes. Caller verifies hash client-side.
      return new Response(bytes, {
        status: 200,
        headers: {
          "content-type": "application/octet-stream",
          "content-length": String(bytes.byteLength),
          "x-sha256": params.sha256,
        },
      });
    },
    {
      params: t.Object({ sha256: t.String() }),
      detail: {
        tags: ["Plugins"],
        summary: "Download plugin file content",
        description:
          "Returns the raw bytes for the file with the given sha256 (octet-stream). Caller MUST verify the hash client-side; the server is treated as untrusted (could be a mirror / CDN). Used by the install command to reconstruct dist/ from a bundle's per-file hashes.",
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

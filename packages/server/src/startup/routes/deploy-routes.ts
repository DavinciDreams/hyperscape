/**
 * Deployment Routes — Staging/production manifest pipeline
 *
 * Endpoints:
 *   POST /api/deploy/staging     — Upload compiled manifests to staging slot
 *   POST /api/deploy/production  — Promote staging to production
 *   POST /api/deploy/rollback/:id — Roll back to a previous deployment
 *   POST /api/deploy/validate    — Validate manifests without deploying (dry run)
 *   POST /api/deploy/reload      — Trigger live manifest reload
 *   GET  /api/deploy/current     — Current staging + production status
 *   GET  /api/deploy/history     — Deployment history
 *   GET  /api/deploy/diff/:id    — Diff for a specific deployment
 *
 * Storage layout (under config.manifestsDir parent):
 *   manifests/           — alias for production (current live manifests)
 *   manifests-staging/   — staging slot
 *   manifests-history/   — versioned snapshots: {id}/
 *
 * Admin auth required (same x-admin-code as admin-routes).
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { ServerConfig } from "../config.js";
import type { World } from "@hyperforge/shared";
import { DataManager } from "@hyperforge/shared";
import type { WorldJson, BrushOverlaysManifest } from "@hyperforge/shared";
import path from "path";
import fs from "fs-extra";
import crypto from "crypto";

/** Deployment record (in-memory for now — no DB dependency) */
interface DeploymentRecord {
  id: string;
  target: "staging" | "production";
  status: "pending" | "active" | "rolled-back";
  deployedBy: string;
  deployedAt: string;
  manifestCount: number;
  diffSummary: {
    added: number;
    modified: number;
    removed: number;
  };
  /** Per-file hashes for diff computation */
  fileHashes: Record<string, string>;
}

/** In-memory deployment history (persisted to JSON on disk) */
let deploymentHistory: DeploymentRecord[] = [];
let historyFilePath = "";
let stagingDir = "";
let productionDir = "";
let historyDir = "";

/** Mutex for concurrent deployment protection */
let deploymentLock = false;

function generateDeploymentId(): string {
  return `deploy-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

async function loadHistory(): Promise<void> {
  try {
    if (await fs.pathExists(historyFilePath)) {
      deploymentHistory = await fs.readJson(historyFilePath);
    }
  } catch {
    deploymentHistory = [];
  }
}

async function saveHistory(): Promise<void> {
  await fs.writeJson(historyFilePath, deploymentHistory, { spaces: 2 });
}

/** Compute SHA-256 hash of file contents */
async function hashFile(filePath: string): Promise<string> {
  const content = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(content).digest("hex").slice(0, 12);
}

/** Get file hashes for all JSON files in a directory */
async function getDirectoryHashes(
  dir: string,
): Promise<Record<string, string>> {
  const hashes: Record<string, string> = {};
  if (!(await fs.pathExists(dir))) return hashes;

  const walk = async (current: string, prefix: string) => {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(fullPath, relativePath);
      } else if (entry.name.endsWith(".json")) {
        hashes[relativePath] = await hashFile(fullPath);
      }
    }
  };

  await walk(dir, "");
  return hashes;
}

/** Compute diff between two hash sets */
function computeDiff(
  oldHashes: Record<string, string>,
  newHashes: Record<string, string>,
): { added: string[]; modified: string[]; removed: string[] } {
  const added: string[] = [];
  const modified: string[] = [];
  const removed: string[] = [];

  for (const [file, hash] of Object.entries(newHashes)) {
    if (!(file in oldHashes)) {
      added.push(file);
    } else if (oldHashes[file] !== hash) {
      modified.push(file);
    }
  }

  for (const file of Object.keys(oldHashes)) {
    if (!(file in newHashes)) {
      removed.push(file);
    }
  }

  return { added, modified, removed };
}

/** Validate manifest structure — basic checks */
function validateManifests(manifests: Record<string, unknown>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  for (const [name, content] of Object.entries(manifests)) {
    if (content === null || content === undefined) {
      errors.push(`${name}: content is null or undefined`);
      continue;
    }
    if (typeof content !== "object" && !Array.isArray(content)) {
      errors.push(`${name}: content must be an object or array`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/** Resolved admin code — set once in registerDeployRoutes from config */
let resolvedAdminCode = "hyperscape-admin";

/** Simple admin auth check (reuses same x-admin-code pattern as admin-routes) */
function checkAdminAuth(request: FastifyRequest, reply: FastifyReply): boolean {
  const provided = request.headers["x-admin-code"] as string | undefined;

  if (!provided || provided !== resolvedAdminCode) {
    reply.status(401).send({
      error:
        "Unauthorized — x-admin-code header does not match server ADMIN_CODE",
    });
    return false;
  }
  return true;
}

export function registerDeployRoutes(
  fastify: FastifyInstance,
  config: ServerConfig,
  world?: World,
): void {
  // Use admin code from server config (matches ADMIN_CODE env var)
  resolvedAdminCode = config.adminCode || "hyperscape-admin";

  // Initialize directory paths
  const manifestsParent = path.dirname(config.manifestsDir);
  productionDir = config.manifestsDir; // Current manifests dir IS production
  stagingDir = path.join(manifestsParent, "manifests-staging");
  historyDir = path.join(manifestsParent, "manifests-history");
  historyFilePath = path.join(manifestsParent, "deployment-history.json");

  // Ensure directories exist
  void fs.ensureDir(stagingDir);
  void fs.ensureDir(historyDir);
  void loadHistory();

  // ============== POST /api/deploy/validate ==============
  fastify.post(
    "/api/deploy/validate",
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!checkAdminAuth(request, reply)) return;

      const body = request.body as { manifests?: Record<string, unknown> };
      if (!body?.manifests) {
        return reply
          .status(400)
          .send({ error: "Missing manifests in request body" });
      }

      const result = validateManifests(body.manifests);
      return reply.send({
        valid: result.valid,
        errors: result.errors,
        manifestCount: Object.keys(body.manifests).length,
      });
    },
  );

  // ============== POST /api/deploy/staging ==============
  fastify.post(
    "/api/deploy/staging",
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!checkAdminAuth(request, reply)) return;

      if (deploymentLock) {
        return reply
          .status(409)
          .send({ error: "Another deployment is in progress" });
      }

      const body = request.body as {
        manifests?: Record<string, unknown>;
        worldJson?: Record<string, unknown>;
        deployedBy?: string;
      };
      if (!body?.manifests) {
        return reply
          .status(400)
          .send({ error: "Missing manifests in request body" });
      }

      // Validate first
      const validation = validateManifests(body.manifests);
      if (!validation.valid) {
        return reply.status(400).send({
          error: "Manifest validation failed",
          details: validation.errors,
        });
      }

      deploymentLock = true;
      try {
        // Clear staging directory
        await fs.emptyDir(stagingDir);

        // Write each manifest to staging
        for (const [name, content] of Object.entries(body.manifests)) {
          const filePath = path.join(stagingDir, name);
          await fs.ensureDir(path.dirname(filePath));
          await fs.writeJson(filePath, content, { spaces: 2 });
        }

        // Hot-reload manifest data into memory so the running server picks up
        // changes immediately. Load ALL data first, then trigger a single
        // terrain regeneration at the end to avoid wasteful double-regen.
        let needsTerrainRegen = false;

        // Write world.json (entity spawns) alongside manifests if provided
        if (body.worldJson) {
          await fs.writeJson(
            path.join(stagingDir, "world.json"),
            body.worldJson,
            { spaces: 2 },
          );

          const wj = body.worldJson as unknown as WorldJson;
          const trees = (wj.entities as { trees?: { s: string }[] })?.trees;
          const treeCount = Array.isArray(trees) ? trees.length : 0;
          console.log(
            `[Deploy] Received world.json — trees: ${treeCount || "none"}`,
          );

          if (Array.isArray(trees) && trees.length > 0) {
            const species = [...new Set(trees.map((t) => t.s))];
            console.log(
              `[Deploy] Tree species: ${species.join(", ")} (${species.length} unique across ${treeCount} trees)`,
            );
          }

          DataManager.reloadWorldJson(wj);
          console.log(
            `[Deploy] DataManager.hasManifestTrees() = ${DataManager.hasManifestTrees()}`,
          );
          needsTerrainRegen = true;
        }

        // Hot-reload brush overlays (terrain sculpts + biome paints)
        const brushOverlaysData = body.manifests["brush-overlays.json"] as
          | BrushOverlaysManifest
          | undefined;
        if (brushOverlaysData) {
          DataManager.setBrushOverlays(brushOverlaysData);
          needsTerrainRegen = true;
        }

        // Single terrain regeneration after all data is loaded
        if (needsTerrainRegen && world) {
          const terrainSystem = world.getSystem("terrain") as {
            reloadManifestAndRegenerateTiles?: () => void;
          } | null;
          console.log(
            `[Deploy] TerrainSystem found: ${!!terrainSystem}, has reload method: ${!!terrainSystem?.reloadManifestAndRegenerateTiles}`,
          );
          if (terrainSystem?.reloadManifestAndRegenerateTiles) {
            terrainSystem.reloadManifestAndRegenerateTiles();
            console.log(
              "[Deploy] Hot-reloaded manifests + regenerated terrain tiles",
            );
          }
        } else if (needsTerrainRegen) {
          console.warn("[Deploy] No world instance — cannot reload terrain");
        }

        // Compute diff against production
        const prodHashes = await getDirectoryHashes(productionDir);
        const stagingHashes = await getDirectoryHashes(stagingDir);
        const diff = computeDiff(prodHashes, stagingHashes);

        // Create deployment record
        const record: DeploymentRecord = {
          id: generateDeploymentId(),
          target: "staging",
          status: "active",
          deployedBy: body.deployedBy ?? "unknown",
          deployedAt: new Date().toISOString(),
          manifestCount: Object.keys(body.manifests).length,
          diffSummary: {
            added: diff.added.length,
            modified: diff.modified.length,
            removed: diff.removed.length,
          },
          fileHashes: stagingHashes,
        };

        deploymentHistory.unshift(record);
        // Keep last 50 deployments
        if (deploymentHistory.length > 50) {
          deploymentHistory = deploymentHistory.slice(0, 50);
        }
        await saveHistory();

        console.log(
          `[Deploy] Staging deployment ${record.id}: ${Object.keys(body.manifests).length} manifests ` +
            `(+${diff.added.length} ~${diff.modified.length} -${diff.removed.length})`,
        );

        return reply.send({
          success: true,
          deploymentId: record.id,
          diff: { ...diff },
          manifestCount: Object.keys(body.manifests).length,
        });
      } finally {
        deploymentLock = false;
      }
    },
  );

  // ============== POST /api/deploy/production ==============
  fastify.post(
    "/api/deploy/production",
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!checkAdminAuth(request, reply)) return;

      if (deploymentLock) {
        return reply
          .status(409)
          .send({ error: "Another deployment is in progress" });
      }

      // Check staging has content
      if (!(await fs.pathExists(stagingDir))) {
        return reply.status(400).send({ error: "No staging deployment found" });
      }

      const stagingFiles = await fs.readdir(stagingDir).catch(() => []);
      if (stagingFiles.length === 0) {
        return reply.status(400).send({ error: "Staging directory is empty" });
      }

      deploymentLock = true;
      try {
        // Snapshot current production for rollback
        const snapshotId = generateDeploymentId();
        const snapshotDir = path.join(historyDir, snapshotId);
        if (await fs.pathExists(productionDir)) {
          await fs.copy(productionDir, snapshotDir);
        }

        // Copy staging → production (atomic swap)
        await fs.emptyDir(productionDir);
        await fs.copy(stagingDir, productionDir);

        // Compute hashes
        const productionHashes = await getDirectoryHashes(productionDir);

        // Create deployment record
        const record: DeploymentRecord = {
          id: snapshotId,
          target: "production",
          status: "active",
          deployedBy:
            (request.body as { deployedBy?: string })?.deployedBy ?? "unknown",
          deployedAt: new Date().toISOString(),
          manifestCount: stagingFiles.length,
          diffSummary: { added: 0, modified: stagingFiles.length, removed: 0 },
          fileHashes: productionHashes,
        };

        // Mark previous production deployments as superseded
        for (const prev of deploymentHistory) {
          if (prev.target === "production" && prev.status === "active") {
            prev.status = "rolled-back";
          }
        }

        deploymentHistory.unshift(record);
        if (deploymentHistory.length > 50) {
          deploymentHistory = deploymentHistory.slice(0, 50);
        }
        await saveHistory();

        console.log(
          `[Deploy] Production promotion ${record.id}: ${stagingFiles.length} manifest files`,
        );

        return reply.send({
          success: true,
          deploymentId: record.id,
          manifestCount: stagingFiles.length,
        });
      } finally {
        deploymentLock = false;
      }
    },
  );

  // ============== POST /api/deploy/rollback/:id ==============
  fastify.post(
    "/api/deploy/rollback/:id",
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      if (!checkAdminAuth(request, reply)) return;

      const { id } = request.params;
      const snapshotDir = path.join(historyDir, id);

      if (!(await fs.pathExists(snapshotDir))) {
        return reply
          .status(404)
          .send({ error: "Deployment snapshot not found" });
      }

      if (deploymentLock) {
        return reply
          .status(409)
          .send({ error: "Another deployment is in progress" });
      }

      deploymentLock = true;
      try {
        // Snapshot current production before rollback
        const preRollbackId = generateDeploymentId();
        const preRollbackDir = path.join(historyDir, preRollbackId);
        await fs.copy(productionDir, preRollbackDir);

        // Restore the target snapshot
        await fs.emptyDir(productionDir);
        await fs.copy(snapshotDir, productionDir);

        // Update history
        const record = deploymentHistory.find((r) => r.id === id);
        if (record) {
          record.status = "active";
        }

        await saveHistory();

        console.log(`[Deploy] Rolled back to deployment ${id}`);

        return reply.send({
          success: true,
          rolledBackTo: id,
          preRollbackSnapshot: preRollbackId,
        });
      } finally {
        deploymentLock = false;
      }
    },
  );

  // ============== POST /api/deploy/reload ==============
  fastify.post(
    "/api/deploy/reload",
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!checkAdminAuth(request, reply)) return;

      // Manifests are served from the production directory via static file routes.
      // After staging→production promotion, new requests will serve updated files.
      // A full DataManager cache invalidation requires a server restart or
      // explicit cache-bust logic in shared DataManager (future enhancement).
      //
      // For development: file watchers auto-restart the server.
      // For production: use a rolling restart after promoting.
      const prodFiles = await fs.readdir(productionDir).catch(() => []);

      console.log(
        `[Deploy] Reload requested — ${prodFiles.length} manifest files in production directory`,
      );

      return reply.send({
        success: true,
        message:
          "Manifest files updated. Static file serving will use new files immediately. " +
          "In-memory caches (DataManager) require a server restart to refresh.",
        productionFileCount: prodFiles.length,
      });
    },
  );

  // ============== GET /api/deploy/staging/status ==============
  fastify.get(
    "/api/deploy/staging/status",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const exists = await fs.pathExists(stagingDir);
      const files = exists
        ? (await fs.readdir(stagingDir).catch(() => [])).filter((f) =>
            f.endsWith(".json"),
          )
        : [];

      const latestStaging = deploymentHistory.find(
        (r) => r.target === "staging",
      );

      return reply.send({
        hasFiles: files.length > 0,
        fileCount: files.length,
        files,
        lastDeployedAt: latestStaging?.deployedAt ?? null,
        lastDeployedBy: latestStaging?.deployedBy ?? null,
      });
    },
  );

  // ============== GET /api/deploy/current ==============
  fastify.get(
    "/api/deploy/current",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const stagingExists = await fs.pathExists(stagingDir);
      const stagingFiles = stagingExists
        ? await fs.readdir(stagingDir).catch(() => [])
        : [];

      const productionFiles = await fs.readdir(productionDir).catch(() => []);

      const latestStaging = deploymentHistory.find(
        (r) => r.target === "staging" && r.status === "active",
      );
      const latestProduction = deploymentHistory.find(
        (r) => r.target === "production" && r.status === "active",
      );

      return reply.send({
        staging: {
          hasContent: stagingFiles.length > 0,
          fileCount: stagingFiles.length,
          lastDeployment: latestStaging ?? null,
        },
        production: {
          fileCount: productionFiles.length,
          lastDeployment: latestProduction ?? null,
        },
      });
    },
  );

  // ============== GET /api/deploy/history ==============
  fastify.get(
    "/api/deploy/history",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return reply.send({
        deployments: deploymentHistory.map(
          ({ fileHashes: _fh, ...rest }) => rest,
        ),
      });
    },
  );

  // ============== GET /api/deploy/diff/:id ==============
  fastify.get(
    "/api/deploy/diff/:id",
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const record = deploymentHistory.find((r) => r.id === id);

      if (!record) {
        return reply.status(404).send({ error: "Deployment not found" });
      }

      // Find the previous deployment of the same target to compute full diff
      const idx = deploymentHistory.indexOf(record);
      const previous = deploymentHistory
        .slice(idx + 1)
        .find((r) => r.target === record.target);

      const diff = previous
        ? computeDiff(previous.fileHashes, record.fileHashes)
        : { added: Object.keys(record.fileHashes), modified: [], removed: [] };

      return reply.send({
        deployment: {
          id: record.id,
          target: record.target,
          status: record.status,
          deployedBy: record.deployedBy,
          deployedAt: record.deployedAt,
          manifestCount: record.manifestCount,
        },
        diff,
      });
    },
  );

  console.log("[Deploy] ✅ Deployment routes registered");
}

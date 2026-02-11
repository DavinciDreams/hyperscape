/**
 * Equipment Processing Routes
 * Endpoints for Blender-based equipment weight transfer pipeline
 */

import { Elysia, t } from "elysia";
import path from "path";
import fs from "fs";
import type { EquipmentProcessingService } from "../services/EquipmentProcessingService";

export const createEquipmentProcessingRoutes = (
  equipmentService: EquipmentProcessingService,
) => {
  return new Elysia({
    prefix: "/api/equipment",
    name: "equipment-processing",
  }).guard(
    {
      beforeHandle: ({ request }) => {
        console.log(
          `[Equipment Processing] ${request.method} ${new URL(request.url).pathname}`,
        );
      },
    },
    (app) =>
      app
        // Docker readiness check
        .get(
          "/ready",
          () => {
            return {
              ready: equipmentService.isReady(),
              building: equipmentService.isBuilding(),
            };
          },
          {
            detail: {
              tags: ["Equipment Processing"],
              summary: "Check Docker readiness",
              description:
                "Returns whether the Blender Docker image is built and ready for processing.",
            },
          },
        )

        // Start equipment processing job
        .post(
          "/process",
          async ({ body, set }) => {
            try {
              const jobId = equipmentService.startProcessing({
                assetId: body.assetId,
                slot: body.slot,
                offset: body.offset,
                maxInfluences: body.maxInfluences,
                smoothingPasses: body.smoothingPasses,
                tier: body.tier,
              });

              return { jobId, status: "processing" };
            } catch (error) {
              set.status = 503;
              return { error: (error as Error).message };
            }
          },
          {
            body: t.Object({
              assetId: t.String({ minLength: 1 }),
              slot: t.Union([
                t.Literal("body"),
                t.Literal("legs"),
                t.Literal("helmet"),
                t.Literal("boots"),
                t.Literal("gloves"),
                t.Literal("cape"),
                t.Literal("shield"),
              ]),
              offset: t.Optional(t.Number({ minimum: 0, maximum: 0.1 })),
              maxInfluences: t.Optional(t.Integer({ minimum: 1, maximum: 8 })),
              smoothingPasses: t.Optional(
                t.Integer({ minimum: 0, maximum: 10 }),
              ),
              tier: t.Optional(t.Integer({ minimum: 1, maximum: 10 })),
            }),
            detail: {
              tags: ["Equipment Processing"],
              summary: "Start equipment processing",
              description:
                "Starts a Blender-based weight transfer job for equipment fitting. Returns a job ID for polling status.",
            },
          },
        )

        // Poll job status
        .get(
          "/process/:jobId",
          async ({ params: { jobId }, set }) => {
            const job = equipmentService.getJobStatus(jobId);

            if (!job) {
              set.status = 404;
              return { error: `Job not found: ${jobId}` };
            }

            return {
              id: job.id,
              assetId: job.assetId,
              slot: job.slot,
              status: job.status,
              progress: job.progress,
              message: job.message,
              outputPath: job.outputPath,
              metadataPath: job.metadataPath,
              error: job.error,
              startedAt: job.startedAt,
              completedAt: job.completedAt,
            };
          },
          {
            params: t.Object({
              jobId: t.String({ minLength: 1 }),
            }),
            detail: {
              tags: ["Equipment Processing"],
              summary: "Get processing job status",
              description:
                "Returns the current status and progress of an equipment processing job.",
            },
          },
        )

        // Get equipment metadata for a processed asset
        .get(
          "/metadata/:assetId",
          async ({ params: { assetId }, set }) => {
            const metadata =
              await equipmentService.getEquipmentMetadata(assetId);

            if (!metadata) {
              set.status = 404;
              return {
                error: `No equipment metadata found for asset: ${assetId}`,
              };
            }

            return metadata;
          },
          {
            params: t.Object({
              assetId: t.String({ minLength: 1 }),
            }),
            detail: {
              tags: ["Equipment Processing"],
              summary: "Get equipment metadata",
              description:
                "Returns the metadata sidecar for a processed equipment asset.",
            },
          },
        )

        // Serve rigged GLB with no-cache headers.
        // Bypasses the static plugin which may aggressively cache files,
        // ensuring the browser always gets the latest processed output.
        .get(
          "/rigged/:assetId",
          async ({ params: { assetId }, set }) => {
            const riggedPath = equipmentService.getRiggedModelPath(assetId);

            if (!riggedPath || !fs.existsSync(riggedPath)) {
              set.status = 404;
              return { error: `No rigged model found for asset: ${assetId}` };
            }

            const stat = fs.statSync(riggedPath);
            set.headers["content-type"] = "model/gltf-binary";
            set.headers["cache-control"] =
              "no-store, no-cache, must-revalidate";
            set.headers["pragma"] = "no-cache";
            set.headers["expires"] = "0";
            set.headers["last-modified"] = stat.mtime.toUTCString();
            set.headers["x-file-size"] = String(stat.size);
            set.headers["access-control-expose-headers"] =
              "last-modified, x-file-size";

            return Bun.file(riggedPath);
          },
          {
            params: t.Object({
              assetId: t.String({ minLength: 1 }),
            }),
            detail: {
              tags: ["Equipment Processing"],
              summary: "Download rigged GLB",
              description:
                "Serves the rigged GLB file with no-cache headers to ensure the latest version is always loaded.",
            },
          },
        )

        // Check if an asset has been processed
        .get(
          "/status/:assetId",
          async ({ params: { assetId } }) => {
            const hasRigged = await equipmentService.hasRiggedModel(assetId);
            const metadata = hasRigged
              ? await equipmentService.getEquipmentMetadata(assetId)
              : null;

            return {
              assetId,
              isProcessed: hasRigged,
              metadata,
            };
          },
          {
            params: t.Object({
              assetId: t.String({ minLength: 1 }),
            }),
            detail: {
              tags: ["Equipment Processing"],
              summary: "Check equipment processing status",
              description:
                "Checks if an asset has been processed through the Blender pipeline.",
            },
          },
        ),
  );
};

/**
 * Tripo Pipeline Routes
 *
 * Endpoints for Tripo 3D AI segment → per-part texture pipeline:
 * - Upload shell GLB → import → segment → discover parts
 * - Texture specific parts with custom prompts
 * - Reassemble (mesh completion)
 * - Text-to-model generation
 * - Task status polling + result download (proxied to avoid URL expiry)
 *
 * Completely separate from the Meshy pipeline.
 */

import { Elysia, t } from "elysia";
import type { TripoService } from "../services/armor-pipeline/TripoService";

/** Task IDs must be alphanumeric (with hyphens/underscores) to prevent injection */
const TASK_ID_RE = /^[a-zA-Z0-9_-]+$/;

export const createTripoPipelineRoutes = (tripoService: TripoService) => {
  return (
    new Elysia({ prefix: "/api/tripo", name: "tripo-pipeline" })

      // Debug: check balance
      .get("/balance", async ({ set }) => {
        if (!tripoService.isConfigured) {
          set.status = 503;
          return { error: "TRIPO_API_KEY not configured" };
        }
        try {
          return await tripoService.getBalance();
        } catch (err) {
          set.status = 500;
          return { error: err instanceof Error ? err.message : String(err) };
        }
      })

      // =====================================================================
      // Step 1: Upload shell → import → segment → return part names
      // This is a long-running operation (upload + import + segment + parse).
      // Returns when all steps complete.
      // =====================================================================
      .post(
        "/upload-and-segment",
        async ({ body, set }) => {
          if (!tripoService.isConfigured) {
            set.status = 503;
            return { success: false, error: "TRIPO_API_KEY not configured" };
          }

          try {
            const file = body.file;
            const arrayBuffer = await file.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            const filename = body.name || `shell_${Date.now()}.glb`;

            const result = await tripoService.uploadAndSegment(
              buffer,
              filename,
            );

            return {
              success: true,
              importTaskId: result.importTaskId,
              segmentTaskId: result.segmentTaskId,
              partNames: result.partNames,
              sizeKB: Math.round(buffer.length / 1024),
            };
          } catch (err) {
            set.status = 500;
            return {
              success: false,
              error: err instanceof Error ? err.message : String(err),
            };
          }
        },
        {
          body: t.Object({
            file: t.File({ maxSize: "20m" }),
            name: t.Optional(t.String()),
          }),
          detail: {
            tags: ["Tripo Pipeline"],
            summary:
              "Upload shell GLB → import → segment → return discovered part names",
          },
        },
      )

      // =====================================================================
      // Step 2a: Start texturing specific parts (single call, returns taskId)
      // Client polls this task. Doesn't chain — client drives the workflow.
      // =====================================================================
      .post(
        "/texture-part",
        async ({ body, set }) => {
          if (!tripoService.isConfigured) {
            set.status = 503;
            return { success: false, error: "TRIPO_API_KEY not configured" };
          }

          try {
            if (!TASK_ID_RE.test(body.originalTaskId)) {
              set.status = 400;
              return { success: false, error: "Invalid originalTaskId format" };
            }
            const taskId = await tripoService.textureModel(
              body.originalTaskId,
              {
                partNames: body.partNames,
                textPrompt: body.prompt,
                textureQuality: body.quality ?? "standard",
              },
            );

            return { success: true, taskId };
          } catch (err) {
            set.status = 500;
            return {
              success: false,
              error: err instanceof Error ? err.message : String(err),
            };
          }
        },
        {
          body: t.Object({
            originalTaskId: t.String(),
            partNames: t.Array(t.String()),
            prompt: t.String(),
            quality: t.Optional(
              t.Union([t.Literal("standard"), t.Literal("detailed")]),
            ),
          }),
          detail: {
            tags: ["Tripo Pipeline"],
            summary: "Start texturing specific parts (returns taskId to poll)",
          },
        },
      )

      // =====================================================================
      // Step 2b: Run mesh completion (reassemble after texturing)
      // =====================================================================
      .post(
        "/complete",
        async ({ body, set }) => {
          if (!tripoService.isConfigured) {
            set.status = 503;
            return { success: false, error: "TRIPO_API_KEY not configured" };
          }

          try {
            if (!TASK_ID_RE.test(body.originalTaskId)) {
              set.status = 400;
              return { success: false, error: "Invalid originalTaskId format" };
            }
            const taskId = await tripoService.meshCompletion(
              body.originalTaskId,
            );
            return { success: true, taskId };
          } catch (err) {
            set.status = 500;
            return {
              success: false,
              error: err instanceof Error ? err.message : String(err),
            };
          }
        },
        {
          body: t.Object({
            originalTaskId: t.String(),
          }),
          detail: {
            tags: ["Tripo Pipeline"],
            summary: "Reassemble model after per-part texturing",
          },
        },
      )

      // =====================================================================
      // Standalone: Upload shell → import → texture (whole model, no segments)
      // =====================================================================
      .post(
        "/texture-shell",
        async ({ body, set }) => {
          if (!tripoService.isConfigured) {
            set.status = 503;
            return { success: false, error: "TRIPO_API_KEY not configured" };
          }

          try {
            const file = body.file;
            const arrayBuffer = await file.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            const filename = body.name || `shell_${Date.now()}.glb`;

            const { importTaskId, textureTaskId } =
              await tripoService.uploadAndTexture(buffer, filename, {
                textureQuality: body.quality ?? "standard",
              });

            return {
              success: true,
              importTaskId,
              textureTaskId,
              sizeKB: Math.round(buffer.length / 1024),
            };
          } catch (err) {
            set.status = 500;
            return {
              success: false,
              error: err instanceof Error ? err.message : String(err),
            };
          }
        },
        {
          body: t.Object({
            file: t.File({ maxSize: "20m" }),
            name: t.Optional(t.String()),
            quality: t.Optional(
              t.Union([t.Literal("standard"), t.Literal("detailed")]),
            ),
          }),
          detail: {
            tags: ["Tripo Pipeline"],
            summary: "Upload shell GLB → import → texture (whole model)",
          },
        },
      )

      // =====================================================================
      // Text-to-model: generate 3D armor from a text prompt
      // =====================================================================
      .post(
        "/text-to-model",
        async ({ body, set }) => {
          if (!tripoService.isConfigured) {
            set.status = 503;
            return { success: false, error: "TRIPO_API_KEY not configured" };
          }

          try {
            const taskId = await tripoService.textToModel(body.prompt, {
              faceLimit: body.faceLimit ?? 10000,
              pbr: body.pbr ?? true,
              textureQuality: body.quality ?? "standard",
              style: body.style,
            });

            return { success: true, taskId };
          } catch (err) {
            set.status = 500;
            return {
              success: false,
              error: err instanceof Error ? err.message : String(err),
            };
          }
        },
        {
          body: t.Object({
            prompt: t.String(),
            faceLimit: t.Optional(t.Number({ minimum: 100, maximum: 50000 })),
            pbr: t.Optional(t.Boolean()),
            quality: t.Optional(
              t.Union([t.Literal("standard"), t.Literal("detailed")]),
            ),
            style: t.Optional(t.String()),
          }),
          detail: {
            tags: ["Tripo Pipeline"],
            summary: "Generate a 3D model from text prompt via Tripo",
          },
        },
      )

      // =====================================================================
      // Poll task status
      // =====================================================================
      .get(
        "/task/:taskId",
        async ({ params, set }) => {
          if (!tripoService.isConfigured) {
            set.status = 503;
            return { error: "TRIPO_API_KEY not configured" };
          }

          try {
            const status = await tripoService.getTaskStatus(params.taskId);
            return status;
          } catch (err) {
            set.status = 500;
            return {
              error: err instanceof Error ? err.message : String(err),
            };
          }
        },
        {
          params: t.Object({ taskId: t.String() }),
          detail: {
            tags: ["Tripo Pipeline"],
            summary: "Check Tripo task status",
          },
        },
      )

      // =====================================================================
      // Download result (proxied — Tripo URLs expire quickly)
      // =====================================================================
      .get(
        "/download/:taskId",
        async ({ params, set }) => {
          if (!tripoService.isConfigured) {
            set.status = 503;
            return { error: "TRIPO_API_KEY not configured" };
          }

          try {
            const { buffer } = await tripoService.downloadResult(params.taskId);

            const safeTaskId = params.taskId.replace(/[^a-zA-Z0-9_-]/g, "_");
            set.headers["content-type"] = "model/gltf-binary";
            set.headers["content-disposition"] =
              `attachment; filename="tripo_${safeTaskId}.glb"`;

            return new Response(buffer);
          } catch (err) {
            set.status = 500;
            return {
              error: err instanceof Error ? err.message : String(err),
            };
          }
        },
        {
          params: t.Object({ taskId: t.String() }),
          detail: {
            tags: ["Tripo Pipeline"],
            summary: "Download Tripo result GLB (proxied to avoid URL expiry)",
          },
        },
      )
  );
};

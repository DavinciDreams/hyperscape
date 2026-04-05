/**
 * Armor Pipeline Routes — POC-2
 *
 * Endpoints for shell texture generation via Meshy AI.
 * Uses base64 data URIs to send shell GLBs to Meshy inline,
 * so no public URL/tunnel is needed.
 */

import { Elysia, t } from "elysia";
import type { ShellTextureService } from "../services/armor-pipeline/ShellTextureService";

export const createArmorPipelineRoutes = (
  shellTextureService: ShellTextureService,
) => {
  return (
    new Elysia({ prefix: "/api/armor-pipeline", name: "armor-pipeline" })

      // Upload shell GLB + start Meshy retexture in one step
      // Sends the GLB to Meshy as a base64 data URI (no public URL needed)
      .post(
        "/texture-shell",
        async ({ body, set }) => {
          if (!shellTextureService.isConfigured) {
            set.status = 503;
            return { success: false, error: "MESHY_API_KEY not configured" };
          }

          try {
            const file = body.file;
            const arrayBuffer = await file.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            const filename = body.name || `shell_${Date.now()}.glb`;

            // Save locally + get base64 data URI
            const { dataUri } = await shellTextureService.saveShellGLB(
              buffer,
              filename,
            );

            // Start Meshy retexture with data URI
            const taskId = await shellTextureService.startTextureTask(
              dataUri,
              body.prompt,
              {
                preserveUV: true,
                enablePBR: true,
                aiModel: body.aiModel || "meshy-5",
              },
            );

            return {
              success: true,
              taskId,
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
            file: t.File(),
            prompt: t.String(),
            name: t.Optional(t.String()),
            aiModel: t.Optional(t.String()),
          }),
          detail: {
            tags: ["Armor Pipeline"],
            summary: "Upload shell GLB and start AI texture generation",
          },
        },
      )

      // Poll texture task status
      .get(
        "/texture-status/:taskId",
        async ({ params, set }) => {
          if (!shellTextureService.isConfigured) {
            set.status = 503;
            return { error: "MESHY_API_KEY not configured" };
          }

          try {
            const status = await shellTextureService.getTaskStatus(
              params.taskId,
            );
            return status;
          } catch (err) {
            set.status = 500;
            return {
              error: err instanceof Error ? err.message : String(err),
            };
          }
        },
        {
          params: t.Object({
            taskId: t.String(),
          }),
          detail: {
            tags: ["Armor Pipeline"],
            summary: "Check texture generation task status",
          },
        },
      )

      // Download textured result (proxies Meshy download URL)
      .get(
        "/texture-download/:taskId",
        async ({ params, set }) => {
          if (!shellTextureService.isConfigured) {
            set.status = 503;
            return { error: "MESHY_API_KEY not configured" };
          }

          try {
            const status = await shellTextureService.getTaskStatus(
              params.taskId,
            );

            if (status.status !== "succeeded" || !status.resultGlbUrl) {
              set.status = 404;
              return { error: "Task not complete or no result available" };
            }

            const buffer = await shellTextureService.downloadResult(
              status.resultGlbUrl,
            );

            set.headers["content-type"] = "model/gltf-binary";
            set.headers["content-disposition"] =
              `attachment; filename="textured_shell_${params.taskId}.glb"`;

            return new Response(buffer);
          } catch (err) {
            set.status = 500;
            return {
              error: err instanceof Error ? err.message : String(err),
            };
          }
        },
        {
          params: t.Object({
            taskId: t.String(),
          }),
          detail: {
            tags: ["Armor Pipeline"],
            summary: "Download textured shell GLB result",
          },
        },
      )
  );
};

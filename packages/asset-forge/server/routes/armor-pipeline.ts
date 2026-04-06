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

      // Upload shell GLB + start multiple Meshy retexture tasks (one per tier)
      // Shell is uploaded/encoded once and reused for all tier prompts
      .post(
        "/texture-shell-batch",
        async ({ body, set }) => {
          if (!shellTextureService.isConfigured) {
            set.status = 503;
            return { success: false, error: "MESHY_API_KEY not configured" };
          }

          try {
            const file = body.file;
            const arrayBuffer = await file.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            const filename =
              (body as Record<string, unknown>).name?.toString() ||
              `shell_batch_${Date.now()}.glb`;

            // Save locally + get base64 data URI (once)
            const { dataUri } = await shellTextureService.saveShellGLB(
              buffer,
              filename,
            );

            const tiers = (
              typeof body.tiers === "string"
                ? JSON.parse(body.tiers)
                : body.tiers
            ) as {
              tierId: string;
              prompt: string;
            }[];
            const aiModel =
              (body as Record<string, unknown>).aiModel?.toString() ||
              "meshy-5";

            // Start tasks sequentially with a small delay to avoid Meshy 504s
            // (each request sends the full ~6MB base64 payload)
            const results: { tierId: string; taskId: string }[] = [];
            for (let i = 0; i < tiers.length; i++) {
              const tier = tiers[i];
              if (i > 0) {
                await new Promise((r) => setTimeout(r, 2000));
              }
              const taskId = await shellTextureService.startTextureTask(
                dataUri,
                tier.prompt,
                { preserveUV: true, enablePBR: true, aiModel },
              );
              results.push({ tierId: tier.tierId, taskId });
              console.log(
                `[ArmorPipeline] Batch ${i + 1}/${tiers.length}: ${tier.tierId} → ${taskId}`,
              );
            }

            return { success: true, tasks: results };
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
            tiers: t.Any(), // JSON string or parsed array of {tierId, prompt}[]
            name: t.Optional(t.String()),
            aiModel: t.Optional(t.String()),
          }),
          detail: {
            tags: ["Armor Pipeline"],
            summary:
              "Upload shell GLB and start batch AI texture generation for multiple tiers",
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

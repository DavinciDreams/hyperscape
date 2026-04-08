/**
 * Armor Pipeline Routes — POC-2 + Publish-to-Game
 *
 * Endpoints for shell texture generation via Meshy AI
 * and publishing rigged armor to the game's model directory.
 */

import { Elysia, t } from "elysia";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import type { ShellTextureService } from "../services/armor-pipeline/ShellTextureService";

function parseBonuses(raw: string | undefined): Record<string, number> {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

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
            const enablePBR = body.enablePBR === "true";
            // preserveUV=false: let Meshy generate new UVs.
            // Avatar UVs map to a skin texture atlas which biases Meshy to paint skin/clothing.
            // New UVs treat the shell as a generic 3D object → correct armor textures.
            const preserveUV = body.preserveUV === "true";
            const taskId = await shellTextureService.startTextureTask(
              dataUri,
              body.prompt,
              {
                preserveUV,
                enablePBR,
                aiModel: body.aiModel || "meshy-6",
                styleImageUrl: body.styleImageUrl || undefined,
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
            enablePBR: t.Optional(t.String()),
            preserveUV: t.Optional(t.String()),
            styleImageUrl: t.Optional(t.String()),
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

            const filename = body.name || `shell_batch_${Date.now()}.glb`;

            // Save locally + get base64 data URI (once)
            const { dataUri } = await shellTextureService.saveShellGLB(
              buffer,
              filename,
            );

            let tiers: {
              tierId: string;
              prompt: string;
              /** Per-tier style reference image URL for color consistency */
              styleImageUrl?: string;
            }[];
            try {
              tiers = JSON.parse(body.tiers);
            } catch {
              set.status = 400;
              return { success: false, error: "Invalid tiers JSON" };
            }
            const aiModel = body.aiModel || "meshy-6";
            const enablePBR = body.enablePBR === "true";
            // Global fallback style image (used when tiers don't specify their own)
            const globalStyleImageUrl = body.styleImageUrl || undefined;

            // Start tasks sequentially with a small delay to avoid Meshy 504s
            // (each request sends the full ~6MB base64 payload)
            const results: { tierId: string; taskId: string }[] = [];
            for (let i = 0; i < tiers.length; i++) {
              const tier = tiers[i];
              if (i > 0) {
                await new Promise((r) => setTimeout(r, 2000));
              }
              // Per-tier style image takes precedence over global fallback
              const tierStyleUrl = tier.styleImageUrl || globalStyleImageUrl;
              const preserveUV = body.preserveUV === "true";
              const taskId = await shellTextureService.startTextureTask(
                dataUri,
                tier.prompt,
                { preserveUV, enablePBR, aiModel, styleImageUrl: tierStyleUrl },
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
            tiers: t.String(), // JSON-encoded array of {tierId, prompt, styleImageUrl?}[]
            name: t.Optional(t.String()),
            aiModel: t.Optional(t.String()),
            enablePBR: t.Optional(t.String()),
            preserveUV: t.Optional(t.String()),
            styleImageUrl: t.Optional(t.String()),
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

      // Publish rigged armor GLB to the game's model directory + update manifest
      // Security: restricted to localhost requests only (writes to game server filesystem)
      .post(
        "/publish-to-game",
        async ({ body, set, request }) => {
          // Only allow requests from localhost
          const url = new URL(request.url);
          const host = url.hostname;
          if (host !== "localhost" && host !== "127.0.0.1" && host !== "::1") {
            set.status = 403;
            return {
              success: false,
              error: "Publish is only allowed from localhost",
            };
          }
          try {
            const file = body.file;
            const arrayBuffer = await file.arrayBuffer();
            const glbBuffer = Buffer.from(arrayBuffer);

            const itemId = body.itemId;
            const slot = body.slot;
            const itemName = body.itemName || itemId.replace(/_/g, " ");
            const tier = body.tier || "bronze";

            // Determine game model directory based on slot
            const slotDirMap: Record<string, string> = {
              helmet: "helmets",
              body: "torsos",
              legs: "legs",
              boots: "boots",
              gloves: "gloves",
              cape: "capes",
            };
            const slotDir = slotDirMap[slot] || slot;

            // Resolve paths relative to the monorepo
            const serverAssetsDir = join(
              import.meta.dir,
              "..",
              "..",
              "..",
              "server",
              "world",
              "assets",
            );
            const modelDir = join(serverAssetsDir, "models", slotDir, itemId);
            const manifestPath = join(
              serverAssetsDir,
              "manifests",
              "items",
              "armor.json",
            );

            // Write GLB to game models directory
            await mkdir(modelDir, { recursive: true });
            const glbPath = join(modelDir, `${itemId}.glb`);
            await writeFile(glbPath, glbBuffer);

            // Write metadata.json alongside the GLB
            const metadata = {
              name: itemId,
              gameId: itemId,
              type: "armor",
              subtype: slot,
              description: `${itemName} — generated by Armor Pipeline`,
              generatedAt: new Date().toISOString(),
              isBaseModel: true,
              hasModel: true,
              modelPath: `models/${slotDir}/${itemId}/${itemId}.glb`,
              gddCompliant: true,
              workflow: "Shell Extraction → Meshy Texture → Rig → Publish",
            };
            await writeFile(
              join(modelDir, "metadata.json"),
              JSON.stringify(metadata, null, 2),
            );

            // Update armor manifest — add or update the item entry
            let manifest: Record<string, unknown>[] = [];
            if (existsSync(manifestPath)) {
              const raw = await readFile(manifestPath, "utf-8");
              manifest = JSON.parse(raw);
            }

            const existingIndex = manifest.findIndex(
              (item) => item.id === itemId,
            );
            const entry: Record<string, unknown> = {
              id: itemId,
              name: itemName,
              type: "armor",
              tier,
              equipSlot: slot,
              equippedModelPath: `asset://models/${slotDir}/${itemId}/${itemId}.glb`,
              value: 100,
              weight: 5,
              description: `${itemName}.`,
              examine: `A piece of ${tier} armor.`,
              tradeable: true,
              rarity: "common",
              bonuses: parseBonuses(body.bonuses),
            };

            if (existingIndex >= 0) {
              manifest[existingIndex] = {
                ...manifest[existingIndex],
                ...entry,
              };
            } else {
              manifest.push(entry);
            }

            await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

            console.log(
              `[ArmorPipeline] Published ${itemId} → ${glbPath} (${(glbBuffer.length / 1024).toFixed(1)}KB)`,
            );

            return {
              success: true,
              itemId,
              slot,
              glbPath: `models/${slotDir}/${itemId}/${itemId}.glb`,
              glbSizeKB: Math.round(glbBuffer.length / 1024),
              manifestUpdated: true,
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
            itemId: t.String(),
            slot: t.String(),
            itemName: t.Optional(t.String()),
            tier: t.Optional(t.String()),
            bonuses: t.Optional(t.String()),
          }),
          detail: {
            tags: ["Armor Pipeline"],
            summary:
              "Publish rigged armor GLB to game model directory and update item manifest",
          },
        },
      )
  );
};

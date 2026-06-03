/**
 * Health Check Routes
 * Simple health check endpoint for monitoring
 */

import { Elysia } from "elysia";
import * as Models from "../models";
import { isDatabaseEnabled, queryClient } from "../db/db";
import { ComfyUIService } from "../services/ComfyUIService";
import { HillDGXService } from "../services/HillDGXService";
import { chatProviderService } from "../services/ChatProviderService";

export const healthRoutes = new Elysia({ prefix: "/api", name: "health" }).get(
  "/health",
  async () => {
    const comfy = new ComfyUIService();
    const hillDGX = new HillDGXService();
    let database = false;

    if (isDatabaseEnabled && queryClient) {
      try {
        await queryClient`SELECT 1`;
        database = true;
      } catch {
        database = false;
      }
    }

    const comfyEnabled = !!(
      process.env.ASSET_FORGE_IMAGE_PROVIDER === "comfy" ||
      process.env.ASSET_FORGE_3D_PROVIDER === "comfy" ||
      process.env.ASSET_FORGE_3D_PROVIDER === "trellis" ||
      process.env.LOCAL_IMAGE_PROVIDER === "comfy" ||
      process.env.LOCAL_3D_PROVIDER === "comfy" ||
      process.env.LOCAL_3D_PROVIDER === "trellis"
    );

    return {
      status: "healthy",
      timestamp: new Date().toISOString(),
      services: {
        meshy: !!process.env.MESHY_API_KEY,
        openai: !!process.env.OPENAI_API_KEY,
        chatProvider: chatProviderService.providerName || undefined,
        database,
        comfy: comfyEnabled ? await comfy.health() : false,
        comfyUrl: comfy.baseUrl,
        hillDGX: hillDGX.isConfigured ? await hillDGX.health() : false,
        hillDGXUrl: hillDGX.baseUrl || undefined,
        generationProvider:
          process.env.GENERATION_3D_PROVIDER ||
          process.env.ASSET_FORGE_3D_PROVIDER ||
          process.env.ASSET_FORGE_GENERATION_PROVIDER ||
          undefined,
        promptProvider:
          chatProviderService.providerName ||
          process.env.ASSET_FORGE_CHAT_PROVIDER ||
          process.env.ASSET_FORGE_PROMPT_PROVIDER ||
          process.env.PROMPT_ENHANCEMENT_PROVIDER ||
          undefined,
      },
    };
  },
  {
    response: Models.HealthResponse,
    detail: {
      tags: ["Health"],
      summary: "Health check",
      description:
        "Returns server health status and available services. (Auth optional)",
    },
  },
);

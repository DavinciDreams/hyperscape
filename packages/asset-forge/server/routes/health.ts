/**
 * Health Check Routes
 * Simple health check endpoint for monitoring
 */

import { Elysia } from "elysia";
import * as Models from "../models";
import { ComfyUIService } from "../services/ComfyUIService";

export const healthRoutes = new Elysia({ prefix: "/api", name: "health" }).get(
  "/health",
  async () => {
    const comfy = new ComfyUIService();
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
        comfy: comfyEnabled ? await comfy.health() : false,
        comfyUrl: comfy.baseUrl,
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

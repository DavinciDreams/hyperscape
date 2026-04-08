/**
 * ShellTextureService — POC-2
 *
 * Retextures shell GLBs via Meshy's retexture API (v1).
 * Uses `model_url` with base64 Data URI to send the shell inline,
 * eliminating the need for a publicly accessible server.
 *
 * API: POST /openapi/v1/retexture
 * Docs: https://docs.meshy.ai/en/api/retexture
 */

import fs from "fs/promises";
import path from "path";

export interface TextureTaskStatus {
  taskId: string;
  status: "pending" | "processing" | "succeeded" | "failed";
  progress: number; // 0-100
  error?: string;
  resultGlbUrl?: string;
  textureUrls?: {
    baseColor?: string;
    normal?: string;
    metallic?: string;
    roughness?: string;
  };
}

interface MeshyRetextureRequest {
  model_url: string;
  text_style_prompt: string;
  image_style_url?: string;
  enable_original_uv?: boolean;
  enable_pbr?: boolean;
  ai_model?: string;
  remove_lighting?: boolean;
  target_formats?: string[];
}

interface MeshyTaskResponse {
  result: string; // task ID
}

interface MeshyTaskStatus {
  id: string;
  status: "PENDING" | "IN_PROGRESS" | "SUCCEEDED" | "FAILED" | "EXPIRED";
  progress: number;
  task_error?: { message: string };
  model_urls?: { glb?: string; fbx?: string; obj?: string };
  texture_urls?: Array<{
    base_color?: string;
    normal?: string;
    metallic?: string;
    roughness?: string;
  }>;
}

export class ShellTextureService {
  private apiKey: string;
  private baseUrl = "https://api.meshy.ai";
  private pollInterval: number;
  private maxPollTime: number;
  private shellDir: string;

  constructor(config: {
    meshyApiKey: string;
    shellDir: string;
    publicBaseUrl: string;
    pollIntervalMs?: number;
    maxPollTimeMs?: number;
  }) {
    this.apiKey = config.meshyApiKey;
    this.shellDir = config.shellDir;
    this.pollInterval = config.pollIntervalMs ?? 5000;
    this.maxPollTime = config.maxPollTimeMs ?? 600000; // 10 min
  }

  get isConfigured(): boolean {
    return !!this.apiKey;
  }

  /**
   * Save a shell GLB buffer to the temp directory for archival.
   * Returns the local path and a base64 data URI for Meshy.
   */
  async saveShellGLB(
    glbBuffer: Buffer,
    filename: string,
  ): Promise<{ localPath: string; dataUri: string }> {
    await fs.mkdir(this.shellDir, { recursive: true });
    const safeName = filename.replace(/[^a-zA-Z0-9_.-]/g, "_");
    const localPath = path.join(this.shellDir, safeName);
    await fs.writeFile(localPath, glbBuffer);

    // Encode as base64 data URI — Meshy accepts this in model_url
    const base64 = glbBuffer.toString("base64");
    const dataUri = `data:model/gltf-binary;base64,${base64}`;

    return { localPath, dataUri };
  }

  /**
   * Start a Meshy retexture task on a shell GLB.
   *
   * Uses /openapi/v1/retexture with model_url (accepts data URI).
   * This works with arbitrary GLBs — not just Meshy-generated models.
   */
  async startTextureTask(
    modelUrl: string,
    prompt: string,
    options?: {
      preserveUV?: boolean;
      enablePBR?: boolean;
      aiModel?: string;
      styleImageUrl?: string;
    },
  ): Promise<string> {
    const aiModel = options?.aiModel ?? "meshy-6";
    const body: MeshyRetextureRequest = {
      model_url: modelUrl,
      text_style_prompt: prompt,
      enable_original_uv: options?.preserveUV ?? true,
      enable_pbr: options?.enablePBR ?? false,
      ai_model: aiModel,
      // Only request GLB to reduce processing time
      target_formats: ["glb"],
    };
    // Style reference image — public HTTP URL for color/texture consistency
    if (options?.styleImageUrl) {
      body.image_style_url = options.styleImageUrl;
    }

    const payloadSize = JSON.stringify(body).length;
    console.log(
      `[ShellTexture] Starting retexture — model: ${aiModel}, pbr: ${body.enable_pbr}, payload: ${(payloadSize / 1024).toFixed(0)}KB${body.image_style_url ? `, style_ref: ${body.image_style_url}` : ""}`,
    );
    console.log(`[ShellTexture]   prompt: "${prompt}"`);

    const response = await fetch(`${this.baseUrl}/openapi/v1/retexture`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[ShellTexture] Meshy API error ${response.status}:`,
        errorText,
      );
      throw new Error(
        `Meshy retexture API error: ${response.status} - ${errorText}`,
      );
    }

    const result = (await response.json()) as MeshyTaskResponse;
    console.log(`[ShellTexture] Task created: ${result.result}`);
    return result.result;
  }

  /**
   * Check status of a retexture task.
   */
  async getTaskStatus(taskId: string): Promise<TextureTaskStatus> {
    const response = await fetch(
      `${this.baseUrl}/openapi/v1/retexture/${taskId}`,
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Meshy task status error: ${response.status} - ${errorText}`,
      );
    }

    const raw = (await response.json()) as MeshyTaskStatus;

    if (raw.status === "FAILED") {
      console.error(
        `[ShellTexture] Task ${taskId} FAILED:`,
        JSON.stringify(raw.task_error),
        `| Full status: ${raw.status}`,
      );
    } else {
      console.log(
        `[ShellTexture] Task ${taskId}: ${raw.status} (${raw.progress}%)`,
      );
    }

    const statusMap: Record<string, TextureTaskStatus["status"]> = {
      PENDING: "pending",
      IN_PROGRESS: "processing",
      SUCCEEDED: "succeeded",
      FAILED: "failed",
      EXPIRED: "failed",
    };

    return {
      taskId: raw.id,
      status: statusMap[raw.status] ?? "pending",
      progress: raw.progress ?? 0,
      error: raw.task_error?.message,
      resultGlbUrl: raw.model_urls?.glb,
      textureUrls: raw.texture_urls?.[0]
        ? {
            baseColor: raw.texture_urls[0].base_color,
            normal: raw.texture_urls[0].normal,
            metallic: raw.texture_urls[0].metallic,
            roughness: raw.texture_urls[0].roughness,
          }
        : undefined,
    };
  }

  /**
   * Poll until a task completes or fails.
   */
  async waitForCompletion(
    taskId: string,
    onProgress?: (status: TextureTaskStatus) => void,
  ): Promise<TextureTaskStatus> {
    const startTime = Date.now();

    while (true) {
      const status = await this.getTaskStatus(taskId);
      onProgress?.(status);

      if (status.status === "succeeded") return status;
      if (status.status === "failed") {
        throw new Error(
          `Texture task failed: ${status.error ?? "Unknown error"}`,
        );
      }

      if (Date.now() - startTime > this.maxPollTime) {
        throw new Error(
          `Texture task timeout after ${this.maxPollTime / 1000}s`,
        );
      }

      await new Promise((resolve) => setTimeout(resolve, this.pollInterval));
    }
  }

  /**
   * Download the textured GLB result from Meshy.
   * Validates the URL against Meshy's domain to prevent SSRF.
   */
  async downloadResult(resultUrl: string): Promise<Buffer> {
    const url = new URL(resultUrl);
    if (!url.hostname.endsWith(".meshy.ai")) {
      throw new Error(
        `Refusing to download from non-Meshy domain: ${url.hostname}`,
      );
    }

    const response = await fetch(resultUrl);
    if (!response.ok) {
      throw new Error(
        `Failed to download textured model: ${response.statusText}`,
      );
    }
    const buffer = await response.arrayBuffer();
    return Buffer.from(buffer);
  }
}

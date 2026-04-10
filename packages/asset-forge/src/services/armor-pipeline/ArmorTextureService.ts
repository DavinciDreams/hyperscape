/**
 * ArmorTextureService — POC-2 Client
 *
 * Sends shell GLBs to the server which forwards them to Meshy as
 * base64 data URIs for retexturing. No public URL/tunnel needed.
 */

export interface TextureTaskStatus {
  taskId: string;
  status: "pending" | "processing" | "succeeded" | "failed";
  progress: number;
  error?: string;
  resultGlbUrl?: string;
  textureUrls?: {
    baseColor?: string;
    normal?: string;
    metallic?: string;
    roughness?: string;
  };
}

export type TextureProgressCallback = (status: TextureTaskStatus) => void;

const API_BASE =
  import.meta.env.VITE_GENERATION_API_URL?.replace(/\/$/, "") || "/api";

export class ArmorTextureService {
  private pollInterval = 5000;

  /**
   * Upload shell GLB + start Meshy retexture in one call.
   * Server encodes the GLB as a base64 data URI and sends to Meshy.
   */
  async startTexture(
    glbBlob: Blob,
    filename: string,
    prompt: string,
    options?: {
      aiModel?: string;
      enablePBR?: boolean;
      /** Let Meshy generate new UVs (false) or preserve original (true).
       *  Default false — avatar UVs bias Meshy to paint skin/clothing. */
      preserveUV?: boolean;
      /** Public URL of a style reference image for color/texture consistency */
      styleImageUrl?: string;
    },
  ): Promise<{ taskId: string; sizeKB: number }> {
    const formData = new FormData();
    formData.append("file", glbBlob, filename);
    formData.append("prompt", prompt);
    formData.append("name", filename);
    if (options?.aiModel) {
      formData.append("aiModel", options.aiModel);
    }
    formData.append("enablePBR", String(options?.enablePBR ?? false));
    formData.append("preserveUV", String(options?.preserveUV ?? false));
    if (options?.styleImageUrl) {
      formData.append("styleImageUrl", options.styleImageUrl);
    }

    const response = await fetch(`${API_BASE}/armor-pipeline/texture-shell`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Start texture failed (${response.status}): ${err}`);
    }

    const result = (await response.json()) as {
      success: boolean;
      taskId: string;
      sizeKB: number;
      error?: string;
    };

    if (!result.success) {
      throw new Error(result.error ?? "Start texture failed");
    }

    return { taskId: result.taskId, sizeKB: result.sizeKB };
  }

  /**
   * Check the status of a texture task.
   */
  async getStatus(taskId: string): Promise<TextureTaskStatus> {
    const response = await fetch(
      `${API_BASE}/armor-pipeline/texture-status/${taskId}`,
    );

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Status check failed: ${err}`);
    }

    return (await response.json()) as TextureTaskStatus;
  }

  /**
   * Poll a texture task until completion.
   */
  async waitForCompletion(
    taskId: string,
    onProgress?: TextureProgressCallback,
  ): Promise<TextureTaskStatus> {
    const maxTime = 600000; // 10 min
    const startTime = Date.now();

    while (true) {
      const status = await this.getStatus(taskId);
      onProgress?.(status);

      if (status.status === "succeeded") return status;
      if (status.status === "failed") {
        throw new Error(`Texture failed: ${status.error ?? "Unknown"}`);
      }

      if (Date.now() - startTime > maxTime) {
        throw new Error("Texture task timed out after 10 minutes");
      }

      await new Promise((r) => setTimeout(r, this.pollInterval));
    }
  }

  /**
   * Start multiple retexture tasks for the same shell with different prompts.
   * The shell is uploaded once and reused for all tiers via a server-side batch endpoint.
   */
  async startBatchTexture(
    glbBlob: Blob,
    filename: string,
    tiers: { tierId: string; prompt: string; styleImageUrl?: string }[],
    options?: {
      aiModel?: string;
      enablePBR?: boolean;
      preserveUV?: boolean;
      /** Global fallback style image — per-tier styleImageUrl takes precedence */
      styleImageUrl?: string;
    },
  ): Promise<{ tierId: string; taskId: string }[]> {
    const formData = new FormData();
    formData.append("file", glbBlob, filename);
    formData.append("tiers", JSON.stringify(tiers));
    if (options?.aiModel) {
      formData.append("aiModel", options.aiModel);
    }
    formData.append("enablePBR", String(options?.enablePBR ?? false));
    formData.append("preserveUV", String(options?.preserveUV ?? false));
    if (options?.styleImageUrl) {
      formData.append("styleImageUrl", options.styleImageUrl);
    }

    const response = await fetch(
      `${API_BASE}/armor-pipeline/texture-shell-batch`,
      {
        method: "POST",
        body: formData,
      },
    );

    if (!response.ok) {
      const err = await response.text();
      throw new Error(
        `Start batch texture failed (${response.status}): ${err}`,
      );
    }

    const result = (await response.json()) as {
      success: boolean;
      tasks: { tierId: string; taskId: string }[];
      error?: string;
    };

    if (!result.success) {
      throw new Error(result.error ?? "Start batch texture failed");
    }

    return result.tasks;
  }

  /**
   * Get the proxied download URL for a completed texture task.
   */
  getDownloadUrl(taskId: string): string {
    return `${API_BASE}/armor-pipeline/texture-download/${taskId}`;
  }
}

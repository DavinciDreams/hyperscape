/**
 * ArmorTripoService — Client-side Tripo 3D API wrapper
 *
 * Sends requests to our server which proxies to Tripo's API.
 * Supports the segment → per-part texture pipeline:
 *   1. uploadAndSegment — upload shell, import, segment, get part names
 *   2. textureParts — texture each part with a custom prompt, reassemble
 *   3. download — get the final GLB
 *
 * Completely separate from the Meshy pipeline (ArmorTextureService).
 */

export interface TripoTaskStatus {
  taskId: string;
  type: string;
  status: "queued" | "running" | "success" | "failed" | "banned" | "expired";
  progress: number;
  resultModelUrl?: string;
  resultPbrUrl?: string;
  resultBaseUrl?: string;
  resultImageUrl?: string;
  error?: string;
  consumedCredit?: number;
}

export type TripoProgressCallback = (status: TripoTaskStatus) => void;

const API_BASE =
  import.meta.env.VITE_GENERATION_API_URL?.replace(/\/$/, "") || "/api";

export class ArmorTripoService {
  private pollInterval = 3000;

  // =====================================================================
  // Step 1: Upload + Import + Segment (long-running server call)
  // =====================================================================

  /**
   * Upload shell GLB → import into Tripo → segment into parts.
   * Server-side performs the full chain and returns part names.
   *
   * This can take 1-3 minutes (upload + import + segmentation).
   */
  async uploadAndSegment(
    glbBlob: Blob,
    filename: string,
  ): Promise<{
    importTaskId: string;
    segmentTaskId: string;
    partNames: string[];
    sizeKB: number;
  }> {
    const formData = new FormData();
    formData.append("file", glbBlob, filename);
    formData.append("name", filename);

    const response = await fetch(`${API_BASE}/tripo/upload-and-segment`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(
        `Tripo upload-and-segment failed (${response.status}): ${err}`,
      );
    }

    const result = (await response.json()) as {
      success: boolean;
      importTaskId: string;
      segmentTaskId: string;
      partNames: string[];
      sizeKB: number;
      error?: string;
    };

    if (!result.success) {
      throw new Error(result.error ?? "Tripo upload-and-segment failed");
    }

    return {
      importTaskId: result.importTaskId,
      segmentTaskId: result.segmentTaskId,
      partNames: result.partNames,
      sizeKB: result.sizeKB,
    };
  }

  // =====================================================================
  // Step 2: Granular per-part texturing (client drives each step)
  // =====================================================================

  /**
   * Start texturing specific parts. Returns a taskId to poll.
   * Call this once per prompt group, chaining originalTaskId from the previous result.
   *
   * @param originalTaskId - segmentTaskId for first call, previous textureTaskId for subsequent
   * @param partNames - which parts to texture
   * @param prompt - texture prompt for these parts
   */
  async startTexturePart(
    originalTaskId: string,
    partNames: string[],
    prompt: string,
    options?: { quality?: "standard" | "detailed" },
  ): Promise<{ taskId: string }> {
    const response = await fetch(`${API_BASE}/tripo/texture-part`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        originalTaskId,
        partNames,
        prompt,
        quality: options?.quality ?? "standard",
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Tripo texture-part failed (${response.status}): ${err}`);
    }

    const result = (await response.json()) as {
      success: boolean;
      taskId: string;
      error?: string;
    };

    if (!result.success) {
      throw new Error(result.error ?? "Tripo texture-part failed");
    }

    return { taskId: result.taskId };
  }

  /**
   * Run mesh completion to reassemble after texturing.
   * Call after all texture-part steps are done.
   */
  async startMeshCompletion(
    originalTaskId: string,
  ): Promise<{ taskId: string }> {
    const response = await fetch(`${API_BASE}/tripo/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ originalTaskId }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Tripo complete failed (${response.status}): ${err}`);
    }

    const result = (await response.json()) as {
      success: boolean;
      taskId: string;
      error?: string;
    };

    if (!result.success) {
      throw new Error(result.error ?? "Tripo complete failed");
    }

    return { taskId: result.taskId };
  }

  // =====================================================================
  // Standalone: whole-model texture (no segments)
  // =====================================================================

  async startTextureShell(
    glbBlob: Blob,
    filename: string,
    options?: { quality?: "standard" | "detailed" },
  ): Promise<{ importTaskId: string; textureTaskId: string; sizeKB: number }> {
    const formData = new FormData();
    formData.append("file", glbBlob, filename);
    formData.append("name", filename);
    if (options?.quality) {
      formData.append("quality", options.quality);
    }

    const response = await fetch(`${API_BASE}/tripo/texture-shell`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(
        `Tripo texture-shell failed (${response.status}): ${err}`,
      );
    }

    const result = (await response.json()) as {
      success: boolean;
      importTaskId: string;
      textureTaskId: string;
      sizeKB: number;
      error?: string;
    };

    if (!result.success) {
      throw new Error(result.error ?? "Tripo texture-shell failed");
    }

    return {
      importTaskId: result.importTaskId,
      textureTaskId: result.textureTaskId,
      sizeKB: result.sizeKB,
    };
  }

  // =====================================================================
  // Text-to-model
  // =====================================================================

  async startTextToModel(
    prompt: string,
    options?: {
      faceLimit?: number;
      pbr?: boolean;
      quality?: "standard" | "detailed";
      style?: string;
    },
  ): Promise<{ taskId: string }> {
    const response = await fetch(`${API_BASE}/tripo/text-to-model`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        faceLimit: options?.faceLimit,
        pbr: options?.pbr,
        quality: options?.quality,
        style: options?.style,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(
        `Tripo text-to-model failed (${response.status}): ${err}`,
      );
    }

    const result = (await response.json()) as {
      success: boolean;
      taskId: string;
      error?: string;
    };

    if (!result.success) {
      throw new Error(result.error ?? "Tripo text-to-model failed");
    }

    return { taskId: result.taskId };
  }

  // =====================================================================
  // Polling + Download
  // =====================================================================

  async getStatus(taskId: string): Promise<TripoTaskStatus> {
    const response = await fetch(`${API_BASE}/tripo/task/${taskId}`);
    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Tripo status check failed: ${err}`);
    }
    return (await response.json()) as TripoTaskStatus;
  }

  async waitForCompletion(
    taskId: string,
    onProgress?: TripoProgressCallback,
  ): Promise<TripoTaskStatus> {
    const maxTime = 600000;
    const startTime = Date.now();

    while (true) {
      const status = await this.getStatus(taskId);
      onProgress?.(status);

      if (status.status === "success") return status;
      if (
        status.status === "failed" ||
        status.status === "banned" ||
        status.status === "expired"
      ) {
        throw new Error(
          `Tripo task ${status.status}: ${status.error ?? "Unknown"}`,
        );
      }

      if (Date.now() - startTime > maxTime) {
        throw new Error("Tripo task timed out after 10 minutes");
      }

      await new Promise((r) => setTimeout(r, this.pollInterval));
    }
  }

  getDownloadUrl(taskId: string): string {
    return `${API_BASE}/tripo/download/${taskId}`;
  }
}

import fs from "fs/promises";
import path from "path";

type Workflow = Record<string, any>;

interface ComfyPromptResponse {
  prompt_id: string;
}

interface ComfyOutputFile {
  filename: string;
  subfolder?: string;
  type?: string;
}

interface ComfyHistoryEntry {
  outputs?: Record<
    string,
    {
      images?: ComfyOutputFile[];
      gifs?: ComfyOutputFile[];
      videos?: ComfyOutputFile[];
      meshes?: ComfyOutputFile[];
      files?: ComfyOutputFile[];
      glb?: ComfyOutputFile[];
      [key: string]: unknown;
    }
  >;
  status?: {
    status_str?: string;
    completed?: boolean;
    messages?: unknown[];
  };
}

interface WorkflowRunOptions {
  workflowPath?: string;
  workflowJson?: string;
  prompt?: string;
  imagePath?: string;
  seed?: number;
  promptInputPath?: string;
  imageInputPath?: string;
  seedInputPath?: string;
  preferredExtensions: string[];
}

export interface ComfyWorkflowResult {
  promptId: string;
  file: ComfyOutputFile;
  url: string;
  buffer: Buffer;
}

export class ComfyUIService {
  readonly baseUrl: string;
  private timeoutMs: number;
  private pollIntervalMs: number;

  constructor(baseUrl = process.env.COMFYUI_BASE_URL || "http://host.docker.internal:8188") {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.timeoutMs = Number(process.env.COMFYUI_TIMEOUT_MS || 900000);
    this.pollIntervalMs = Number(process.env.COMFYUI_POLL_INTERVAL_MS || 2000);
  }

  get isConfigured(): boolean {
    return !!this.baseUrl;
  }

  async health(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/system_stats`, {
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async generateImage(prompt: string): Promise<ComfyWorkflowResult> {
    return this.runWorkflow({
      workflowPath: process.env.COMFY_IMAGE_WORKFLOW_PATH,
      workflowJson: process.env.COMFY_IMAGE_WORKFLOW_JSON,
      prompt,
      seed: Date.now() % 2147483647,
      promptInputPath: process.env.COMFY_IMAGE_PROMPT_PATH,
      seedInputPath: process.env.COMFY_IMAGE_SEED_PATH,
      preferredExtensions: [".png", ".jpg", ".jpeg", ".webp"],
    });
  }

  async generateModelFromImage(imagePath: string, prompt: string): Promise<ComfyWorkflowResult> {
    return this.runWorkflow({
      workflowPath: process.env.COMFY_3D_WORKFLOW_PATH || process.env.COMFY_TRELLIS_WORKFLOW_PATH,
      workflowJson: process.env.COMFY_3D_WORKFLOW_JSON || process.env.COMFY_TRELLIS_WORKFLOW_JSON,
      prompt,
      imagePath,
      seed: Date.now() % 2147483647,
      promptInputPath: process.env.COMFY_3D_PROMPT_PATH || process.env.COMFY_TRELLIS_PROMPT_PATH,
      imageInputPath: process.env.COMFY_3D_IMAGE_PATH || process.env.COMFY_TRELLIS_IMAGE_PATH,
      seedInputPath: process.env.COMFY_3D_SEED_PATH || process.env.COMFY_TRELLIS_SEED_PATH,
      preferredExtensions: [".glb", ".gltf", ".obj", ".ply", ".stl", ".zip"],
    });
  }

  private async runWorkflow(options: WorkflowRunOptions): Promise<ComfyWorkflowResult> {
    const workflow = await this.loadWorkflow(options);

    if (options.prompt && options.promptInputPath) {
      this.setWorkflowValue(workflow, options.promptInputPath, options.prompt);
    }
    if (options.imagePath && options.imageInputPath) {
      await this.setWorkflowImage(workflow, options.imageInputPath, options.imagePath);
    }
    if (typeof options.seed === "number" && options.seedInputPath) {
      this.setWorkflowValue(workflow, options.seedInputPath, options.seed);
    }

    const promptId = await this.queuePrompt(workflow);
    const history = await this.waitForHistory(promptId);
    const file = this.findOutputFile(history, options.preferredExtensions);

    if (!file) {
      throw new Error(`ComfyUI workflow ${promptId} completed without a matching output file`);
    }

    const url = this.viewUrl(file);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download ComfyUI output ${file.filename}: ${response.status}`);
    }

    return {
      promptId,
      file,
      url,
      buffer: Buffer.from(await response.arrayBuffer()),
    };
  }

  private async loadWorkflow(options: WorkflowRunOptions): Promise<Workflow> {
    if (options.workflowJson) {
      return JSON.parse(options.workflowJson);
    }
    if (options.workflowPath) {
      const raw = await fs.readFile(options.workflowPath, "utf-8");
      return JSON.parse(raw);
    }
    throw new Error("ComfyUI workflow is not configured");
  }

  private async queuePrompt(workflow: Workflow): Promise<string> {
    const response = await fetch(`${this.baseUrl}/prompt`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        prompt: workflow,
        client_id: `asset-forge-${Date.now()}`,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`ComfyUI prompt queue failed: ${response.status} ${text}`);
    }

    const data = (await response.json()) as ComfyPromptResponse;
    return data.prompt_id;
  }

  private async waitForHistory(promptId: string): Promise<ComfyHistoryEntry> {
    const started = Date.now();

    while (Date.now() - started < this.timeoutMs) {
      const response = await fetch(`${this.baseUrl}/history/${encodeURIComponent(promptId)}`);
      if (response.ok) {
        const history = (await response.json()) as Record<string, ComfyHistoryEntry>;
        const entry = history[promptId];
        if (entry?.status?.completed || entry?.outputs) {
          return entry;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
    }

    throw new Error(`ComfyUI workflow ${promptId} timed out`);
  }

  private findOutputFile(
    history: ComfyHistoryEntry,
    preferredExtensions: string[],
  ): ComfyOutputFile | null {
    const files: ComfyOutputFile[] = [];

    for (const output of Object.values(history.outputs || {})) {
      for (const value of Object.values(output)) {
        if (Array.isArray(value)) {
          files.push(...(value as ComfyOutputFile[]));
        }
      }
    }

    return (
      files.find((file) =>
        preferredExtensions.some((ext) => file.filename?.toLowerCase().endsWith(ext)),
      ) ||
      files[0] ||
      null
    );
  }

  private viewUrl(file: ComfyOutputFile): string {
    const params = new URLSearchParams({
      filename: file.filename,
      subfolder: file.subfolder || "",
      type: file.type || "output",
    });
    return `${this.baseUrl}/view?${params}`;
  }

  private async setWorkflowImage(workflow: Workflow, inputPath: string, imagePath: string): Promise<void> {
    const filename = await this.uploadImage(imagePath);
    this.setWorkflowValue(workflow, inputPath, filename);
  }

  private async uploadImage(imagePath: string): Promise<string> {
    const data = await fs.readFile(imagePath);
    const form = new FormData();
    form.append("image", new Blob([data]), path.basename(imagePath));
    form.append("overwrite", "true");

    const response = await fetch(`${this.baseUrl}/upload/image`, {
      method: "POST",
      body: form,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`ComfyUI image upload failed: ${response.status} ${text}`);
    }

    const result = (await response.json()) as { name?: string };
    return result.name || path.basename(imagePath);
  }

  private setWorkflowValue(workflow: Workflow, pointer: string, value: unknown): void {
    const parts = pointer.split(".").filter(Boolean);
    let current: any = workflow;

    for (const part of parts.slice(0, -1)) {
      if (current[part] === undefined) {
        throw new Error(`ComfyUI workflow path not found: ${pointer}`);
      }
      current = current[part];
    }

    const finalPart = parts[parts.length - 1];
    if (!finalPart || current[finalPart] === undefined) {
      throw new Error(`ComfyUI workflow path not found: ${pointer}`);
    }
    current[finalPart] = value;
  }
}

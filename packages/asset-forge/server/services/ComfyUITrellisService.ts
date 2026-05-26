/**
 * ComfyUI Trellis provider adapter.
 *
 * Queues a saved ComfyUI API workflow, patches prompt/image inputs, waits for
 * completion, and downloads the first 3D model file emitted by the workflow.
 */

import fs from "fs/promises";
import path from "path";
import fetch from "node-fetch";

type Workflow = Record<string, any>;

interface ComfyUITrellisConfig {
  baseUrl?: string;
  workflowPath?: string;
  clientId?: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
}

interface GenerateModelOptions {
  assetId: string;
  prompt: string;
  imageUrl: string;
  quality?: string;
  onProgress?: (progress: number) => void;
}

interface ComfyFileRef {
  filename: string;
  subfolder?: string;
  type?: string;
}

interface GenerateModelResult {
  promptId: string;
  modelBuffer: Buffer;
  modelUrl: string;
  outputFile: ComfyFileRef;
}

export class ComfyUITrellisService {
  private baseUrl: string;
  private workflowPath?: string;
  private clientId: string;
  private timeoutMs: number;
  private pollIntervalMs: number;

  constructor(config: ComfyUITrellisConfig = {}) {
    this.baseUrl = (
      config.baseUrl ||
      process.env.COMFYUI_BASE_URL ||
      "http://127.0.0.1:8188"
    ).replace(/\/$/, "");
    this.workflowPath =
      config.workflowPath || process.env.COMFYUI_TRELLIS_WORKFLOW_PATH;
    this.clientId =
      config.clientId ||
      process.env.COMFYUI_CLIENT_ID ||
      `asset-forge-${process.pid}`;
    this.timeoutMs =
      config.timeoutMs ||
      Number(process.env.COMFYUI_TRELLIS_TIMEOUT_MS || 900000);
    this.pollIntervalMs =
      config.pollIntervalMs ||
      Number(process.env.COMFYUI_TRELLIS_POLL_INTERVAL_MS || 5000);
  }

  async generateModel(
    options: GenerateModelOptions,
  ): Promise<GenerateModelResult> {
    if (!this.workflowPath) {
      throw new Error(
        "COMFYUI_TRELLIS_WORKFLOW_PATH is required for the comfyui-trellis provider",
      );
    }

    const workflow = await this.loadWorkflow();
    const uploadedImage = await this.uploadImage(
      options.imageUrl,
      options.assetId,
    );
    this.patchWorkflow(workflow, {
      prompt: options.prompt,
      imageName: uploadedImage,
      seed: Date.now(),
      quality: options.quality,
    });

    const promptId = await this.queuePrompt(workflow);
    const history = await this.waitForHistory(promptId, options.onProgress);
    const outputFile = this.findModelOutput(history);
    const modelUrl = this.buildViewUrl(outputFile);
    const modelBuffer = Buffer.from(
      await (await fetch(modelUrl)).arrayBuffer(),
    );

    return {
      promptId,
      modelBuffer,
      modelUrl,
      outputFile,
    };
  }

  private async loadWorkflow(): Promise<Workflow> {
    const workflowPath = path.resolve(this.workflowPath!);
    const raw = await fs.readFile(workflowPath, "utf-8");
    const parsed = JSON.parse(raw);
    return parsed.prompt || parsed.workflow || parsed;
  }

  private async uploadImage(
    imageUrl: string,
    assetId: string,
  ): Promise<string> {
    const buffer = await this.readImageBuffer(imageUrl);
    const filename = `${assetId}-trellis-input.png`;
    const form = new FormData();
    form.append("image", new Blob([buffer]), filename);
    form.append("type", "input");
    form.append("overwrite", "true");

    const response = await fetch(`${this.baseUrl}/upload/image`, {
      method: "POST",
      body: form as any,
    });

    if (!response.ok) {
      throw new Error(
        `ComfyUI image upload failed: ${response.status} ${await response.text()}`,
      );
    }

    const body = (await response.json()) as { name?: string };
    return body.name || filename;
  }

  private async readImageBuffer(imageUrl: string): Promise<Buffer> {
    if (imageUrl.startsWith("data:")) {
      return Buffer.from(imageUrl.split(",")[1] || "", "base64");
    }

    if (imageUrl.startsWith("file://")) {
      return fs.readFile(imageUrl.replace("file://", ""));
    }

    if (!/^https?:\/\//i.test(imageUrl)) {
      return fs.readFile(path.resolve(imageUrl));
    }

    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch Trellis input image: ${response.status}`,
      );
    }
    return Buffer.from(await response.arrayBuffer());
  }

  private patchWorkflow(
    workflow: Workflow,
    values: {
      prompt: string;
      imageName: string;
      seed: number;
      quality?: string;
    },
  ) {
    const promptNodeId = process.env.COMFYUI_TRELLIS_PROMPT_NODE_ID;
    const promptInput = process.env.COMFYUI_TRELLIS_PROMPT_INPUT || "text";
    const imageNodeId = process.env.COMFYUI_TRELLIS_IMAGE_NODE_ID;
    const imageInput = process.env.COMFYUI_TRELLIS_IMAGE_INPUT || "image";
    const seedNodeId = process.env.COMFYUI_TRELLIS_SEED_NODE_ID;
    const seedInput = process.env.COMFYUI_TRELLIS_SEED_INPUT || "seed";

    if (promptNodeId && workflow[promptNodeId]?.inputs) {
      workflow[promptNodeId].inputs[promptInput] = values.prompt;
    }
    if (imageNodeId && workflow[imageNodeId]?.inputs) {
      workflow[imageNodeId].inputs[imageInput] = values.imageName;
    }
    if (seedNodeId && workflow[seedNodeId]?.inputs) {
      workflow[seedNodeId].inputs[seedInput] = values.seed;
    }

    for (const node of Object.values(workflow)) {
      if (!node || typeof node !== "object" || !node.inputs) continue;
      const classType = String(node.class_type || "").toLowerCase();

      if (!promptNodeId && this.looksLikePromptNode(classType, node.inputs)) {
        const key = "text" in node.inputs ? "text" : "prompt";
        node.inputs[key] = values.prompt;
      }

      if (!imageNodeId && classType.includes("loadimage")) {
        node.inputs.image = values.imageName;
      }

      if (
        !seedNodeId &&
        "seed" in node.inputs &&
        typeof node.inputs.seed === "number"
      ) {
        node.inputs.seed = values.seed;
      }
    }
  }

  private looksLikePromptNode(
    classType: string,
    inputs: Record<string, unknown>,
  ) {
    return (
      classType.includes("cliptextencode") ||
      classType.includes("prompt") ||
      ("text" in inputs && typeof inputs.text === "string") ||
      ("prompt" in inputs && typeof inputs.prompt === "string")
    );
  }

  private async queuePrompt(workflow: Workflow): Promise<string> {
    const response = await fetch(`${this.baseUrl}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: workflow, client_id: this.clientId }),
    });

    if (!response.ok) {
      throw new Error(
        `ComfyUI prompt queue failed: ${response.status} ${await response.text()}`,
      );
    }

    const body = (await response.json()) as {
      prompt_id?: string;
      error?: unknown;
    };
    if (!body.prompt_id) {
      throw new Error(
        `ComfyUI did not return a prompt_id: ${JSON.stringify(body)}`,
      );
    }
    return body.prompt_id;
  }

  private async waitForHistory(
    promptId: string,
    onProgress?: (progress: number) => void,
  ): Promise<unknown> {
    const startedAt = Date.now();

    while (Date.now() - startedAt < this.timeoutMs) {
      const response = await fetch(`${this.baseUrl}/history/${promptId}`);
      if (response.ok) {
        const body = (await response.json()) as Record<string, unknown>;
        if (body[promptId]) {
          onProgress?.(95);
          return body[promptId];
        }
      }

      const elapsedRatio = (Date.now() - startedAt) / this.timeoutMs;
      onProgress?.(Math.min(94, Math.round(10 + elapsedRatio * 84)));
      await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
    }

    throw new Error(
      `ComfyUI Trellis generation timed out after ${this.timeoutMs}ms`,
    );
  }

  private findModelOutput(history: unknown): ComfyFileRef {
    const preferredOutputNode = process.env.COMFYUI_TRELLIS_OUTPUT_NODE_ID;
    const candidates = this.collectFileRefs(
      preferredOutputNode
        ? (history as any)?.outputs?.[preferredOutputNode]
        : history,
    );

    const model = candidates.find((file) =>
      /\.(glb|gltf|vrm|obj)$/i.test(file.filename),
    );

    if (!model) {
      throw new Error(
        "ComfyUI Trellis completed but no GLB/GLTF/VRM/OBJ output was found in history",
      );
    }

    return model;
  }

  private collectFileRefs(value: unknown): ComfyFileRef[] {
    if (!value || typeof value !== "object") return [];

    const object = value as Record<string, unknown>;
    const refs: ComfyFileRef[] = [];
    if (typeof object.filename === "string") {
      refs.push({
        filename: object.filename,
        subfolder:
          typeof object.subfolder === "string" ? object.subfolder : undefined,
        type: typeof object.type === "string" ? object.type : "output",
      });
    }

    for (const child of Object.values(object)) {
      if (Array.isArray(child)) {
        for (const item of child) refs.push(...this.collectFileRefs(item));
      } else if (child && typeof child === "object") {
        refs.push(...this.collectFileRefs(child));
      }
    }

    return refs;
  }

  private buildViewUrl(file: ComfyFileRef): string {
    const params = new URLSearchParams({
      filename: file.filename,
      type: file.type || "output",
    });
    if (file.subfolder) params.set("subfolder", file.subfolder);
    return `${this.baseUrl}/view?${params.toString()}`;
  }
}

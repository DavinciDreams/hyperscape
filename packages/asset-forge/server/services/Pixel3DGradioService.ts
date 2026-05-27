/**
 * Pixel3D Gradio provider adapter.
 *
 * Calls a Pixel3D Gradio app through Gradio's HTTP queue API and extracts the
 * generated GLB from the event result. The exact input order can be configured
 * with PIXEL3D_GRADIO_INPUTS so different Space/app variants can be wired
 * without code changes.
 */

import fetch from "node-fetch";

type Pixel3DInputName = string;

interface Pixel3DGradioConfig {
  baseUrl?: string;
  apiName?: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
  inputs?: Pixel3DInputName[];
}

interface GenerateModelOptions {
  assetId: string;
  prompt: string;
  imageUrl: string;
  quality?: string;
  onProgress?: (progress: number) => void;
}

interface GenerateModelResult {
  jobId: string;
  modelUrl: string;
  modelBuffer: Buffer;
  rawResult: unknown;
}

interface GradioQueuedResponse {
  event_id?: string;
  eventId?: string;
}

interface GradioSseMessage {
  msg?: string;
  event?: string;
  output?: {
    data?: unknown[];
    error?: string;
  };
  success?: boolean;
}

interface FileLikeResult {
  url?: string;
  path?: string;
  name?: string;
  orig_name?: string;
  data?: string;
}

export class Pixel3DGradioService {
  private baseUrl: string;
  private apiName: string;
  private timeoutMs: number;
  private pollIntervalMs: number;
  private inputs: Pixel3DInputName[];

  constructor(config: Pixel3DGradioConfig = {}) {
    const baseUrl =
      config.baseUrl ||
      process.env.PIXEL3D_GRADIO_BASE_URL ||
      process.env.PIXEL3D_BASE_URL;
    if (!baseUrl) {
      throw new Error(
        "PIXEL3D_GRADIO_BASE_URL is required for the pixel3d-gradio provider",
      );
    }

    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.apiName =
      config.apiName ||
      process.env.PIXEL3D_GRADIO_API_NAME ||
      process.env.PIXEL3D_API_NAME ||
      "/generate_3d";
    this.timeoutMs =
      config.timeoutMs ||
      Number(process.env.PIXEL3D_GRADIO_TIMEOUT_MS || 900000);
    this.pollIntervalMs =
      config.pollIntervalMs ||
      Number(process.env.PIXEL3D_GRADIO_POLL_INTERVAL_MS || 5000);
    this.inputs =
      config.inputs ||
      this.parseInputs(process.env.PIXEL3D_GRADIO_INPUTS) ||
      this.defaultInputs();
  }

  async generateModel(
    options: GenerateModelOptions,
  ): Promise<GenerateModelResult> {
    const eventId = await this.queueGeneration(options);
    const result = await this.waitForResult(eventId, options.onProgress);
    const modelUrl = this.extractModelUrl(result);
    const response = await fetch(modelUrl);

    if (!response.ok) {
      throw new Error(
        `Pixel3D model download failed: ${response.status} ${await response.text()}`,
      );
    }

    return {
      jobId: eventId,
      modelUrl,
      modelBuffer: Buffer.from(await response.arrayBuffer()),
      rawResult: result,
    };
  }

  private parseInputs(value?: string): Pixel3DInputName[] | undefined {
    if (!value) return undefined;
    const inputs = value
      .split(",")
      .map((input) => input.trim())
      .filter((input) => input.length > 0);
    return inputs.length > 0 ? inputs : undefined;
  }

  private defaultInputs(): Pixel3DInputName[] {
    if (this.normalizedApiName() !== "generate_3d") {
      return ["image", "prompt"];
    }

    return [
      "image",
      "seed",
      "resolution",
      "preprocessed_image",
      "preprocessed_name",
      "ss_guidance_strength",
      "ss_guidance_rescale",
      "ss_sampling_steps",
      "ss_rescale_t",
      "shape_slat_guidance_strength",
      "shape_slat_guidance_rescale",
      "shape_slat_sampling_steps",
      "shape_slat_rescale_t",
      "tex_slat_guidance_strength",
      "tex_slat_guidance_rescale",
      "tex_slat_sampling_steps",
      "tex_slat_rescale_t",
      "preview_resolution",
      "preview_frames",
      "manual_fov",
      "fov_unit",
      "session_id",
    ];
  }

  private async queueGeneration(
    options: GenerateModelOptions,
  ): Promise<string> {
    const data = await Promise.all(
      this.inputs.map((input) => this.inputValue(input, options)),
    );
    const response = await fetch(this.apiUrl("call"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Pixel3D queue request failed: ${response.status} ${await response.text()}`,
      );
    }

    const body = (await response.json()) as GradioQueuedResponse;
    const eventId = body.event_id || body.eventId;
    if (!eventId) {
      throw new Error(
        `Pixel3D did not return an event id: ${JSON.stringify(body)}`,
      );
    }
    return eventId;
  }

  private async inputValue(
    input: Pixel3DInputName,
    options: GenerateModelOptions,
  ): Promise<unknown> {
    switch (input) {
      case "image":
        return this.imageInput(options.imageUrl, options.assetId);
      case "prompt":
        return options.prompt;
      case "seed":
        return this.numberEnv("PIXEL3D_SEED", Date.now());
      case "quality":
        return options.quality || "standard";
      case "resolution":
        return this.numberEnv("PIXEL3D_RESOLUTION", 1024);
      case "preprocessed_image":
        return null;
      case "preprocessed_name":
        return "";
      case "ss_guidance_strength":
        return this.numberEnv("PIXEL3D_SS_GUIDANCE_STRENGTH", 7.5);
      case "ss_guidance_rescale":
        return this.numberEnv("PIXEL3D_SS_GUIDANCE_RESCALE", 0.7);
      case "ss_sampling_steps":
        return this.numberEnv("PIXEL3D_SS_SAMPLING_STEPS", 12);
      case "ss_rescale_t":
        return this.numberEnv("PIXEL3D_SS_RESCALE_T", 5.0);
      case "shape_slat_guidance_strength":
        return this.numberEnv("PIXEL3D_SHAPE_SLAT_GUIDANCE_STRENGTH", 7.5);
      case "shape_slat_guidance_rescale":
        return this.numberEnv("PIXEL3D_SHAPE_SLAT_GUIDANCE_RESCALE", 0.5);
      case "shape_slat_sampling_steps":
        return this.numberEnv("PIXEL3D_SHAPE_SLAT_SAMPLING_STEPS", 12);
      case "shape_slat_rescale_t":
        return this.numberEnv("PIXEL3D_SHAPE_SLAT_RESCALE_T", 3.0);
      case "tex_slat_guidance_strength":
        return this.numberEnv("PIXEL3D_TEX_SLAT_GUIDANCE_STRENGTH", 1.0);
      case "tex_slat_guidance_rescale":
        return this.numberEnv("PIXEL3D_TEX_SLAT_GUIDANCE_RESCALE", 0.0);
      case "tex_slat_sampling_steps":
        return this.numberEnv("PIXEL3D_TEX_SLAT_SAMPLING_STEPS", 12);
      case "tex_slat_rescale_t":
        return this.numberEnv("PIXEL3D_TEX_SLAT_RESCALE_T", 3.0);
      case "preview_resolution":
        return this.numberEnv("PIXEL3D_PREVIEW_RESOLUTION", 768);
      case "preview_frames":
        return this.numberEnv("PIXEL3D_PREVIEW_FRAMES", 6);
      case "manual_fov":
        return this.numberEnv("PIXEL3D_MANUAL_FOV", -1.0);
      case "fov_unit":
        return process.env.PIXEL3D_FOV_UNIT || "deg";
      case "session_id":
        return `${options.assetId}-${Date.now()}`;
      default:
        return process.env[`PIXEL3D_INPUT_${input.toUpperCase()}`] || null;
    }
  }

  private numberEnv(name: string, fallback: number): number {
    const value = process.env[name];
    if (!value) return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private async imageInput(
    imageUrl: string,
    assetId: string,
  ): Promise<string | FileLikeResult> {
    if (imageUrl.startsWith("data:")) {
      return this.uploadDataUrl(imageUrl, `${assetId}-pixel3d-input.png`);
    }

    return imageUrl;
  }

  private async uploadDataUrl(
    dataUrl: string,
    filename: string,
  ): Promise<FileLikeResult> {
    const contentType =
      /^data:([^;,]+)/.exec(dataUrl)?.[1] || "application/octet-stream";
    const buffer = Buffer.from(dataUrl.split(",")[1] || "", "base64");
    const response = await this.tryUpload(buffer, contentType, filename);
    const result = (await response.json()) as unknown;
    const path = this.collectCandidates(result)[0];
    if (!path) {
      throw new Error(
        `Pixel3D image upload returned no path: ${JSON.stringify(result)}`,
      );
    }

    return {
      path,
      orig_name: filename,
    };
  }

  private async tryUpload(
    buffer: Buffer,
    contentType: string,
    filename: string,
  ) {
    const endpoints = [
      `${this.baseUrl}/gradio_api/upload`,
      `${this.baseUrl}/upload`,
    ];

    let lastError = "";
    for (const endpoint of endpoints) {
      const form = new FormData();
      form.append("files", new Blob([buffer], { type: contentType }), filename);
      const response = await fetch(endpoint, {
        method: "POST",
        body: form,
      });
      if (response.ok) return response;
      lastError = `${response.status} ${await response.text()}`;
    }

    throw new Error(`Pixel3D image upload failed: ${lastError}`);
  }

  private async waitForResult(
    eventId: string,
    onProgress?: (progress: number) => void,
  ): Promise<unknown> {
    const startedAt = Date.now();
    let lastProgress = 10;

    while (Date.now() - startedAt < this.timeoutMs) {
      const response = await fetch(`${this.apiUrl("call")}/${eventId}`, {
        headers: { Accept: "text/event-stream" },
      });

      if (!response.ok) {
        throw new Error(
          `Pixel3D status request failed: ${response.status} ${await response.text()}`,
        );
      }

      const text = await response.text();
      const messages = this.parseSseMessages(text);
      const terminal = messages.find(
        (message) =>
          message.msg === "process_completed" ||
          message.event === "complete" ||
          message.output,
      );

      if (terminal?.output?.error) {
        throw new Error(terminal.output.error);
      }

      const data = terminal?.output?.data;
      if (data && data.length > 0) {
        onProgress?.(100);
        return data;
      }

      lastProgress = Math.min(95, lastProgress + 5);
      onProgress?.(lastProgress);
      await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
    }

    throw new Error(`Pixel3D generation timed out after ${this.timeoutMs}ms`);
  }

  private parseSseMessages(text: string): GradioSseMessage[] {
    const messages: GradioSseMessage[] = [];
    for (const line of text.split("\n")) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice("data:".length).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        messages.push(JSON.parse(payload) as GradioSseMessage);
      } catch {
        // Gradio can emit non-JSON heartbeat lines; ignore them.
      }
    }
    return messages;
  }

  private extractModelUrl(result: unknown): string {
    const candidates = this.collectCandidates(result);
    const candidate = candidates.find((value) =>
      /\.(glb|gltf|obj)(\?|$)/i.test(value),
    );
    if (!candidate) {
      throw new Error(
        `Pixel3D completed without a GLB/GLTF/OBJ output: ${JSON.stringify(result)}`,
      );
    }

    if (/^https?:\/\//i.test(candidate)) {
      return candidate;
    }

    if (candidate.startsWith("/")) {
      return new URL(candidate, `${this.baseUrl}/`).toString();
    }

    const fileUrl = new URL("/file=", `${this.baseUrl}/`);
    fileUrl.pathname = `/file=${candidate}`;
    return fileUrl.toString();
  }

  private collectCandidates(value: unknown): string[] {
    if (typeof value === "string") return [value];
    if (Array.isArray(value)) {
      return value.flatMap((item) => this.collectCandidates(item));
    }
    if (!value || typeof value !== "object") return [];

    const file = value as FileLikeResult;
    return [
      file.url,
      file.path,
      file.name,
      file.orig_name,
      file.data,
      ...Object.values(value).flatMap((item) => this.collectCandidates(item)),
    ].filter((item): item is string => typeof item === "string");
  }

  private apiUrl(kind: "call"): string {
    return `${this.baseUrl}/gradio_api/${kind}/${this.normalizedApiName()}`;
  }

  private normalizedApiName(): string {
    return this.apiName.startsWith("/") ? this.apiName.slice(1) : this.apiName;
  }
}

/**
 * AI Creation Service for Server
 * Provides image generation and Meshy integration with TypeScript
 */

import { getGenerationPrompts } from "../utils/promptLoader";

// Type for fetch function (compatible with both global fetch and node-fetch)
type FetchFunction = typeof fetch;

// ==================== Configuration Interfaces ====================

interface OpenAIConfig {
  apiKey: string;
  model?: string;
  imageServerBaseUrl?: string;
  fetchFn?: FetchFunction;
}

interface MeshyConfig {
  apiKey: string;
  baseUrl?: string;
  fetchFn?: FetchFunction;
}

interface AIServiceConfig {
  openai: OpenAIConfig;
  meshy: MeshyConfig;
  fetchFn?: FetchFunction;
}

// ==================== Image Generation Interfaces ====================

interface ImageMetadata {
  model: string;
  resolution: string;
  quality: string;
  timestamp: string;
}

interface ImageGenerationResult {
  imageUrl: string;
  prompt: string;
  metadata: ImageMetadata;
}

interface OpenAIImageResponse {
  data: Array<{
    url?: string;
    b64_json?: string;
  }>;
}

// ==================== Meshy API Interfaces ====================

interface ImageTo3DOptions {
  enable_pbr?: boolean;
  ai_model?: string;
  topology?: string;
  targetPolycount?: number;
  texture_resolution?: number;
}

interface RetextureInput {
  inputTaskId?: string;
  modelUrl?: string;
}

interface RetextureStyle {
  textStylePrompt?: string;
  imageStyleUrl?: string;
}

interface RetextureOptions {
  artStyle?: string;
  aiModel?: string;
  enableOriginalUV?: boolean;
}

interface RiggingInput {
  inputTaskId?: string;
  modelUrl?: string;
}

interface RiggingOptions {
  heightMeters?: number;
}

interface MeshyTaskResult {
  task_id?: string;
  id?: string;
  status?: string;
  model_url?: string;
  thumbnail_url?: string;
  progress?: number;
  error?: string;
}

interface MeshyTaskResponse {
  task_id?: string;
  id?: string;
  result?: MeshyTaskResult;
}

interface MeshyStatusResult {
  status?: string;
  progress?: number;
  model_url?: string;
  thumbnail_url?: string;
  task_id?: string;
  id?: string;
  error?: string;
}

interface MeshyStatusResponse {
  result?: MeshyStatusResult;
  status?: string;
  progress?: number;
  model_url?: string;
  thumbnail_url?: string;
  task_id?: string;
  id?: string;
}

interface AIGatewayImageResponse {
  choices: Array<{
    message: {
      images?: Array<{
        image_url: string | { url?: string };
      }>;
      content?: unknown;
    };
  }>;
}

function isConfiguredSecret(value: string | undefined): value is string {
  if (!value) return false;

  const normalized = value.trim();
  if (!normalized) return false;

  return ![
    "your_vercel_api_key_here",
    "your_openai_api_key_here",
    "your_openai_api_key",
    "your_meshy_api_key",
    "your_tripo_api_key",
  ].includes(normalized.toLowerCase());
}

function readImageUrl(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const imageUrl = record.image_url;

  if (typeof imageUrl === "string" && imageUrl.length > 0) {
    return imageUrl;
  }

  if (imageUrl && typeof imageUrl === "object") {
    const url = (imageUrl as Record<string, unknown>).url;
    if (typeof url === "string" && url.length > 0) {
      return url;
    }
  }

  const url = record.url;
  if (typeof url === "string" && url.length > 0) {
    return url;
  }

  const b64Json = record.b64_json;
  if (typeof b64Json === "string" && b64Json.length > 0) {
    return `data:image/png;base64,${b64Json}`;
  }

  return null;
}

function extractGatewayImageUrl(data: AIGatewayImageResponse): string | null {
  const message = data.choices?.[0]?.message;
  if (!message) return null;

  const imageFromImages = message.images
    ?.map((image) => readImageUrl(image))
    .find((url): url is string => !!url);

  if (imageFromImages) {
    return imageFromImages;
  }

  if (Array.isArray(message.content)) {
    return (
      message.content
        .map((part) => readImageUrl(part))
        .find((url): url is string => !!url) || null
    );
  }

  return readImageUrl(message.content);
}

// ==================== Generation Prompts Interface ====================

interface GenerationPrompts {
  imageGeneration?: {
    base?: string;
    fallbackEnhancement?: string;
  };
  posePrompts?: Record<string, unknown>;
}

// ==================== Main Service Class ====================

export class AICreationService {
  private config: AIServiceConfig;
  private imageService: ImageGenerationService;
  private meshyService: MeshyService;

  constructor(config: AIServiceConfig) {
    this.config = config;
    // Pass fetchFn to child services, defaulting to global fetch
    const fetchFn = config.fetchFn || fetch;
    this.imageService = new ImageGenerationService({
      ...config.openai,
      fetchFn,
    });
    this.meshyService = new MeshyService({ ...config.meshy, fetchFn });
  }

  getImageService(): ImageGenerationService {
    return this.imageService;
  }

  getMeshyService(): MeshyService {
    return this.meshyService;
  }
}

// ==================== Image Generation Service ====================

class ImageGenerationService {
  private apiKey: string;
  private model: string;
  private imageServerBaseUrl?: string;
  private fetchFn: FetchFunction;

  constructor(config: OpenAIConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model || "gpt-image-1";
    this.imageServerBaseUrl = config.imageServerBaseUrl;
    this.fetchFn = config.fetchFn || fetch;
  }

  async generateImage(
    description: string,
    assetType: string,
    style?: string,
  ): Promise<ImageGenerationResult> {
    const gatewayApiKey = process.env.AI_GATEWAY_API_KEY;
    const openaiApiKey = process.env.OPENAI_API_KEY || this.apiKey;
    const useAIGateway = isConfiguredSecret(gatewayApiKey);
    const useDirectOpenAI = isConfiguredSecret(openaiApiKey);

    if (!useAIGateway && !useDirectOpenAI) {
      throw new Error(
        "A real AI_GATEWAY_API_KEY or OPENAI_API_KEY is required for image generation",
      );
    }

    // Load generation prompts
    const generationPrompts =
      (await getGenerationPrompts()) as GenerationPrompts | null;
    const promptTemplate: string =
      generationPrompts?.imageGeneration?.base ||
      '${description}. ${style || "game-ready"} style, ${assetType}, clean geometry suitable for 3D conversion.';

    // Replace template variables
    const prompt = promptTemplate
      .replace("${description}", description)
      .replace('${style || "game-ready"}', style || "game-ready")
      .replace("${assetType}", assetType);

    if (useAIGateway && !useDirectOpenAI) {
      const gatewayResult = await this.generateImageWithGateway(
        gatewayApiKey,
        prompt,
      );
      return {
        imageUrl: gatewayResult.imageUrl,
        prompt,
        metadata: {
          model: gatewayResult.model,
          resolution: "1024x1024",
          quality: "high",
          timestamp: new Date().toISOString(),
        },
      };
    }

    if (useAIGateway && useDirectOpenAI) {
      try {
        const gatewayResult = await this.generateImageWithGateway(
          gatewayApiKey,
          prompt,
        );
        return {
          imageUrl: gatewayResult.imageUrl,
          prompt,
          metadata: {
            model: gatewayResult.model,
            resolution: "1024x1024",
            quality: "high",
            timestamp: new Date().toISOString(),
          },
        };
      } catch (error) {
        const gatewayError =
          error instanceof Error ? error : new Error(String(error));
        console.warn(
          "AI Gateway image generation failed, falling back to direct OpenAI:",
          gatewayError.message,
        );
      }
    }

    const openaiResult = await this.generateImageWithOpenAI(
      openaiApiKey,
      prompt,
    );

    return {
      imageUrl: openaiResult.imageUrl,
      prompt,
      metadata: {
        model: openaiResult.model,
        resolution: "1024x1024",
        quality: "high",
        timestamp: new Date().toISOString(),
      },
    };
  }

  private async generateImageWithGateway(
    apiKey: string | undefined,
    prompt: string,
  ): Promise<{ imageUrl: string; model: string }> {
    if (!isConfiguredSecret(apiKey)) {
      throw new Error("AI_GATEWAY_API_KEY is missing or still a placeholder");
    }

    const model = "google/gemini-2.5-flash-image";
    console.log(
      `🎨 Using Vercel AI Gateway for image generation (model: ${model})`,
    );

    const response = await this.fetchFn(
      "https://ai-gateway.vercel.sh/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "user",
              content: `Generate an image: ${prompt}`,
            },
          ],
        }),
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`AI Gateway error: ${response.status} - ${error}`);
    }

    const data = (await response.json()) as AIGatewayImageResponse;
    const imageUrl = extractGatewayImageUrl(data);
    if (!imageUrl) {
      console.error("No image found in AI Gateway response:", data);
      throw new Error("No image data returned from AI Gateway");
    }

    return { imageUrl, model };
  }

  private async generateImageWithOpenAI(
    apiKey: string | undefined,
    prompt: string,
  ): Promise<{ imageUrl: string; model: string }> {
    if (!isConfiguredSecret(apiKey)) {
      throw new Error("OPENAI_API_KEY is missing or still a placeholder");
    }

    const model = this.model;
    console.log(
      `🎨 Using direct OpenAI API for image generation (model: ${model})`,
    );

    const response = await this.fetchFn(
      "https://api.openai.com/v1/images/generations",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          prompt,
          size: "1024x1024",
          quality: "high",
        }),
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI image API error: ${response.status} - ${error}`);
    }

    const data = (await response.json()) as OpenAIImageResponse;
    const imageData = data.data?.[0];
    if (imageData?.b64_json) {
      return {
        imageUrl: `data:image/png;base64,${imageData.b64_json}`,
        model,
      };
    }

    if (imageData?.url) {
      return { imageUrl: imageData.url, model };
    }

    throw new Error("No image data returned from OpenAI API");
  }
}

// ==================== Meshy Service ====================

class MeshyService {
  private apiKey: string;
  private baseUrl: string;
  private fetchFn: FetchFunction;

  constructor(config: MeshyConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || "https://api.meshy.ai";
    this.fetchFn = config.fetchFn || fetch;
  }

  async startImageTo3D(
    imageUrl: string,
    options: ImageTo3DOptions,
  ): Promise<string | MeshyTaskResult> {
    const response = await this.fetchFn(
      `${this.baseUrl}/openapi/v1/image-to-3d`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          image_url: imageUrl,
          enable_pbr: options.enable_pbr ?? false,
          ai_model: options.ai_model || "meshy-4",
          topology: options.topology || "quad",
          target_polycount: options.targetPolycount || 2000,
          texture_resolution: options.texture_resolution || 512,
        }),
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Meshy API error: ${response.status} - ${error}`);
    }

    const data = (await response.json()) as MeshyTaskResponse;
    // Normalize to task id string for polling
    const taskId =
      data.task_id ||
      data.id ||
      (data.result && (data.result.task_id || data.result.id));
    if (!taskId) {
      // Fallback to previous behavior but this will likely break polling
      return data.result || data;
    }
    return taskId;
  }

  async getTaskStatus(taskId: string): Promise<MeshyStatusResult> {
    const response = await this.fetchFn(
      `${this.baseUrl}/openapi/v1/image-to-3d/${taskId}`,
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Meshy API error: ${response.status} - ${error}`);
    }

    const data = (await response.json()) as MeshyStatusResponse;
    return data.result || data;
  }

  async startRetextureTask(
    input: RetextureInput,
    style: RetextureStyle,
    options: RetextureOptions,
  ): Promise<string | MeshyTaskResult> {
    const body: Record<string, string | boolean | undefined> = {
      art_style: options.artStyle || "realistic",
      ai_model: options.aiModel || "meshy-5",
      enable_original_uv: options.enableOriginalUV ?? true,
    };

    if (input.inputTaskId) {
      body.input_task_id = input.inputTaskId;
    } else {
      body.model_url = input.modelUrl;
    }

    if (style.textStylePrompt) {
      body.text_style_prompt = style.textStylePrompt;
    } else {
      body.image_style_url = style.imageStyleUrl;
    }

    const response = await this.fetchFn(
      `${this.baseUrl}/openapi/v1/retexture`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(
        `Meshy Retexture API error: ${response.status} - ${error}`,
      );
    }

    const data = (await response.json()) as MeshyTaskResponse;
    // Normalize to task id string for polling
    const taskId =
      data.task_id ||
      data.id ||
      (data.result && (data.result.task_id || data.result.id));
    if (!taskId) {
      return data.result || data;
    }
    return taskId;
  }

  async getRetextureTaskStatus(taskId: string): Promise<MeshyStatusResult> {
    const response = await this.fetchFn(
      `${this.baseUrl}/openapi/v1/retexture/${taskId}`,
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Meshy API error: ${response.status} - ${error}`);
    }

    const data = (await response.json()) as MeshyStatusResponse;
    return data.result || data;
  }

  // Rigging methods for auto-rigging avatars
  async startRiggingTask(
    input: RiggingInput,
    options: RiggingOptions = {},
  ): Promise<string | MeshyTaskResult> {
    const body: Record<string, string | number | undefined> = {
      height_meters: options.heightMeters || 1.7,
    };

    if (input.inputTaskId) {
      body.input_task_id = input.inputTaskId;
    } else if (input.modelUrl) {
      body.model_url = input.modelUrl;
    } else {
      throw new Error("Either inputTaskId or modelUrl must be provided");
    }

    const response = await this.fetchFn(`${this.baseUrl}/openapi/v1/rigging`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Meshy rigging API error: ${response.status} - ${error}`);
    }

    const data = (await response.json()) as MeshyTaskResponse;
    // Normalize to task id string for polling
    const taskId =
      data.task_id ||
      data.id ||
      (data.result && (data.result.task_id || data.result.id));
    if (!taskId) {
      return data.result || data;
    }
    return taskId;
  }

  async getRiggingTaskStatus(taskId: string): Promise<MeshyStatusResult> {
    const response = await this.fetchFn(
      `${this.baseUrl}/openapi/v1/rigging/${taskId}`,
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(
        `Meshy rigging status error: ${response.status} - ${error}`,
      );
    }

    return await response.json();
  }
}

// ==================== Type Exports ====================

export type {
  AIServiceConfig,
  OpenAIConfig,
  MeshyConfig,
  ImageGenerationResult,
  ImageMetadata,
  ImageTo3DOptions,
  RetextureInput,
  RetextureStyle,
  RetextureOptions,
  RiggingInput,
  RiggingOptions,
  GenerationPrompts,
};

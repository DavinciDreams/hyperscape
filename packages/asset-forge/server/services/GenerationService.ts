/**
 * Generation Service
 * Handles AI-powered asset generation pipelines
 */

import EventEmitter from "events";
import type { UserContextType, AssetMetadataType } from "../models";
import { AICreationService } from "./AICreationService";
import { ComfyUIService } from "./ComfyUIService";
import { HillDGXService } from "./HillDGXService";
import { ImageHostingService } from "./ImageHostingService";
import { assetDatabaseService } from "./AssetDatabaseService";
import {
  getGenerationPrompts,
  getGPT5EnhancementPrompts,
} from "../utils/promptLoader";
import type { Static } from "elysia";
import { MaterialPreset } from "../models";
import fs from "fs/promises";
import path from "path";

import fetch from "node-fetch";

// ==================== Type Definitions ====================

type MaterialPresetType = Static<typeof MaterialPreset>;

interface ReferenceImage {
  url?: string;
  dataUrl?: string;
}

interface RiggingOptions {
  heightMeters?: number;
}

interface CustomPrompts {
  gameStyle?: string;
}

interface AssetMetadata {
  characterHeight?: number;
}

interface PipelineConfig {
  description: string;
  assetId: string;
  name: string;
  type: string;
  subtype: string;
  generationType?: string;
  style?: string;
  quality?: string;
  enableRigging?: boolean;
  enableRetexturing?: boolean;
  enableSprites?: boolean;
  materialPresets?: MaterialPresetType[];
  referenceImage?: ReferenceImage;
  riggingOptions?: RiggingOptions;
  customPrompts?: CustomPrompts;
  metadata?: AssetMetadata & {
    useGPT5Enhancement?: boolean;
  };
  user?: UserContextType;
}

interface TextInputResult {
  description: string;
}

interface PromptOptimizationResult {
  originalPrompt: string;
  optimizedPrompt: string;
  enhancedDescription?: string;
}

interface GPT5ChatResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

type StageResultData = Record<string, unknown>;

interface StageResult {
  status: "pending" | "processing" | "completed" | "failed" | "skipped";
  progress: number;
  result?: StageResultData;
  error?: string;
}

interface FinalAssetVariant {
  id: string;
  modelUrl: string;
  materialPreset?: MaterialPresetType;
}

interface FinalAsset {
  id: string;
  name: string;
  modelUrl: string;
  conceptArtUrl: string;
  variants: FinalAssetVariant[];
}

interface PipelineResults {
  [key: string]: Record<string, unknown> | undefined;
}

interface Pipeline {
  id: string;
  config: PipelineConfig;
  status: "initializing" | "processing" | "completed" | "failed";
  progress: number;
  stages: {
    textInput: StageResult;
    promptOptimization: StageResult;
    imageGeneration: StageResult;
    image3D: StageResult & {
      normalized?: boolean;
      dimensions?: {
        width: number;
        height: number;
        depth: number;
      };
    };
    textureGeneration: StageResult;
    rigging?: StageResult;
    spriteGeneration?: StageResult;
  };
  results: PipelineResults;
  error?: string;
  createdAt: string;
  completedAt?: string;
  finalAsset?: FinalAsset;
}

interface StartPipelineResponse {
  pipelineId: string;
  status: string;
  message: string;
}

interface PipelineStatusResponse {
  id: string;
  status: string;
  progress: number;
  stages: Pipeline["stages"];
  results: PipelineResults;
  error?: string;
  createdAt: string;
  completedAt?: string;
}

interface PromptEnhancementResult {
  originalPrompt: string;
  optimizedPrompt: string;
  model?: string;
  keywords?: string[];
  error?: string;
}

interface MeshyResult {
  status: string;
  progress?: number;
  error?: string;
  model_urls: {
    glb: string;
  };
  polycount?: number;
}

interface RetextureResult {
  status: string;
  model_urls: {
    glb: string;
  };
}

interface RiggingResult {
  status: string;
  progress?: number;
  task_error?: {
    message: string;
  };
  result?: {
    basic_animations?: {
      walking_glb_url?: string;
      running_glb_url?: string;
    };
  };
}

interface ImageGenerationResult {
  imageUrl: string;
  prompt: string;
  metadata: {
    model: string;
    resolution: string;
    quality: string;
    timestamp: string;
  };
}

interface VariantResult {
  id: string;
  name: string;
  modelUrl?: string;
  success: boolean;
  error?: string;
}

interface HillApiResponse<T> {
  success?: boolean;
  data?: T;
  error?: string;
}

interface HillConjureResult {
  glb?: string;
  ref_image?: string;
  lod_dir?: string | null;
  pipeline_type?: string;
  quality?: string;
  textureSize?: number;
  reviewStatus?: string;
  reviewNote?: string | null;
  meshMetrics?: Record<string, unknown>;
  wall_s?: number;
  elapsed_s?: number;
}

interface HillConjureJob {
  id: string;
  status: "queued" | "running" | "completed" | "failed";
  prompt?: string;
  name?: string;
  mode?: string;
  quality?: string;
  exportTarget?: string;
  error?: string;
  assetId?: string;
  assetName?: string;
  result?: HillConjureResult;
}

// ==================== Service Class ====================

export class GenerationService extends EventEmitter {
  private activePipelines: Map<string, Pipeline>;
  private aiService: AICreationService;
  private comfyService: ComfyUIService;
  private hillDGXService: HillDGXService;
  private imageHostingService: ImageHostingService;

  constructor() {
    super();

    this.activePipelines = new Map();

    // Check for required API keys
    if (
      (!process.env.AI_GATEWAY_API_KEY && !process.env.OPENAI_API_KEY) ||
      !process.env.MESHY_API_KEY
    ) {
      console.warn(
        "[GenerationService] Missing API keys - generation features will be limited",
      );
    }

    // Initialize AI service with backend environment variables
    this.aiService = new AICreationService({
      openai: {
        apiKey: process.env.OPENAI_API_KEY || "",
        model: "gpt-image-1",
        imageServerBaseUrl:
          process.env.IMAGE_SERVER_URL || "http://localhost:8080",
      },
      meshy: {
        apiKey: process.env.MESHY_API_KEY || "",
        baseUrl: "https://api.meshy.ai",
      },
    });

    this.comfyService = new ComfyUIService();
    this.hillDGXService = new HillDGXService();

    // Initialize image hosting service
    this.imageHostingService = new ImageHostingService();
  }

  /**
   * Start a new generation pipeline
   */
  async startPipeline(config: PipelineConfig): Promise<StartPipelineResponse> {
    const pipelineId = `pipeline-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const pipeline: Pipeline = {
      id: pipelineId,
      config,
      status: "initializing",
      progress: 0,
      stages: {
        textInput: {
          status: "completed",
          progress: 100,
          result: { description: config.description },
        },
        promptOptimization: { status: "pending", progress: 0 },
        imageGeneration: { status: "pending", progress: 0 },
        image3D: { status: "pending", progress: 0 },
        textureGeneration: { status: "pending", progress: 0 },
        ...(config.generationType === "avatar" && config.enableRigging
          ? { rigging: { status: "pending", progress: 0 } }
          : {}),
        ...(config.enableSprites
          ? { spriteGeneration: { status: "pending", progress: 0 } }
          : {}),
      },
      results: {},
      createdAt: new Date().toISOString(),
    };

    this.activePipelines.set(pipelineId, pipeline);

    // Start processing asynchronously
    this.processPipeline(pipelineId).catch((error) => {
      console.error(`Pipeline ${pipelineId} failed:`, error);
      pipeline.status = "failed";
      pipeline.error = error.message;
    });

    return {
      pipelineId,
      status: pipeline.status,
      message: "Pipeline started successfully",
    };
  }

  /**
   * Get pipeline status
   */
  async getPipelineStatus(pipelineId: string): Promise<PipelineStatusResponse> {
    const pipeline = this.activePipelines.get(pipelineId);

    if (!pipeline) {
      throw new Error(`Pipeline ${pipelineId} not found`);
    }

    return {
      id: pipeline.id,
      status: pipeline.status,
      progress: pipeline.progress,
      stages: pipeline.stages,
      results: pipeline.results,
      error: pipeline.error,
      createdAt: pipeline.createdAt,
      completedAt: pipeline.completedAt,
    };
  }

  /**
   * Process a pipeline through all stages
   */
  private async processPipeline(pipelineId: string): Promise<void> {
    const pipeline = this.activePipelines.get(pipelineId);
    if (!pipeline) return;

    try {
      pipeline.status = "processing";
      let enhancedPrompt = pipeline.config.description;
      let imageUrl: string | null = null;
      let meshyTaskId: string | null = null;
      let baseModelPath: string | null = null;
      const useHillDgx = this.shouldUseHillDgxProvider(pipeline.config);

      // Stage 1: GPT-5 Prompt Enhancement (honor toggle; skip if explicitly disabled)
      if (pipeline.config.metadata?.useGPT5Enhancement !== false) {
        pipeline.stages.promptOptimization.status = "processing";

        try {
          const optimizationResult = await this.enhancePromptWithGPT5(
            pipeline.config,
          );
          enhancedPrompt = optimizationResult.optimizedPrompt;

          pipeline.stages.promptOptimization.status = "completed";
          pipeline.stages.promptOptimization.progress = 100;
          pipeline.stages.promptOptimization.result = { ...optimizationResult };
          pipeline.results.promptOptimization = { ...optimizationResult };
        } catch (error) {
          console.warn(
            "GPT-5 enhancement failed, using original prompt:",
            error,
          );
          pipeline.stages.promptOptimization.status = "completed";
          pipeline.stages.promptOptimization.progress = 100;
          pipeline.stages.promptOptimization.result = {
            originalPrompt: pipeline.config.description,
            optimizedPrompt: pipeline.config.description,
            error: (error as Error).message,
          };
        }

        pipeline.progress = 10;
      } else {
        pipeline.stages.promptOptimization.status = "skipped";
      }

      if (useHillDgx) {
        await this.processHillDgxPipeline(pipeline, enhancedPrompt);
        return;
      }

      // Stage 2: Image Source (User-provided or AI-generated)
      const hasUserRef = !!(
        pipeline.config.referenceImage &&
        (pipeline.config.referenceImage.url ||
          pipeline.config.referenceImage.dataUrl)
      );
      console.log("[Pipeline Debug] Reference image check:", {
        hasReferenceImage: !!pipeline.config.referenceImage,
        hasUrl: !!pipeline.config.referenceImage?.url,
        hasDataUrl: !!pipeline.config.referenceImage?.dataUrl,
        hasUserRef,
        referenceImage: pipeline.config.referenceImage,
      });
      if (hasUserRef) {
        // Use user-provided reference image; skip auto image generation
        imageUrl =
          pipeline.config.referenceImage!.dataUrl ||
          pipeline.config.referenceImage!.url!;
        pipeline.stages.imageGeneration.status = "skipped";
        pipeline.stages.imageGeneration.progress = 0;
        pipeline.stages.imageGeneration.result = { source: "user-provided" };
        pipeline.results.imageGeneration =
          pipeline.stages.imageGeneration.result;
        pipeline.progress = 20;
      } else {
        pipeline.stages.imageGeneration.status = "processing";

        try {
          // Load generation prompts
          const generationPrompts = await getGenerationPrompts();

          // For avatars, ensure T-pose is in the prompt
          // For armor, ensure it's standalone with hollow openings
          // Build effective style text from custom prompts when available
          // Also, if HQ cues are present, sanitize prompt from low-poly cues and add HQ details
          const effectiveStyle =
            pipeline.config.customPrompts &&
            pipeline.config.customPrompts.gameStyle
              ? pipeline.config.customPrompts.gameStyle
              : pipeline.config.style || "game-ready";

          const wantsHQPrompt =
            /\b(4k|ultra|high\s*quality|realistic|cinematic|photoreal|pbr)\b/i.test(
              effectiveStyle,
            );
          let imagePrompt = enhancedPrompt;
          if (wantsHQPrompt) {
            imagePrompt = imagePrompt
              .replace(
                /\b(low-?poly|stylized|minimalist|blocky|simplified)\b/gi,
                "",
              )
              .trim();
            imagePrompt = `${imagePrompt} highly detailed, realistic, sharp features, high-resolution textures`;
          }
          if (
            pipeline.config.generationType === "avatar" ||
            pipeline.config.type === "character"
          ) {
            const tposePrompt =
              generationPrompts?.posePrompts?.avatar?.tpose ||
              "standing in T-pose with arms stretched out horizontally";
            imagePrompt = `${enhancedPrompt} ${tposePrompt}`;
          } else if (pipeline.config.type === "armor") {
            const isChest =
              pipeline.config.subtype?.toLowerCase().includes("chest") ||
              pipeline.config.subtype?.toLowerCase().includes("body");
            if (isChest) {
              const chestPrompt =
                generationPrompts?.posePrompts?.armor?.chest ||
                'floating chest armor SHAPED FOR T-POSE BODY - shoulder openings must point STRAIGHT OUT SIDEWAYS at 90 degrees like a scarecrow (NOT angled down), wide "T" shape when viewed from front, ends at shoulders with no arm extensions, torso-only armor piece, hollow shoulder openings pointing horizontally, no armor stand';
              imagePrompt = `${enhancedPrompt} ${chestPrompt}`;
            } else {
              const genericArmorPrompt =
                generationPrompts?.posePrompts?.armor?.generic ||
                "floating armor piece shaped for T-pose body fitting, openings positioned at correct angles for T-pose (horizontal for shoulders), hollow openings, no armor stand or mannequin";
              imagePrompt = `${enhancedPrompt} ${genericArmorPrompt}`;
            }
          }

          const imageResult = this.shouldUseComfyImage()
            ? await this.generateImageWithComfy(imagePrompt)
            : await this.aiService
                .getImageService()
                .generateImage(imagePrompt, pipeline.config.type, effectiveStyle);

          imageUrl = imageResult.imageUrl;

          pipeline.stages.imageGeneration.status = "completed";
          pipeline.stages.imageGeneration.progress = 100;
          pipeline.stages.imageGeneration.result = { ...imageResult };
          pipeline.results.imageGeneration = { ...imageResult };
          pipeline.progress = 25;
        } catch (error) {
          console.error("Image generation failed:", error);
          pipeline.stages.imageGeneration.status = "failed";
          pipeline.stages.imageGeneration.error = (error as Error).message;
          throw error;
        }
      }

      // Stage 3: Image to 3D with Meshy AI
      pipeline.stages.image3D.status = "processing";

      try {
        // Save image to disk first if it's a data URL
        let imageUrlForMeshy = imageUrl!;
        if (imageUrl!.startsWith("data:")) {
          const imageData = imageUrl!.split(",")[1];
          const imageBuffer = Buffer.from(imageData, "base64");
          const imagePath = path.join(
            "temp-images",
            `${pipeline.config.assetId}-concept.png`,
          );
          await fs.mkdir("temp-images", { recursive: true });
          await fs.writeFile(imagePath, imageBuffer);

          // If we have an image server, use it
          if (process.env.IMAGE_SERVER_URL) {
            imageUrlForMeshy = `${process.env.IMAGE_SERVER_URL}/temp-images/${path.basename(imagePath)}`;
          } else {
            // Need to upload to a public URL for Meshy
            console.warn(
              "No IMAGE_SERVER_URL configured, Meshy needs a public URL",
            );
          }
        }

        let modelBuffer: Buffer;
        let modelUrl = "";
        let modelPolycount: number | undefined;

        if (this.shouldUseComfy3D()) {
          const imagePath = await this.writeImageToTempFile(
            imageUrl!,
            pipeline.config.assetId,
          );
          const comfyResult = await this.comfyService.generateModelFromImage(
            imagePath,
            enhancedPrompt,
          );
          meshyTaskId = `comfy:${comfyResult.promptId}`;
          modelBuffer = comfyResult.buffer;
          modelUrl = comfyResult.url;
          pipeline.stages.image3D.progress = 100;
        } else {
          // Ensure we have a publicly accessible URL for Meshy
          console.log("📸 Initial image URL:", imageUrlForMeshy);

          // Meshy can't access localhost, 127.0.0.1, or data URIs - rehost if needed
          if (
            imageUrlForMeshy.startsWith("data:") ||
            imageUrlForMeshy.includes("localhost") ||
            imageUrlForMeshy.includes("127.0.0.1")
          ) {
            console.warn(
              "⚠️ Non-public image reference detected - uploading to public hosting...",
            );

            // Use the image hosting service to get a public URL
            try {
              imageUrlForMeshy = await this.imageHostingService.uploadImage(
                imageUrl!,
              );
              console.log("✅ Image uploaded to public URL:", imageUrlForMeshy);
            } catch (uploadError) {
              console.error(
                "❌ Failed to upload image:",
                (uploadError as Error).message,
              );
              console.log(ImageHostingService.getSetupInstructions());
              throw new Error(
                "Cannot make image publicly accessible. See instructions above.",
              );
            }
          }

          // Determine quality settings based on explicit config, style cues, and avatar type
          const styleText =
            (pipeline.config.customPrompts &&
              pipeline.config.customPrompts.gameStyle) ||
            "";
          const wantsHighQuality =
            /\b(4k|ultra|high\s*quality|realistic|cinematic|marvel|skyrim)\b/i.test(
              styleText,
            );
          const isAvatar =
            pipeline.config.generationType === "avatar" ||
            pipeline.config.type === "character";

          const quality =
            pipeline.config.quality ||
            (wantsHighQuality || isAvatar ? "ultra" : "standard");
          const targetPolycount =
            quality === "ultra" ? 20000 : quality === "high" ? 12000 : 6000;
          const textureResolution =
            quality === "ultra" ? 4096 : quality === "high" ? 2048 : 1024;
          const enablePbr = quality !== "standard";

          // Allow per-quality model selection via env, with a sensible default
          const qualityUpper = quality.toUpperCase();
          const aiModelEnv =
            process.env[`MESHY_MODEL_${qualityUpper}`] ||
            process.env.MESHY_MODEL_DEFAULT;
          const aiModel = aiModelEnv || "meshy-5";

          const meshyTaskIdResult = await this.aiService
            .getMeshyService()
            .startImageTo3D(imageUrlForMeshy, {
              enable_pbr: enablePbr,
              ai_model: aiModel,
              topology: "quad",
              targetPolycount: targetPolycount,
              texture_resolution: textureResolution,
            });
          meshyTaskId =
            typeof meshyTaskIdResult === "string"
              ? meshyTaskIdResult
              : meshyTaskIdResult.task_id || meshyTaskIdResult.id || null;

          // Poll for completion
          let meshyResult: MeshyResult | null = null;
          let attempts = 0;
          const pollIntervalMs = parseInt(
            process.env.MESHY_POLL_INTERVAL_MS || "5000",
            10,
          );
          const timeoutMs = parseInt(
            process.env[`MESHY_TIMEOUT_${qualityUpper}_MS`] ||
              process.env.MESHY_TIMEOUT_MS ||
              "300000",
            10,
          );
          const maxAttempts = Math.max(1, Math.ceil(timeoutMs / pollIntervalMs));

          console.log(
            `⏳ Meshy polling configured: quality=${quality}, model=${aiModel}, interval=${pollIntervalMs}ms, timeout=${timeoutMs}ms, maxAttempts=${maxAttempts}`,
          );

          while (attempts < maxAttempts) {
            await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));

            if (!meshyTaskId) {
              throw new Error("Meshy task ID is null");
            }

            const status = await this.aiService
              .getMeshyService()
              .getTaskStatus(meshyTaskId);
            pipeline.stages.image3D.progress =
              status.progress || (attempts / maxAttempts) * 100;

            if (status.status === "SUCCEEDED") {
              meshyResult = status as MeshyResult;
              break;
            } else if (status.status === "FAILED") {
              throw new Error(status.error || "Meshy conversion failed");
            }

            attempts++;
          }

          if (!meshyResult) {
            throw new Error("Meshy conversion timed out");
          }

          modelUrl = meshyResult.model_urls.glb;
          modelPolycount = meshyResult.polycount;
          modelBuffer = await this.downloadFile(modelUrl);
        }

        const outputDir = path.join("gdd-assets", pipeline.config.assetId);
        await fs.mkdir(outputDir, { recursive: true });

        // Save raw model first
        const rawModelPath = path.join(
          outputDir,
          `${pipeline.config.assetId}_raw.glb`,
        );
        await fs.writeFile(rawModelPath, modelBuffer);

        // Normalize the model based on type
        let normalizedModelPath = path.join(
          outputDir,
          `${pipeline.config.assetId}.glb`,
        );

        if (pipeline.config.type === "character") {
          // Normalize character height
          console.log("🔧 Normalizing character model...");
          try {
            const { AssetNormalizationService } =
              await import("../../src/services/processing/AssetNormalizationService.js");
            const normalizer = new AssetNormalizationService();

            const targetHeight =
              pipeline.config.metadata?.characterHeight ||
              pipeline.config.riggingOptions?.heightMeters ||
              1.83;

            const normalized = await normalizer.normalizeCharacter(
              rawModelPath,
              targetHeight,
            );
            await fs.writeFile(
              normalizedModelPath,
              Buffer.from(normalized.glb),
            );

            console.log(`✅ Character normalized to ${targetHeight}m height`);

            // Update with normalized dimensions
            pipeline.stages.image3D.normalized = true;
            pipeline.stages.image3D.dimensions = normalized.metadata.dimensions;
          } catch (error) {
            console.warn(
              "⚠️ Normalization failed, using raw model:",
              (error as Error).message,
            );
            await fs.copyFile(rawModelPath, normalizedModelPath);
          }
        } else if (pipeline.config.type === "weapon") {
          // Normalize weapon with grip at origin
          console.log("🔧 Normalizing weapon model...");
          try {
            const { WeaponHandleDetector } =
              await import("../../src/services/processing/WeaponHandleDetector.js");
            const detector = new WeaponHandleDetector();

            const result = await detector.exportNormalizedWeapon(
              rawModelPath,
              normalizedModelPath,
            );

            console.log(`✅ Weapon normalized with grip at origin`);

            // Update with normalized dimensions
            pipeline.stages.image3D.normalized = true;
            pipeline.stages.image3D.dimensions = {
              width: result.dimensions.width,
              height: result.dimensions.height,
              depth: result.dimensions.length,
            };
          } catch (error) {
            console.warn(
              "⚠️ Weapon normalization failed, using raw model:",
              (error as Error).message,
            );
            await fs.copyFile(rawModelPath, normalizedModelPath);
          }
        } else {
          // For other types, just copy for now
          await fs.copyFile(rawModelPath, normalizedModelPath);
        }

        baseModelPath = normalizedModelPath;

        let hillLibraryAsset: Record<string, unknown> | undefined;
        if (this.shouldExportToHillDGX()) {
          try {
            const normalizedBuffer = await fs.readFile(normalizedModelPath);
            const hillAsset = await this.hillDGXService.publishModel(
              normalizedBuffer,
              {
                assetId: pipeline.config.assetId,
                name: pipeline.config.name || pipeline.config.assetId,
                description: pipeline.config.description,
                type: pipeline.config.type,
                subtype: pipeline.config.subtype,
                prompt: enhancedPrompt,
              },
            );
            hillLibraryAsset = hillAsset as Record<string, unknown>;
            console.log(
              `[GenerationService] Exported ${pipeline.config.assetId} to Hill library`,
              hillAsset.uuid || hillAsset.id || hillAsset.name || "",
            );
          } catch (error) {
            console.error(
              "[GenerationService] Hill DGX library export failed:",
              error,
            );
            throw error;
          }
        }

        // Save concept art
        if (imageUrl!.startsWith("data:")) {
          const imageData = imageUrl!.split(",")[1];
          const imageBuffer = Buffer.from(imageData, "base64");
          await fs.writeFile(
            path.join(outputDir, "concept-art.png"),
            imageBuffer,
          );
        }

        // Save metadata - EXACT structure from arrows-base reference
        const metadata = {
          id: pipeline.config.assetId,
          name: pipeline.config.assetId,
          gameId: pipeline.config.assetId,
          type: pipeline.config.type,
          subtype: pipeline.config.subtype,
          description: pipeline.config.description,
          detailedPrompt: enhancedPrompt,
          generatedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          isBaseModel: true,
          materialVariants: pipeline.config.materialPresets
            ? pipeline.config.materialPresets.map((preset) => preset.id)
            : [],
          isPlaceholder: false,
          hasModel: true,
          hasConceptArt: true,
          modelPath: baseModelPath,
          conceptArtUrl: "./concept-art.png",
          gddCompliant: true,
          workflow: this.shouldUseComfy3D()
            ? "GPT-5 → ComfyUI Flux/Klein → ComfyUI Trellis (Base Model)"
            : this.shouldExportToHillDGX()
              ? "GPT-5 → GPT-Image-1 → Meshy Image-to-3D → Hill DGX Library (Base Model)"
              : "GPT-5 → GPT-Image-1 → Meshy Image-to-3D (Base Model)",
          meshyTaskId: meshyTaskId,
          meshyStatus: "completed",
          hillDGXAssetId:
            (hillLibraryAsset?.uuid as string | undefined) ||
            (hillLibraryAsset?.id as string | undefined),
          hillDGXSourcePath: hillLibraryAsset?.sourcePath as string | undefined,
          variants: [], // Will be populated as variants are generated
          variantCount: 0,
          lastVariantGenerated: null,
          updatedAt: new Date().toISOString(),
          // Normalization info
          normalized: pipeline.stages.image3D.normalized || false,
          normalizationDate: pipeline.stages.image3D.normalized
            ? new Date().toISOString()
            : undefined,
          dimensions: pipeline.stages.image3D.dimensions || undefined,
          // Ownership tracking (Phase 1)
          createdBy: pipeline.config.user?.privyId || null,
          walletAddress: pipeline.config.user?.walletAddress || null,
          isPublic: true, // Default to public for Phase 1
        };

        await fs.writeFile(
          path.join(outputDir, "metadata.json"),
          JSON.stringify(metadata, null, 2),
        );

        // Create database record for the asset
        if (pipeline.config.user?.privyId) {
          try {
            await assetDatabaseService.createAssetRecord(
              pipeline.config.assetId,
              metadata as AssetMetadataType,
              pipeline.config.user.privyId,
              `${pipeline.config.assetId}/${pipeline.config.assetId}.glb`,
            );
          } catch (error) {
            console.error(
              "[GenerationService] Failed to create database record for asset:",
              error,
            );
            // Continue - don't fail pipeline if DB creation fails
          }
        }

        pipeline.stages.image3D.status = "completed";
        pipeline.stages.image3D.progress = 100;
        pipeline.stages.image3D.result = {
          taskId: meshyTaskId,
          modelUrl,
          polycount: modelPolycount,
          localPath: baseModelPath,
          hillDGX: hillLibraryAsset,
        };
        pipeline.results.image3D = pipeline.stages.image3D.result;
        pipeline.progress = 50;
      } catch (error) {
        console.error("Image to 3D conversion failed:", error);
        pipeline.stages.image3D.status = "failed";
        pipeline.stages.image3D.error = (error as Error).message;
        throw error;
      }

      // Stage 4: Material Variant Generation (Retexturing)
      if (
        pipeline.config.enableRetexturing &&
        pipeline.config.materialPresets?.length! > 0
      ) {
        pipeline.stages.textureGeneration.status = "processing";

        const variants: VariantResult[] = [];
        const totalVariants = pipeline.config.materialPresets!.length;

        for (let i = 0; i < totalVariants; i++) {
          const preset = pipeline.config.materialPresets![i];

          try {
            console.log(
              `🎨 Generating variant ${i + 1}/${totalVariants}: ${preset.displayName}`,
            );

            // Update progress
            pipeline.stages.textureGeneration.progress = Math.round(
              (i / totalVariants) * 100,
            );

            // Use Meshy retexture API
            const retextureTaskIdResult = await this.aiService
              .getMeshyService()
              .startRetextureTask(
                { inputTaskId: meshyTaskId! },
                { textStylePrompt: preset.stylePrompt },
                {
                  artStyle: "realistic",
                  aiModel: "meshy-5",
                  enableOriginalUV: true,
                },
              );
            const retextureTaskId =
              typeof retextureTaskIdResult === "string"
                ? retextureTaskIdResult
                : retextureTaskIdResult.task_id ||
                  retextureTaskIdResult.id ||
                  "";

            // Wait for completion
            let retextureResult: RetextureResult | null = null;
            let retextureAttempts = 0;
            const maxRetextureAttempts = 60;

            while (retextureAttempts < maxRetextureAttempts) {
              await new Promise((resolve) => setTimeout(resolve, 5000));

              const status = await this.aiService
                .getMeshyService()
                .getRetextureTaskStatus(retextureTaskId);

              if (status.status === "SUCCEEDED") {
                retextureResult = status as RetextureResult;
                break;
              } else if (status.status === "FAILED") {
                throw new Error(status.error || "Retexture failed");
              }

              retextureAttempts++;
            }

            if (!retextureResult) {
              throw new Error("Retexture timed out");
            }

            // Save variant
            const variantId = `${pipeline.config.assetId}-${preset.id}`;
            const variantDir = path.join("gdd-assets", variantId);
            await fs.mkdir(variantDir, { recursive: true });

            const variantBuffer = await this.downloadFile(
              retextureResult.model_urls.glb,
            );
            await fs.writeFile(
              path.join(variantDir, `${variantId}.glb`),
              variantBuffer,
            );

            // Copy concept art
            const conceptArtPath = path.join(
              "gdd-assets",
              pipeline.config.assetId,
              "concept-art.png",
            );
            if (
              await fs
                .access(conceptArtPath)
                .then(() => true)
                .catch(() => false)
            ) {
              await fs.copyFile(
                conceptArtPath,
                path.join(variantDir, "concept-art.png"),
              );
            }

            // Save variant metadata - EXACT structure from arrows-bronze reference
            const variantMetadata = {
              id: variantId,
              gameId: variantId,
              name: variantId,
              type: pipeline.config.type,
              subtype: pipeline.config.subtype,
              isBaseModel: false,
              isVariant: true,
              parentBaseModel: pipeline.config.assetId,
              materialPreset: {
                id: preset.id,
                displayName: preset.displayName,
                category: preset.category,
                tier: preset.tier,
                color: preset.color,
                stylePrompt: preset.stylePrompt,
              },
              workflow: "Meshy AI Retexture",
              baseModelTaskId: meshyTaskId,
              retextureTaskId: retextureTaskId,
              retextureStatus: "completed",
              modelPath: `${variantId}.glb`,
              conceptArtPath: null,
              hasModel: true,
              hasConceptArt: true,
              generatedAt: new Date().toISOString(),
              completedAt: new Date().toISOString(),
              description: pipeline.config.description,
              isPlaceholder: false,
              gddCompliant: true,
              // Ownership tracking (Phase 1) - inherit from parent
              createdBy: pipeline.config.user?.privyId || null,
              walletAddress: pipeline.config.user?.walletAddress || null,
              isPublic: true, // Default to public for Phase 1
            };

            await fs.writeFile(
              path.join(variantDir, "metadata.json"),
              JSON.stringify(variantMetadata, null, 2),
            );

            variants.push({
              id: variantId,
              name: preset.displayName,
              modelUrl: retextureResult.model_urls.glb,
              success: true,
            });
          } catch (error) {
            console.error(
              `Failed to generate variant ${preset.displayName}:`,
              error,
            );
            variants.push({
              id: `${pipeline.config.assetId}-${preset.id}`,
              name: preset.displayName,
              success: false,
              error: (error as Error).message,
            });
          }
        }

        pipeline.stages.textureGeneration.status = "completed";
        pipeline.stages.textureGeneration.progress = 100;
        pipeline.stages.textureGeneration.result = { variants, totalVariants };
        pipeline.results.textureGeneration =
          pipeline.stages.textureGeneration.result;
        pipeline.progress = 75;

        // Update base model metadata with variant information
        const successfulVariants = variants.filter((v) => v.success);
        if (successfulVariants.length > 0) {
          const baseMetadataPath = path.join(
            "gdd-assets",
            pipeline.config.assetId,
            "metadata.json",
          );
          const baseMetadata = JSON.parse(
            await fs.readFile(baseMetadataPath, "utf-8"),
          );

          baseMetadata.variants = successfulVariants.map((v) => v.id);
          baseMetadata.variantCount = successfulVariants.length;
          baseMetadata.lastVariantGenerated =
            successfulVariants[successfulVariants.length - 1].id;
          baseMetadata.updatedAt = new Date().toISOString();

          await fs.writeFile(
            baseMetadataPath,
            JSON.stringify(baseMetadata, null, 2),
          );
        }
      } else {
        pipeline.stages.textureGeneration.status = "skipped";
      }

      // Stage 5: Auto-Rigging (for avatars only)
      if (
        pipeline.config.generationType === "avatar" &&
        pipeline.config.enableRigging &&
        meshyTaskId
      ) {
        pipeline.stages.rigging = { status: "processing", progress: 0 };

        try {
          console.log("🦴 Starting auto-rigging for avatar...");

          // Start rigging task
          const riggingTaskIdResult = await this.aiService
            .getMeshyService()
            .startRiggingTask(
              { inputTaskId: meshyTaskId },
              {
                heightMeters:
                  pipeline.config.riggingOptions?.heightMeters || 1.7,
              },
            );
          const riggingTaskId =
            typeof riggingTaskIdResult === "string"
              ? riggingTaskIdResult
              : riggingTaskIdResult.task_id || riggingTaskIdResult.id || "";

          console.log(`Rigging task started: ${riggingTaskId}`);

          // Poll for rigging completion
          let riggingResult: RiggingResult | null = null;
          let riggingAttempts = 0;
          const maxRiggingAttempts = 60; // 5 minutes

          while (riggingAttempts < maxRiggingAttempts) {
            await new Promise((resolve) => setTimeout(resolve, 5000));

            const status = await this.aiService
              .getMeshyService()
              .getRiggingTaskStatus(riggingTaskId);
            pipeline.stages.rigging!.progress =
              status.progress || (riggingAttempts / maxRiggingAttempts) * 100;

            if (status.status === "SUCCEEDED") {
              riggingResult = status as RiggingResult;
              break;
            } else if (status.status === "FAILED") {
              throw new Error(status.error || "Rigging failed");
            }

            riggingAttempts++;
          }

          if (!riggingResult) {
            throw new Error("Rigging timed out");
          }

          // Download rigged model and animations
          const outputDir = path.join("gdd-assets", pipeline.config.assetId);
          const riggedAssets: Record<string, string> = {};

          // IMPORTANT: For rigged avatars, we DON'T replace the main model
          // We keep the original T-pose model and save animations separately
          // This prevents the T-pose + animation layering issue
          console.log("🦴 Processing rigged character assets...");

          // Download animations if available
          if (riggingResult.result && riggingResult.result.basic_animations) {
            const animations = riggingResult.result.basic_animations;

            // CRITICAL: First, get the rigged model from the walking animation
            // This contains the model with bones that we need for animations
            if (animations.walking_glb_url) {
              console.log("🦴 Downloading rigged model and animations...");
              const walkingBuffer = await this.downloadFile(
                animations.walking_glb_url,
              );

              // Save the walking animation
              const walkingPath = path.join(
                outputDir,
                "animations",
                "walking.glb",
              );
              await fs.mkdir(path.dirname(walkingPath), { recursive: true });
              await fs.writeFile(walkingPath, walkingBuffer);
              riggedAssets.walking = "animations/walking.glb";

              // Extract T-pose from the walking animation
              console.log("🎯 Extracting T-pose from walking animation...");
              try {
                const tposePath = path.join(outputDir, "t-pose.glb");
                await this.extractTPoseFromAnimation(walkingPath, tposePath);
                riggedAssets.tpose = "t-pose.glb";
                console.log("✅ T-pose extracted successfully");
              } catch (tposeError) {
                console.error(
                  "⚠️ Failed to extract T-pose:",
                  (tposeError as Error).message,
                );
                // Continue anyway - not critical for the pipeline
              }

              // IMPORTANT: Save rigged T-pose model for animation player
              // The walking GLB contains a rigged model in T-pose on frame 0, followed by walking animation
              // The animation player will:
              // - Use the unrigged model for asset viewer (clean T-pose, no bones)
              // - Use this rigged model for animation player with:
              //   - Resting: Show frame 0 (T-pose) with no animation
              //   - Walking: Play the walking animation
              //   - Running: Play the running animation
              const riggedModelPath = path.join(
                outputDir,
                `${pipeline.config.assetId}_rigged.glb`,
              );
              await fs.writeFile(riggedModelPath, walkingBuffer);
              console.log("✅ Saved rigged model for animation player");
            }

            // Download running animation GLB
            if (animations.running_glb_url) {
              const runningBuffer = await this.downloadFile(
                animations.running_glb_url,
              );
              const runningPath = path.join(
                outputDir,
                "animations",
                "running.glb",
              );
              await fs.writeFile(runningPath, runningBuffer);
              riggedAssets.running = "animations/running.glb";
            }
          }

          // Update metadata with rigging information
          const metadataPath = path.join(outputDir, "metadata.json");
          const metadata = JSON.parse(await fs.readFile(metadataPath, "utf-8"));

          metadata.isRigged = true;
          metadata.riggingTaskId = riggingTaskId;
          metadata.riggingStatus = "completed";
          metadata.rigType = "humanoid-standard";
          metadata.characterHeight =
            pipeline.config.riggingOptions?.heightMeters || 1.7;
          metadata.animations = {
            basic: riggedAssets,
          };
          metadata.riggedModelPath = `${pipeline.config.assetId}_rigged.glb`;
          metadata.tposeModelPath = riggedAssets.tpose || null;
          metadata.supportsAnimation = true;
          metadata.animationCompatibility = ["mixamo", "unity", "unreal"];

          await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

          pipeline.stages.rigging!.status = "completed";
          pipeline.stages.rigging!.progress = 100;
          pipeline.stages.rigging!.result = {
            taskId: riggingTaskId,
            animations: riggedAssets,
          };
          pipeline.results.rigging = pipeline.stages.rigging!.result;
          pipeline.progress = 85;
        } catch (error) {
          console.error("❌ Rigging failed:", (error as Error).message);
          console.error("Full error:", error);

          // Update metadata to indicate rigging failed
          try {
            const outputDir = path.join("gdd-assets", pipeline.config.assetId);
            const metadataPath = path.join(outputDir, "metadata.json");
            const metadata = JSON.parse(
              await fs.readFile(metadataPath, "utf-8"),
            );

            metadata.isRigged = false;
            metadata.riggingStatus = "failed";
            metadata.riggingError = (error as Error).message;
            metadata.riggingAttempted = true;

            await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
          } catch (metadataError) {
            console.error(
              "Failed to update metadata after rigging failure:",
              metadataError,
            );
          }

          pipeline.stages.rigging!.status = "failed";
          pipeline.stages.rigging!.error = (error as Error).message;
          pipeline.stages.rigging!.progress = 0;

          // Continue without rigging - don't fail the entire pipeline
          console.log(
            "⚠️  Continuing without rigging - avatar will not have animations",
          );
        }
      }

      // Complete
      pipeline.status = "completed";
      pipeline.completedAt = new Date().toISOString();
      pipeline.progress = 100;

      // Compile final asset info
      pipeline.finalAsset = {
        id: pipeline.config.assetId,
        name: pipeline.config.name,
        modelUrl: `/assets/${pipeline.config.assetId}/${pipeline.config.assetId}.glb`,
        conceptArtUrl: `/assets/${pipeline.config.assetId}/concept-art.png`,
        variants:
          ((pipeline.results.textureGeneration as Record<string, unknown>)
            ?.variants as FinalAssetVariant[]) || [],
      };
    } catch (error) {
      pipeline.status = "failed";
      pipeline.error = (error as Error).message;
      throw error;
    }
  }

  /**
   * Enhance prompt with GPT-5, Nemotron, or another OpenAI-compatible model.
   */
  private async enhancePromptWithGPT5(
    config: PipelineConfig,
  ): Promise<PromptEnhancementResult> {
    const enhancementProvider = (
      process.env.PROMPT_ENHANCEMENT_PROVIDER ||
      process.env.ASSET_FORGE_PROMPT_PROVIDER ||
      ""
    ).toLowerCase();
    const useNemotron =
      enhancementProvider === "nemotron" ||
      enhancementProvider === "local" ||
      !!process.env.NEMOTRON_API_BASE_URL;
    const useAIGateway = !useNemotron && !!process.env.AI_GATEWAY_API_KEY;
    const useDirectOpenAI =
      !useNemotron && !useAIGateway && !!process.env.OPENAI_API_KEY;

    if (!useNemotron && !useAIGateway && !useDirectOpenAI) {
      throw new Error(
        "NEMOTRON_API_BASE_URL, AI_GATEWAY_API_KEY, or OPENAI_API_KEY required for prompt enhancement",
      );
    }

    // Load GPT-5 enhancement prompts
    const gpt5Prompts = await getGPT5EnhancementPrompts();

    const isAvatar =
      config.generationType === "avatar" || config.type === "character";
    const isArmor = config.type === "armor";
    const isChestArmor =
      isArmor &&
      (config.subtype?.toLowerCase().includes("chest") ||
        config.subtype?.toLowerCase().includes("body"));

    // Build system prompt from loaded prompts
    let systemPrompt =
      gpt5Prompts?.systemPrompt?.base ||
      `You are an expert at optimizing prompts for 3D asset generation.
Your task is to enhance the user's description to create better results with image generation and 3D conversion.`;

    if (isAvatar) {
      systemPrompt +=
        "\n" +
        (gpt5Prompts?.typeSpecific?.avatar?.critical ||
          `CRITICAL for characters: The character MUST be in a T-pose (arms stretched out horizontally, legs slightly apart) for proper rigging. The character must have EMPTY HANDS - no weapons, tools, or held items. Always add "standing in T-pose with empty hands" to the description.`);
    }

    if (isArmor) {
      systemPrompt +=
        "\n" +
        (gpt5Prompts?.typeSpecific?.armor?.base ||
          `CRITICAL for armor pieces: The armor must be shown ALONE without any armor stand, mannequin, or body inside.`);
      if (isChestArmor) {
        systemPrompt +=
          " " +
          (gpt5Prompts?.typeSpecific?.armor?.chest ||
            "EXTRA IMPORTANT for chest/body armor: This MUST be shaped for a SCARECROW POSE (T-POSE) - imagine a scarecrow with arms sticking STRAIGHT OUT SIDEWAYS...");
      }
      systemPrompt +=
        " " +
        (gpt5Prompts?.typeSpecific?.armor?.positioning ||
          "The armor MUST be positioned and SHAPED for a SCARECROW/T-POSE body...");
    }

    // Add focus points
    const focusPoints = gpt5Prompts?.systemPrompt?.focusPoints || [
      "Clear, specific visual details",
      "Material and texture descriptions",
      "Geometric shape and form",
      `Style consistency (especially for ${config.style || "low-poly RuneScape"} style)`,
    ];

    systemPrompt +=
      "\nFocus on:\n" +
      focusPoints
        .map(
          (point) =>
            "- " +
            point.replace(
              "${config.style || 'low-poly RuneScape'}",
              config.style || "low-poly RuneScape",
            ),
        )
        .join("\n");

    if (isAvatar) {
      systemPrompt +=
        "\n" +
        (gpt5Prompts?.typeSpecific?.avatar?.focus ||
          "- T-pose stance with empty hands for rigging compatibility");
    }

    if (isArmor) {
      const armorFocus = gpt5Prompts?.typeSpecific?.armor?.focus || [
        "- Armor SHAPED for T-pose body (shoulder openings pointing straight sideways, not down)",
        '- Chest armor should form a "T" or cross shape when viewed from above',
        "- Shoulder openings at 180° angle to each other (straight line across)",
      ];
      systemPrompt += "\n" + armorFocus.join("\n");
    }

    systemPrompt +=
      "\n" +
      (gpt5Prompts?.systemPrompt?.closingInstruction ||
        "Keep the enhanced prompt concise but detailed.");

    // Include custom game style text (if present) ahead of the description for better style adherence
    const stylePrefix = config.customPrompts?.gameStyle
      ? `${config.customPrompts.gameStyle} — `
      : "";
    const baseDescription = `${stylePrefix}${config.description}`;
    const userPrompt = isArmor
      ? (gpt5Prompts?.typeSpecific?.armor?.enhancementPrefix ||
          `Enhance this armor piece description for 3D generation. CRITICAL: The armor must be SHAPED FOR A T-POSE BODY - shoulder openings must point STRAIGHT SIDEWAYS at 90 degrees (like a scarecrow), NOT angled downward! Should look like a wide "T" shape. Ends at shoulders (no arm extensions), hollow openings, no armor stand: `) +
        `"${baseDescription}"`
      : `Enhance this ${config.type} asset description for 3D generation: "${baseDescription}"`;

    try {
      const nemotronBaseUrl = (
        process.env.NEMOTRON_API_BASE_URL || ""
      ).replace(/\/+$/, "");
      const endpoint = useNemotron
        ? `${nemotronBaseUrl}/v1/chat/completions`
        : useAIGateway
          ? "https://ai-gateway.vercel.sh/v1/chat/completions"
          : "https://api.openai.com/v1/chat/completions";

      const apiKey = useNemotron
        ? process.env.NEMOTRON_API_KEY || "local"
        : useAIGateway
          ? process.env.AI_GATEWAY_API_KEY!
          : process.env.OPENAI_API_KEY!;

      const modelName = useNemotron
        ? process.env.NEMOTRON_MODEL ||
          "mlx-community/Nemotron-3-Nano-Omni-30B-A3B-Reasoning-mxfp4"
        : useAIGateway
          ? "openai/gpt-5" // AI Gateway uses provider/model format
          : "gpt-5"; // Direct OpenAI uses just the model name

      console.log(
        `🤖 Using ${
          useNemotron
            ? "local Nemotron"
            : useAIGateway
              ? "Vercel AI Gateway"
              : "direct OpenAI API"
        } for prompt enhancement`,
      );

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: modelName,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.7,
          max_tokens: 200,
        }),
      });

      if (!response.ok) {
        throw new Error(`GPT-5 API error: ${response.status}`);
      }

      const data = (await response.json()) as GPT5ChatResponse;
      const optimizedPrompt = data.choices[0].message.content.trim();

      return {
        originalPrompt: config.description,
        optimizedPrompt,
        model: modelName,
        keywords: this.extractKeywords(optimizedPrompt),
      };
    } catch (error) {
      console.error("GPT-5 enhancement failed:", error);
      // Load generation prompts for fallback
      const generationPrompts = await getGenerationPrompts();
      const fallbackTemplate =
        generationPrompts?.imageGeneration?.fallbackEnhancement ||
        '${config.description}. ${config.style || "game-ready"} style, clean geometry, game-ready 3D asset.';

      // Replace template variables
      const fallbackPrompt = fallbackTemplate
        .replace("${config.description}", config.description)
        .replace(
          '${config.style || "game-ready"}',
          config.style || "game-ready",
        );

      return {
        originalPrompt: config.description,
        optimizedPrompt: fallbackPrompt,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Extract keywords from prompt
   */
  private extractKeywords(prompt: string): string[] {
    const keywords: string[] = [];
    const patterns = [
      /\b(bronze|steel|iron|mithril|adamant|rune)\b/gi,
      /\b(sword|shield|bow|staff|armor|helmet)\b/gi,
      /\b(leather|metal|wood|crystal|bone)\b/gi,
      /\b(low-poly|high-poly|realistic|stylized)\b/gi,
    ];

    patterns.forEach((pattern) => {
      const matches = prompt.match(pattern);
      if (matches) {
        keywords.push(...matches.map((m) => m.toLowerCase()));
      }
    });

    return [...new Set(keywords)];
  }

  private shouldUseComfyImage(): boolean {
    const provider =
      process.env.ASSET_FORGE_IMAGE_PROVIDER ||
      process.env.LOCAL_IMAGE_PROVIDER ||
      "";
    return provider.toLowerCase() === "comfy";
  }

  private shouldUseComfy3D(): boolean {
    const provider =
      process.env.ASSET_FORGE_3D_PROVIDER ||
      process.env.LOCAL_3D_PROVIDER ||
      "";
    return ["comfy", "trellis"].includes(provider.toLowerCase());
  }

  private shouldExportToHillDGX(): boolean {
    const provider = (
      process.env.ASSET_FORGE_GENERATION_PROVIDER ||
      process.env.ASSET_FORGE_3D_PROVIDER ||
      process.env.LOCAL_3D_PROVIDER ||
      ""
    ).toLowerCase();
    const exportTarget = (process.env.HILL_EXPORT_TARGET || "").toLowerCase();
    return (
      this.hillDGXService.isConfigured &&
      (provider === "hill_dgx" || exportTarget === "library")
    );
  }

  private shouldUseHillDgxProvider(config: PipelineConfig): boolean {
    const metadata = config.metadata as Record<string, unknown> | undefined;
    const requestedProvider =
      typeof metadata?.provider === "string" ? metadata.provider : undefined;
    const envProvider = (
      process.env.ASSET_FORGE_GENERATION_PROVIDER ||
      process.env.GENERATION_PROVIDER ||
      ""
    ).toLowerCase();

    return (
      requestedProvider === "hill_dgx" ||
      requestedProvider === "local_dgx_trellis2" ||
      envProvider === "hill_dgx" ||
      envProvider === "local_dgx_trellis2"
    );
  }

  private getHillApiBaseUrl(): string {
    const baseUrl =
      process.env.HILL_API_BASE_URL ||
      process.env.HILL_ASSET_LIBRARY_URL ||
      process.env.VRM_VIEWER_API_URL;

    if (!baseUrl) {
      throw new Error(
        "HILL_API_BASE_URL is required when ASSET_FORGE_GENERATION_PROVIDER=hill_dgx",
      );
    }

    return baseUrl.replace(/\/+$/, "");
  }

  private hillApiUrl(pathname: string): string {
    return new URL(pathname, `${this.getHillApiBaseUrl()}/`).toString();
  }

  private hillFileUrl(filePath?: string | null): string | undefined {
    if (!filePath) return undefined;
    const url = new URL("/api/hill/file", `${this.getHillApiBaseUrl()}/`);
    url.searchParams.set("path", filePath);
    return url.toString();
  }

  private getHillHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (process.env.HILL_API_TOKEN) {
      headers.Authorization = `Bearer ${process.env.HILL_API_TOKEN}`;
    }
    return headers;
  }

  private async readHillJson<T>(
    url: string,
    init?: Parameters<typeof fetch>[1],
  ): Promise<T> {
    const response = await fetch(url, {
      ...init,
      headers: {
        ...this.getHillHeaders(),
        ...(init?.headers as Record<string, string> | undefined),
      },
    });

    const payload = (await response
      .json()
      .catch(() => null)) as HillApiResponse<T> | null;
    if (!response.ok || payload?.success === false) {
      throw new Error(
        payload?.error || `Hill API request failed with ${response.status}`,
      );
    }

    return (payload?.data ?? payload) as T;
  }

  private async getHillConjureJob(jobId: string): Promise<HillConjureJob> {
    const jobs = await this.readHillJson<HillConjureJob[]>(
      this.hillApiUrl("/api/hill/conjure-jobs"),
    );
    const job = jobs.find((item) => item.id === jobId);
    if (!job) {
      throw new Error(`Hill conjure job ${jobId} not found`);
    }
    return job;
  }

  private async processHillDgxPipeline(
    pipeline: Pipeline,
    enhancedPrompt: string,
  ): Promise<void> {
    const metadata = pipeline.config.metadata as
      | Record<string, unknown>
      | undefined;
    const mode =
      (typeof metadata?.hillMode === "string" && metadata.hillMode) ||
      process.env.HILL_GENERATION_MODE ||
      "create";
    const exportTarget =
      (typeof metadata?.exportTarget === "string" && metadata.exportTarget) ||
      process.env.HILL_EXPORT_TARGET ||
      "library";

    pipeline.stages.imageGeneration.status = "processing";
    pipeline.stages.imageGeneration.progress = 20;
    pipeline.stages.imageGeneration.result = {
      provider: "hill_dgx",
      imageModel: "flux_klein",
      source: "remote-dgx",
    };
    pipeline.results.imageGeneration = pipeline.stages.imageGeneration.result;
    pipeline.progress = 20;

    pipeline.stages.image3D.status = "processing";
    pipeline.stages.image3D.progress = 5;

    const submitBody = {
      prompt: enhancedPrompt,
      name: pipeline.config.assetId || pipeline.config.name,
      mode,
      quality: "medium",
      exportTarget,
      generateLods: true,
      seed: Number.isFinite(Number(metadata?.seed))
        ? Number(metadata?.seed)
        : undefined,
    };

    const submitted = await this.readHillJson<HillConjureJob>(
      this.hillApiUrl("/api/hill/conjure-jobs"),
      {
        method: "POST",
        body: JSON.stringify(submitBody),
      },
    );

    const pollIntervalMs = Number.parseInt(
      process.env.HILL_API_POLL_INTERVAL_MS || "3000",
      10,
    );
    const timeoutMs = Number.parseInt(
      process.env.HILL_API_TIMEOUT_MS || "1800000",
      10,
    );
    const startedAt = Date.now();
    let job = submitted;

    while (Date.now() - startedAt < timeoutMs) {
      job = await this.getHillConjureJob(submitted.id);

      if (job.status === "completed") break;
      if (job.status === "failed") {
        throw new Error(job.error || "Hill DGX generation failed");
      }

      pipeline.stages.image3D.progress = job.status === "running" ? 55 : 15;
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    if (job.status !== "completed") {
      throw new Error(`Hill DGX generation timed out for job ${submitted.id}`);
    }

    const result = job.result || {};
    const modelUrl = this.hillFileUrl(result.glb);
    const conceptArtUrl = this.hillFileUrl(result.ref_image);
    if (!modelUrl) {
      throw new Error("Hill DGX job completed without a GLB result");
    }

    const outputDir = path.join("gdd-assets", pipeline.config.assetId);
    await fs.mkdir(outputDir, { recursive: true });
    const metadataRecord = {
      id: pipeline.config.assetId,
      name: pipeline.config.name,
      gameId: pipeline.config.assetId,
      type: pipeline.config.type,
      subtype: pipeline.config.subtype,
      description: pipeline.config.description,
      detailedPrompt: enhancedPrompt,
      generatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      isBaseModel: true,
      isPlaceholder: false,
      hasModel: true,
      hasConceptArt: !!conceptArtUrl,
      modelUrl,
      conceptArtUrl,
      modelPath: result.glb,
      conceptArtPath: result.ref_image,
      lodDir: result.lod_dir,
      gddCompliant: true,
      workflow: "Hill DGX -> Flux Klein -> Bruno Trellis2 1024 -> LOD",
      provider: "hill_dgx",
      hillJobId: job.id,
      hillAssetId: job.assetId,
      hillAssetName: job.assetName,
      pipelineType: result.pipeline_type,
      quality: result.quality,
      textureSize: result.textureSize,
      reviewStatus: result.reviewStatus,
      reviewNote: result.reviewNote,
      meshMetrics: result.meshMetrics,
      generatedLods: !!result.lod_dir,
      isPublic: true,
      updatedAt: new Date().toISOString(),
    };

    await fs.writeFile(
      path.join(outputDir, "metadata.json"),
      JSON.stringify(metadataRecord, null, 2),
    );

    pipeline.stages.imageGeneration.status = "completed";
    pipeline.stages.imageGeneration.progress = 100;
    pipeline.stages.imageGeneration.result = {
      provider: "hill_dgx",
      imageModel: "flux_klein",
      imageUrl: conceptArtUrl,
      sourcePath: result.ref_image,
    };
    pipeline.results.imageGeneration = pipeline.stages.imageGeneration.result;

    pipeline.stages.image3D.status = "completed";
    pipeline.stages.image3D.progress = 100;
    pipeline.stages.image3D.result = {
      provider: "hill_dgx",
      taskId: job.id,
      modelUrl,
      conceptArtUrl,
      localPath: result.glb,
      lodDir: result.lod_dir,
      pipelineType: result.pipeline_type,
      wallSeconds: result.wall_s,
      elapsedSeconds: result.elapsed_s,
      meshMetrics: result.meshMetrics,
    };
    pipeline.results.image3D = pipeline.stages.image3D.result;

    pipeline.stages.textureGeneration.status = "skipped";
    if (pipeline.stages.rigging) pipeline.stages.rigging.status = "skipped";
    if (pipeline.stages.spriteGeneration) {
      pipeline.stages.spriteGeneration.status = "skipped";
    }

    pipeline.status = "completed";
    pipeline.completedAt = new Date().toISOString();
    pipeline.progress = 100;
    pipeline.finalAsset = {
      id: pipeline.config.assetId,
      name: pipeline.config.name,
      modelUrl,
      conceptArtUrl: conceptArtUrl || "",
      variants: [],
    };
  }

  private async generateImageWithComfy(
    prompt: string,
  ): Promise<ImageGenerationResult> {
    const result = await this.comfyService.generateImage(prompt);
    const extension = path.extname(result.file.filename).toLowerCase();
    const mimeType =
      extension === ".jpg" || extension === ".jpeg"
        ? "image/jpeg"
        : extension === ".webp"
          ? "image/webp"
          : "image/png";

    return {
      imageUrl: `data:${mimeType};base64,${result.buffer.toString("base64")}`,
      prompt,
      metadata: {
        model: "comfyui",
        resolution: "workflow",
        quality: "workflow",
        timestamp: new Date().toISOString(),
      },
    };
  }

  private async writeImageToTempFile(
    imageUrl: string,
    assetId: string,
  ): Promise<string> {
    await fs.mkdir("temp-images", { recursive: true });
    const imagePath = path.join("temp-images", `${assetId}-concept.png`);

    if (imageUrl.startsWith("data:")) {
      const imageData = imageUrl.split(",")[1];
      await fs.writeFile(imagePath, Buffer.from(imageData, "base64"));
      return imagePath;
    }

    const buffer = await this.downloadFile(imageUrl);
    await fs.writeFile(imagePath, buffer);
    return imagePath;
  }

  /**
   * Download file from URL
   */
  private async downloadFile(url: string): Promise<Buffer> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.status}`);
    }
    return Buffer.from(await response.arrayBuffer());
  }

  /**
   * Extract T-pose from an animation GLB file by removing animations
   */
  private async extractTPoseFromAnimation(
    inputPath: string,
    outputPath: string,
  ): Promise<void> {
    const inputBuffer = await fs.readFile(inputPath);

    // Verify GLB magic number
    const magic = inputBuffer.readUInt32LE(0);
    if (magic !== 0x46546c67) {
      // 'glTF' in little-endian
      throw new Error("Not a valid GLB file");
    }

    const version = inputBuffer.readUInt32LE(4);
    const totalLength = inputBuffer.readUInt32LE(8);

    // Parse chunks
    let offset = 12; // Skip header
    const chunks: Array<{ type: string; data: Buffer }> = [];

    while (offset < inputBuffer.length) {
      const chunkLength = inputBuffer.readUInt32LE(offset);
      const chunkType = inputBuffer.readUInt32BE(offset + 4);

      const typeStr = String.fromCharCode(
        (chunkType >> 24) & 0xff,
        (chunkType >> 16) & 0xff,
        (chunkType >> 8) & 0xff,
        chunkType & 0xff,
      );

      const chunkData = inputBuffer.slice(offset + 8, offset + 8 + chunkLength);
      chunks.push({ type: typeStr, data: chunkData });

      // Chunks are padded to 4-byte boundaries
      const paddedLength = Math.ceil(chunkLength / 4) * 4;
      offset += 8 + paddedLength;
    }

    // Find and modify the JSON chunk to remove animations
    const jsonChunk = chunks.find((c) => c.type === "JSON");
    if (!jsonChunk) {
      throw new Error("No JSON chunk found in GLB");
    }

    // Parse the glTF JSON
    const gltfJson = JSON.parse(jsonChunk.data.toString());

    // Remove animations
    delete gltfJson.animations;

    // Convert back to buffer
    const newJsonStr = JSON.stringify(gltfJson);
    const newJsonBuffer = Buffer.from(newJsonStr);

    // Pad to 4-byte boundary with spaces (0x20) as per glTF spec
    const paddedLength = Math.ceil(newJsonBuffer.length / 4) * 4;
    const paddedJsonBuffer = Buffer.alloc(paddedLength, 0x20); // Fill with spaces
    newJsonBuffer.copy(paddedJsonBuffer);

    // Update JSON chunk
    jsonChunk.data = paddedJsonBuffer;

    // Reconstruct GLB
    let newTotalLength = 12; // header
    chunks.forEach((chunk) => {
      newTotalLength += 8 + chunk.data.length; // chunk header + data
    });

    // Create output buffer
    const outputBuffer = Buffer.alloc(newTotalLength);

    // Write header
    outputBuffer.writeUInt32LE(0x46546c67, 0); // magic
    outputBuffer.writeUInt32LE(version, 4);
    outputBuffer.writeUInt32LE(newTotalLength, 8);

    // Write chunks
    offset = 12;
    chunks.forEach((chunk) => {
      // Chunk header
      outputBuffer.writeUInt32LE(chunk.data.length, offset);

      // Convert type string back to uint32
      let typeInt = 0;
      for (let i = 0; i < 4; i++) {
        typeInt |= chunk.type.charCodeAt(i) << (24 - i * 8);
      }
      outputBuffer.writeUInt32BE(typeInt, offset + 4);

      // Chunk data
      chunk.data.copy(outputBuffer, offset + 8);

      offset += 8 + chunk.data.length;
    });

    // Write output file
    await fs.writeFile(outputPath, outputBuffer);
  }

  /**
   * Clean up old pipelines
   */
  cleanupOldPipelines(): void {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;

    for (const [id, pipeline] of this.activePipelines.entries()) {
      const createdAt = new Date(pipeline.createdAt).getTime();
      if (
        createdAt < oneHourAgo &&
        (pipeline.status === "completed" || pipeline.status === "failed")
      ) {
        this.activePipelines.delete(id);
      }
    }
  }
}

// Cleanup old pipelines periodically
setInterval(
  () => {
    const globalWithService = global as Record<string, unknown>;
    if (
      globalWithService.generationService &&
      typeof (globalWithService.generationService as Record<string, unknown>)
        .cleanupOldPipelines === "function"
    ) {
      (
        (globalWithService.generationService as Record<string, unknown>)
          .cleanupOldPipelines as () => void
      )();
    }
  },
  30 * 60 * 1000,
); // Every 30 minutes

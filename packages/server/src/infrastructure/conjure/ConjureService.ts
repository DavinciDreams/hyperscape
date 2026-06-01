export type ConjureStartInput = {
  prompt: string;
  speechTranscript?: string;
  type?: string;
  subtype?: string;
  quality?: string;
};

export type ConjureStartResult = {
  conjureId?: string;
  assetId: string;
  status: string;
  message: string;
  prompt: string;
  speechTranscript?: string;
};

export type ConjureStatusResult = {
  conjureId: string;
  status: string;
  progress: number;
  stages?: unknown;
  results: Record<string, unknown>;
  modelUrl: string | null;
  localPath: string | null;
  error?: string;
  createdAt?: string;
  completedAt?: string;
};

export class ConjureServiceError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 500) {
    super(message);
    this.name = "ConjureServiceError";
    this.statusCode = statusCode;
  }
}

type AssetForgePipelineStart = {
  pipelineId?: string;
  status?: string;
  message?: string;
  error?: string;
};

type AssetForgePipelineStatus = {
  id?: string;
  status?: string;
  progress?: number;
  stages?: unknown;
  results?: Record<string, unknown>;
  error?: string;
  createdAt?: string;
  completedAt?: string;
};

const DEFAULT_ASSET_FORGE_URL =
  process.env.NODE_ENV === "production"
    ? "http://asset-forge:3401"
    : "http://localhost:3401";

const MAX_PROMPT_LENGTH = 1200;

function resolveAssetForgeBaseUrl(): string {
  return (
    process.env.GAME_CONJURE_ASSET_FORGE_URL ||
    process.env.ASSET_FORGE_API_URL ||
    process.env.ASSET_FORGE_INTERNAL_URL ||
    DEFAULT_ASSET_FORGE_URL
  ).replace(/\/+$/, "");
}

function slugifyPrompt(prompt: string): string {
  const slug = prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "conjure";
}

async function readAssetForgeJson<T>(
  response: Response,
): Promise<T & { error?: string }> {
  const text = await response.text();
  if (!text) return {} as T & { error?: string };

  try {
    return JSON.parse(text) as T & { error?: string };
  } catch {
    return { error: text } as T & { error?: string };
  }
}

export class ConjureService {
  readonly assetForgeBaseUrl: string;

  constructor(assetForgeBaseUrl = resolveAssetForgeBaseUrl()) {
    this.assetForgeBaseUrl = assetForgeBaseUrl;
  }

  async start(input: ConjureStartInput): Promise<ConjureStartResult> {
    const prompt = input.prompt.trim();
    this.validatePrompt(prompt);

    const assetId = `game-conjure-${Date.now()}-${slugifyPrompt(prompt)}`;
    const response = await fetch(
      `${this.assetForgeBaseUrl}/api/generation/pipeline`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(this.createPipelineConfig(input, assetId, prompt)),
      },
    );
    const payload = await readAssetForgeJson<AssetForgePipelineStart>(response);

    if (!response.ok) {
      throw new ConjureServiceError(
        payload.error || `Asset Forge returned HTTP ${response.status}`,
        response.status,
      );
    }

    return {
      conjureId: payload.pipelineId,
      assetId,
      status: payload.status || "initializing",
      message: payload.message || "Conjure pipeline started",
      prompt,
      speechTranscript: input.speechTranscript,
    };
  }

  async getStatus(conjureId: string): Promise<ConjureStatusResult> {
    const cleanConjureId = conjureId.trim();
    if (!cleanConjureId) {
      throw new ConjureServiceError("Conjure id is required", 400);
    }

    const response = await fetch(
      `${this.assetForgeBaseUrl}/api/generation/pipeline/${encodeURIComponent(
        cleanConjureId,
      )}`,
    );
    const payload =
      await readAssetForgeJson<AssetForgePipelineStatus>(response);

    if (!response.ok) {
      throw new ConjureServiceError(
        payload.error || `Asset Forge returned HTTP ${response.status}`,
        response.status,
      );
    }

    const resultRecord =
      payload.results && typeof payload.results === "object"
        ? payload.results
        : {};
    const image3D =
      resultRecord.image3D && typeof resultRecord.image3D === "object"
        ? (resultRecord.image3D as Record<string, unknown>)
        : undefined;

    return {
      conjureId: payload.id || cleanConjureId,
      status: payload.status || "unknown",
      progress: typeof payload.progress === "number" ? payload.progress : 0,
      stages: payload.stages,
      results: payload.results || {},
      modelUrl: typeof image3D?.modelUrl === "string" ? image3D.modelUrl : null,
      localPath:
        typeof image3D?.localPath === "string" ? image3D.localPath : null,
      error: payload.error,
      createdAt: payload.createdAt,
      completedAt: payload.completedAt,
    };
  }

  private validatePrompt(prompt: string): void {
    if (!prompt) {
      throw new ConjureServiceError("Prompt is required", 400);
    }
    if (prompt.length > MAX_PROMPT_LENGTH) {
      throw new ConjureServiceError(
        `Prompt must be ${MAX_PROMPT_LENGTH} characters or less`,
        400,
      );
    }
  }

  private createPipelineConfig(
    input: ConjureStartInput,
    assetId: string,
    prompt: string,
  ): Record<string, unknown> {
    const type = input.type?.trim() || "prop";
    const subtype = input.subtype?.trim() || "conjured";
    const quality = input.quality?.trim() || "high";

    return {
      description: prompt,
      assetId,
      name: prompt.slice(0, 80),
      type,
      subtype,
      generationType: "item",
      quality,
      style:
        "game-ready, readable silhouette, usable in a RuneScape-style world",
      enableRigging: false,
      enableRetexturing: false,
      enableSprites: false,
      metadata: {
        provider: "pixel3d-gradio",
        useGPT5Enhancement: true,
      },
      customPrompts: {
        gameStyle:
          "game-ready 3D prop, clean topology, strong silhouette, PBR textures, grounded scale",
      },
    };
  }
}

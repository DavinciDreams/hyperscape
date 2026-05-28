interface HillHealthResponse {
  success?: boolean;
  dataDir?: string;
  [key: string]: unknown;
}

export interface HillLibraryAsset {
  uuid?: string;
  id?: string;
  name?: string;
  format?: string;
  size?: number;
  sourcePath?: string;
  url?: string;
  [key: string]: unknown;
}

interface HillPublishOptions {
  assetId: string;
  name: string;
  description?: string;
  type?: string;
  subtype?: string;
  prompt?: string;
  tags?: string[];
}

export class HillDGXService {
  readonly baseUrl: string;
  private timeoutMs: number;

  constructor(baseUrl = process.env.HILL_API_BASE_URL || "") {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.timeoutMs = Number(process.env.HILL_API_TIMEOUT_MS || 1800000);
  }

  get isConfigured(): boolean {
    return !!this.baseUrl;
  }

  async health(): Promise<boolean> {
    if (!this.isConfigured) return false;

    try {
      const response = await fetch(`${this.baseUrl}/api/health`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) return false;
      const data = (await response.json()) as HillHealthResponse;
      return data.success === true;
    } catch {
      return false;
    }
  }

  async publishModel(
    buffer: Buffer,
    options: HillPublishOptions,
  ): Promise<HillLibraryAsset> {
    if (!this.isConfigured) {
      throw new Error("HILL_API_BASE_URL is not configured");
    }

    const path = process.env.HILL_API_MODELS_PATH || "/api/models";
    const response = await fetch(this.url(path), {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(this.timeoutMs),
      body: JSON.stringify({
        dataBase64: buffer.toString("base64"),
        name: options.name || options.assetId,
        displayName: options.name || options.assetId,
        description: options.description || "",
        format: "glb",
        tags: options.tags || [options.type, options.subtype].filter(Boolean),
        exportTarget: process.env.HILL_EXPORT_TARGET || "library",
        metadata: {
          assetId: options.assetId,
          type: options.type,
          subtype: options.subtype,
          prompt: options.prompt,
          source: "asset-forge",
        },
      }),
    });

    const data = (await this.readJson(response)) as {
      success?: boolean;
      data?: HillLibraryAsset;
      error?: { message?: string };
    };

    if (!response.ok || data.success === false) {
      throw new Error(
        `Hill DGX library upload failed: ${response.status} ${
          data.error?.message || JSON.stringify(data)
        }`,
      );
    }

    return data.data || {};
  }

  private url(path: string): string {
    return `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
  }

  private async readJson(response: Response): Promise<unknown> {
    const text = await response.text();
    if (!text) return {};

    try {
      return JSON.parse(text);
    } catch {
      return { raw: text };
    }
  }
}

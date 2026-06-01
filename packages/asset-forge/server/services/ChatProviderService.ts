import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

export type ChatProviderQuality = "quality" | "speed" | "balanced";

export interface ChatProviderMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionOptions {
  consumer?: string;
  maxTokens?: number;
  messages: ChatProviderMessage[];
  temperature?: number;
  threadId?: string;
}

export interface ChatCompletionResult {
  model: string;
  provider: string;
  text: string;
}

interface ProviderConfig {
  apiKey?: string;
  baseUrl: string;
  enabled: boolean;
  modelByQuality: Record<ChatProviderQuality, string>;
  name: "safier" | "hyades" | "nemotron" | "ai-gateway" | "openai";
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
    text?: unknown;
  }>;
}

function normalizeProviderName(value: string | undefined): string {
  return (value || "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-");
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function extractText(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const response = payload as ChatCompletionResponse;
  const choice = response.choices?.[0];
  const content = choice?.message?.content;

  if (typeof content === "string") {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (!part || typeof part !== "object") {
          return "";
        }
        const text = (part as { text?: unknown }).text;
        return typeof text === "string" ? text : "";
      })
      .join("")
      .trim();
  }

  return typeof choice?.text === "string" ? choice.text.trim() : "";
}

class ChatProviderService {
  private readonly provider: ProviderConfig | null;
  public readonly isEnabled: boolean;

  constructor() {
    this.provider = this.resolveProvider();
    this.isEnabled = this.provider?.enabled ?? false;

    if (this.provider) {
      console.log(
        `[ChatProviderService] Initialized with ${this.provider.name}`,
      );
    } else {
      console.log(
        "[ChatProviderService] No chat provider configured. Set ASSET_FORGE_CHAT_PROVIDER=hyades, AI_GATEWAY_API_KEY, or OPENAI_API_KEY.",
      );
    }
  }

  get providerName(): string | null {
    return this.provider?.name ?? null;
  }

  getModelName(quality: ChatProviderQuality = "balanced"): string {
    if (!this.provider) {
      throw new Error("No chat provider configured");
    }
    return this.provider.modelByQuality[quality];
  }

  getLanguageModel(
    quality: ChatProviderQuality = "balanced",
  ): LanguageModel | null {
    if (!this.provider || this.provider.name === "nemotron") {
      return null;
    }

    const model = this.provider.modelByQuality[quality];
    const openai = createOpenAI({
      apiKey: this.provider.apiKey,
      baseURL: `${this.provider.baseUrl}/v1`,
    });
    return openai(model);
  }

  async complete(
    options: ChatCompletionOptions,
    quality: ChatProviderQuality = "balanced",
  ): Promise<ChatCompletionResult> {
    if (!this.provider) {
      throw new Error(
        "No chat provider configured. Set ASSET_FORGE_CHAT_PROVIDER=hyades, AI_GATEWAY_API_KEY, or OPENAI_API_KEY.",
      );
    }

    const model = this.provider.modelByQuality[quality];
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.provider.apiKey) {
      headers.Authorization = `Bearer ${this.provider.apiKey}`;
    }
    if (options.threadId) {
      headers["X-Hyades-Thread"] = options.threadId;
    }
    if (options.consumer) {
      headers["X-Hyades-Consumer"] = options.consumer;
    }

    const response = await fetch(
      `${this.provider.baseUrl}/v1/chat/completions`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          model,
          messages: options.messages,
          temperature: options.temperature ?? 0.7,
          max_tokens: options.maxTokens ?? 512,
        }),
      },
    );

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `${this.provider.name} chat failed with ${response.status}: ${text.slice(0, 500)}`,
      );
    }

    const data = (await response.json()) as unknown;
    const text = extractText(data);
    if (!text) {
      throw new Error(`${this.provider.name} returned an empty chat response`);
    }

    return {
      model,
      provider: this.provider.name,
      text,
    };
  }

  private resolveProvider(): ProviderConfig | null {
    const requested = normalizeProviderName(
      process.env.ASSET_FORGE_CHAT_PROVIDER ||
        process.env.CHAT_PROVIDER ||
        process.env.LOCAL_CHAT_PROVIDER,
    );

    if (
      requested === "safier" ||
      requested === "safier-semantics" ||
      requested === "hyades" ||
      requested === "nemotron" ||
      requested === "nemo" ||
      requested === "local-nemotron"
    ) {
      const runtimeBaseUrl =
        process.env.HYADES_RUNTIME_URL ||
        process.env.SAFIER_RUNTIME_URL ||
        process.env.AGENT_RUNTIME_URL;
      const endpointBaseUrl =
        process.env.HYADES_LLM_ENDPOINT ||
        process.env.SAFIER_LLM_ENDPOINT ||
        process.env.NEMOTRON_BASE_URL ||
        process.env.LOCAL_PROMPT_MODEL_BASE_URL ||
        "http://monumentals-mac-studio.local:12345";
      const baseUrl = runtimeBaseUrl || endpointBaseUrl;
      return {
        apiKey:
          process.env.HYADES_LLM_API_KEY ||
          process.env.SAFIER_LLM_API_KEY ||
          process.env.AGENT_RUNTIME_API_KEY ||
          process.env.NEMOTRON_API_KEY,
        baseUrl: stripTrailingSlash(baseUrl).replace(/\/v1$/, ""),
        enabled: true,
        modelByQuality: {
          quality:
            process.env.HYADES_LLM_MODEL ||
            process.env.SAFIER_LLM_MODEL ||
            process.env.NEMOTRON_QUALITY_MODEL ||
            process.env.NEMOTRON_MODEL ||
            "nemotron3-omni",
          speed:
            process.env.HYADES_LLM_SMALL_MODEL ||
            process.env.SAFIER_LLM_SMALL_MODEL ||
            process.env.NEMOTRON_SPEED_MODEL ||
            process.env.NEMOTRON_MODEL ||
            "nemotron3-omni",
          balanced:
            process.env.HYADES_LLM_MODEL ||
            process.env.SAFIER_LLM_MODEL ||
            process.env.NEMOTRON_BALANCED_MODEL ||
            process.env.NEMOTRON_MODEL ||
            "nemotron3-omni",
        },
        name:
          requested === "safier" || requested === "safier-semantics"
            ? "safier"
            : requested === "hyades" || runtimeBaseUrl
              ? "hyades"
              : "nemotron",
      };
    }

    if (
      process.env.HYADES_RUNTIME_URL &&
      process.env.HYADES_LLM_API_KEY &&
      !process.env.AI_GATEWAY_API_KEY &&
      !process.env.OPENAI_API_KEY
    ) {
      return {
        apiKey: process.env.HYADES_LLM_API_KEY,
        baseUrl: stripTrailingSlash(process.env.HYADES_RUNTIME_URL).replace(
          /\/v1$/,
          "",
        ),
        enabled: true,
        modelByQuality: {
          quality:
            process.env.HYADES_LLM_MODEL ||
            process.env.NEMOTRON_MODEL ||
            "nemotron3-omni",
          speed:
            process.env.HYADES_LLM_SMALL_MODEL ||
            process.env.NEMOTRON_MODEL ||
            "nemotron3-omni",
          balanced:
            process.env.HYADES_LLM_MODEL ||
            process.env.NEMOTRON_MODEL ||
            "nemotron3-omni",
        },
        name: "hyades",
      };
    }

    if (process.env.AI_GATEWAY_API_KEY) {
      return {
        apiKey: process.env.AI_GATEWAY_API_KEY,
        baseUrl: "https://ai-gateway.vercel.sh",
        enabled: true,
        modelByQuality: {
          quality: "openai/gpt-5",
          speed: "openai/gpt-5-mini",
          balanced: "openai/gpt-5",
        },
        name: "ai-gateway",
      };
    }

    if (process.env.OPENAI_API_KEY) {
      return {
        apiKey: process.env.OPENAI_API_KEY,
        baseUrl: "https://api.openai.com",
        enabled: true,
        modelByQuality: {
          quality: "gpt-5",
          speed: "gpt-5-mini",
          balanced: "gpt-5",
        },
        name: "openai",
      };
    }

    return null;
  }
}

export const chatProviderService = new ChatProviderService();

/**
 * AISDKService — unit tests.
 *
 * Phase H test-coverage cut. AISDKService is the simplest of the
 * asset-forge AI services — it just resolves an API key from env
 * and constructs an OpenAI client (or refuses to). Test surface:
 *   - `isEnabled` reflects env var presence
 *   - AI_GATEWAY_API_KEY takes precedence over OPENAI_API_KEY
 *   - `getConfiguredModel` throws when no key is set
 *   - `getModelConfig` returns the per-quality config
 *
 * No live API calls — `@ai-sdk/openai` is mocked so the constructor
 * doesn't try to validate the key.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the openai SDK before importing the service so the real
// `createOpenAI` is never called (would attempt key validation).
vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: vi.fn((config: { apiKey: string; baseURL?: string }) => {
    // Return a callable that mimics the SDK's "model factory" shape:
    // calling it with a model id returns a `LanguageModel`-shaped
    // object the rest of the codebase can treat as opaque.
    const factory = vi.fn((modelId: string) => ({
      modelId,
      provider: "openai-mock",
      _config: config,
    }));
    return factory;
  }),
}));

import { AISDKService } from "../AISDKService.js";

const ORIGINAL_AI_GATEWAY = process.env.AI_GATEWAY_API_KEY;
const ORIGINAL_OPENAI = process.env.OPENAI_API_KEY;

beforeEach(() => {
  delete process.env.AI_GATEWAY_API_KEY;
  delete process.env.OPENAI_API_KEY;
});

afterEach(() => {
  if (ORIGINAL_AI_GATEWAY === undefined) {
    delete process.env.AI_GATEWAY_API_KEY;
  } else {
    process.env.AI_GATEWAY_API_KEY = ORIGINAL_AI_GATEWAY;
  }
  if (ORIGINAL_OPENAI === undefined) {
    delete process.env.OPENAI_API_KEY;
  } else {
    process.env.OPENAI_API_KEY = ORIGINAL_OPENAI;
  }
});

describe("AISDKService — initialization", () => {
  it("isEnabled is false when neither env var is set", () => {
    const svc = new AISDKService();
    expect(svc.isEnabled).toBe(false);
  });

  it("isEnabled is true when AI_GATEWAY_API_KEY is set", () => {
    process.env.AI_GATEWAY_API_KEY = "test-gateway-key";
    const svc = new AISDKService();
    expect(svc.isEnabled).toBe(true);
  });

  it("isEnabled is true when OPENAI_API_KEY is set (no gateway)", () => {
    process.env.OPENAI_API_KEY = "test-openai-key";
    const svc = new AISDKService();
    expect(svc.isEnabled).toBe(true);
  });

  it("AI_GATEWAY_API_KEY takes precedence — gateway model ids include 'openai/' prefix", () => {
    process.env.AI_GATEWAY_API_KEY = "test-gateway";
    process.env.OPENAI_API_KEY = "test-openai-fallback";
    const svc = new AISDKService();
    expect(svc.getModelConfig("quality").model).toBe("openai/gpt-5");
    expect(svc.getModelConfig("speed").model).toBe("openai/gpt-5-mini");
    expect(svc.getModelConfig("balanced").model).toBe("openai/gpt-5");
  });

  it("Direct OpenAI mode — model ids do NOT carry the 'openai/' prefix", () => {
    process.env.OPENAI_API_KEY = "test-openai-direct";
    const svc = new AISDKService();
    expect(svc.getModelConfig("quality").model).toBe("gpt-5");
    expect(svc.getModelConfig("speed").model).toBe("gpt-5-mini");
    expect(svc.getModelConfig("balanced").model).toBe("gpt-5");
  });
});

describe("AISDKService — getConfiguredModel", () => {
  it("throws a descriptive error when service is not enabled", async () => {
    const svc = new AISDKService();
    expect(svc.isEnabled).toBe(false);

    await expect(svc.getConfiguredModel()).rejects.toThrow(
      /AI SDK Service not available/i,
    );
  });

  it("returns the model id for the requested quality when enabled", async () => {
    process.env.OPENAI_API_KEY = "test-openai-direct";
    const svc = new AISDKService();
    expect(svc.isEnabled).toBe(true);

    const model = (await svc.getConfiguredModel("quality")) as unknown as {
      modelId: string;
    };
    expect(model.modelId).toBe("gpt-5");

    const speedModel = (await svc.getConfiguredModel("speed")) as unknown as {
      modelId: string;
    };
    expect(speedModel.modelId).toBe("gpt-5-mini");
  });

  it("defaults to 'balanced' quality when no argument is provided", async () => {
    process.env.OPENAI_API_KEY = "test-openai-direct";
    const svc = new AISDKService();

    const model = (await svc.getConfiguredModel()) as unknown as {
      modelId: string;
    };
    // 'balanced' under direct OpenAI maps to 'gpt-5' (same as quality
    // but with 0.5 temperature — the temperature is applied during
    // generation, not at model creation).
    expect(model.modelId).toBe("gpt-5");
  });
});

describe("AISDKService — getModelConfig", () => {
  it("returns temperature 0.7 for quality and speed, 0.5 for balanced", () => {
    process.env.OPENAI_API_KEY = "test-openai-direct";
    const svc = new AISDKService();
    expect(svc.getModelConfig("quality").temperature).toBe(0.7);
    expect(svc.getModelConfig("speed").temperature).toBe(0.7);
    expect(svc.getModelConfig("balanced").temperature).toBe(0.5);
  });

  it("returns provider 'openai' for every quality tier", () => {
    process.env.OPENAI_API_KEY = "test-openai-direct";
    const svc = new AISDKService();
    expect(svc.getModelConfig("quality").provider).toBe("openai");
    expect(svc.getModelConfig("speed").provider).toBe("openai");
    expect(svc.getModelConfig("balanced").provider).toBe("openai");
  });
});

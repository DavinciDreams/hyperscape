/**
 * AICreationService — unit tests.
 *
 * Phase H test-coverage cut #5. AICreationService is a thin wrapper
 * around two inner SDKs (OpenAI image generation + Meshy 3D). Both
 * inner services accept an injectable `fetchFn` so tests can pass a
 * `vi.fn()` and assert request shape without mocking modules.
 *
 * Test surface:
 *   - AICreationService composition (delegates to inner services)
 *   - MeshyService request shape (image-to-3D, status polling,
 *     retexture, rigging) — tested via the wrapper's
 *     `getMeshyService()` accessor
 *   - Error handling: non-OK responses surface as descriptive errors
 *
 * Deep coverage of ImageGenerationService is left to a follow-up
 * cut — it has more conditional branches (gateway vs direct API)
 * that warrant their own test file.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AICreationService } from "../AICreationService.js";

// Don't shadow the prompt loader — its real implementation is fine.
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

/** Build a successful Response-like object for a JSON payload. */
function jsonResponse(body: unknown, init: { status?: number } = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json" },
  });
}

/** Build an error Response-like object with text body. */
function errorResponse(status: number, text: string) {
  return new Response(text, {
    status,
    headers: { "Content-Type": "text/plain" },
  });
}

describe("AICreationService — composition", () => {
  it("getImageService() returns the constructed ImageGenerationService", () => {
    const svc = new AICreationService({
      openai: { apiKey: "fake-openai" },
      meshy: { apiKey: "fake-meshy" },
    });
    const imageSvc = svc.getImageService();
    expect(imageSvc).toBeDefined();
    expect(typeof imageSvc.generateImage).toBe("function");
  });

  it("getMeshyService() returns the constructed MeshyService", () => {
    const svc = new AICreationService({
      openai: { apiKey: "fake-openai" },
      meshy: { apiKey: "fake-meshy" },
    });
    const meshy = svc.getMeshyService();
    expect(meshy).toBeDefined();
    expect(typeof meshy.startImageTo3D).toBe("function");
    expect(typeof meshy.getTaskStatus).toBe("function");
  });

  it("Same wrapper returns stable inner-service references", () => {
    const svc = new AICreationService({
      openai: { apiKey: "k" },
      meshy: { apiKey: "k" },
    });
    expect(svc.getImageService()).toBe(svc.getImageService());
    expect(svc.getMeshyService()).toBe(svc.getMeshyService());
  });
});

describe("AICreationService — MeshyService.startImageTo3D request shape", () => {
  it("Sends POST to /openapi/v1/image-to-3d with bearer auth + JSON body", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(jsonResponse({ task_id: "task-123" }));
    const svc = new AICreationService({
      openai: { apiKey: "k" },
      meshy: { apiKey: "meshy-key" },
      fetchFn: fetchFn as never,
    });

    const taskId = await svc
      .getMeshyService()
      .startImageTo3D("https://example.com/x.png", {
        enable_pbr: true,
        targetPolycount: 5000,
      });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toMatch(/\/openapi\/v1\/image-to-3d$/);
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer meshy-key");
    expect(init.headers["Content-Type"]).toBe("application/json");
    const body = JSON.parse(init.body);
    expect(body.image_url).toBe("https://example.com/x.png");
    expect(body.enable_pbr).toBe(true);
    expect(body.target_polycount).toBe(5000);
    // Fields with explicit defaults from the service
    expect(body.ai_model).toBe("meshy-4");
    expect(body.topology).toBe("quad");
    expect(body.texture_resolution).toBe(512);
    // Result is the normalized task id
    expect(taskId).toBe("task-123");
  });

  it("Honors custom baseUrl when supplied via config", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ task_id: "t" }));
    const svc = new AICreationService({
      openai: { apiKey: "k" },
      meshy: {
        apiKey: "k",
        baseUrl: "https://custom.meshy.example",
      },
      fetchFn: fetchFn as never,
    });

    await svc.getMeshyService().startImageTo3D("u", {});
    expect(fetchFn.mock.calls[0][0]).toBe(
      "https://custom.meshy.example/openapi/v1/image-to-3d",
    );
  });

  it("Surfaces Meshy non-OK responses as 'Meshy API error' with status + body", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(errorResponse(429, "rate limited; try later"));
    const svc = new AICreationService({
      openai: { apiKey: "k" },
      meshy: { apiKey: "k" },
      fetchFn: fetchFn as never,
    });

    await expect(svc.getMeshyService().startImageTo3D("u", {})).rejects.toThrow(
      /Meshy API error: 429.*rate limited/,
    );
  });

  it("Falls back to data.id or nested result.task_id when task_id is absent", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ id: "alt-task" }));
    const svc = new AICreationService({
      openai: { apiKey: "k" },
      meshy: { apiKey: "k" },
      fetchFn: fetchFn as never,
    });

    const taskId = await svc.getMeshyService().startImageTo3D("u", {});
    expect(taskId).toBe("alt-task");
  });
});

describe("AICreationService — MeshyService.getTaskStatus", () => {
  it("Sends GET to /openapi/v1/image-to-3d/<taskId> with bearer auth", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
        id: "t",
        status: "SUCCEEDED",
        progress: 100,
        model_urls: { glb: "https://x.glb" },
      }),
    );
    const svc = new AICreationService({
      openai: { apiKey: "k" },
      meshy: { apiKey: "meshy-key" },
      fetchFn: fetchFn as never,
    });

    const status = await svc.getMeshyService().getTaskStatus("task-123");
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toMatch(/\/openapi\/v1\/image-to-3d\/task-123$/);
    expect(init?.headers?.Authorization).toBe("Bearer meshy-key");
    expect(status.status).toBe("SUCCEEDED");
    expect(status.progress).toBe(100);
  });

  it("Surfaces non-OK status responses as 'Meshy API error'", async () => {
    const fetchFn = vi.fn().mockResolvedValue(errorResponse(500, "server"));
    const svc = new AICreationService({
      openai: { apiKey: "k" },
      meshy: { apiKey: "k" },
      fetchFn: fetchFn as never,
    });
    await expect(svc.getMeshyService().getTaskStatus("t")).rejects.toThrow(
      /Meshy API error: 500/,
    );
  });
});

describe("AICreationService — MeshyService.startRiggingTask", () => {
  it("POSTs to /openapi/v1/rigging with model_url + animation params", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(jsonResponse({ task_id: "rig-1" }));
    const svc = new AICreationService({
      openai: { apiKey: "k" },
      meshy: { apiKey: "k" },
      fetchFn: fetchFn as never,
    });

    const taskId = await svc
      .getMeshyService()
      .startRiggingTask({ modelUrl: "https://x.glb" }, {});

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toMatch(/\/openapi\/v1\/rigging$/);
    expect(init.method).toBe("POST");
    expect(taskId).toBe("rig-1");
  });
});

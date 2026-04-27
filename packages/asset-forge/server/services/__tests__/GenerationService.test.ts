/**
 * GenerationService — unit tests.
 *
 * Phase H test-coverage cut #9 (final). GenerationService is a
 * 1,560-LOC orchestrator that runs multi-stage AI asset pipelines
 * (prompt enhancement → image gen → image-to-3D → texture →
 * rigging → sprites). The full pipeline path requires deep
 * mocking of AICreationService + ImageHostingService + filesystem
 * + node-fetch, which would dominate the test surface without
 * adding signal.
 *
 * This cut targets the *observable* synchronous surface:
 *   - Construction succeeds with or without API keys (just warns)
 *   - startPipeline returns a well-formed pipelineId + initial state
 *   - getPipelineStatus throws on unknown id, returns state on hit
 *   - cleanupOldPipelines drops old completed/failed entries while
 *     keeping recent ones
 *
 * The full pipeline orchestration (processPipeline) is left for
 * integration tests where real network calls are appropriate.
 */

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

// Suppress the module-level setInterval that GenerationService
// installs (every 30min) — it would keep vitest from exiting clean.
beforeAll(() => {
  vi.useFakeTimers();
});

afterAll(() => {
  vi.useRealTimers();
});

// Stub the AssetDatabaseService side-effect import (it pulls in
// db/db → drizzle/postgres → docker-manager → util.promisify which
// jsdom can't resolve). The module exports a singleton so we mock
// the public surface only.
vi.mock("../AssetDatabaseService", () => ({
  assetDatabaseService: {
    createAsset: vi.fn().mockResolvedValue(undefined),
    updateAsset: vi.fn().mockResolvedValue(undefined),
    getAsset: vi.fn().mockResolvedValue(null),
  },
}));

// ImageHostingService and AICreationService internally try to bind
// real clients. We don't need to mock them — the constructor accepts
// empty keys and just refuses to enable. The full-pipeline path
// would fail in test, which is fine; we don't exercise it here.

import { GenerationService } from "../GenerationService.js";

const ORIGINAL_GATEWAY = process.env.AI_GATEWAY_API_KEY;
const ORIGINAL_OPENAI = process.env.OPENAI_API_KEY;
const ORIGINAL_MESHY = process.env.MESHY_API_KEY;

beforeEach(() => {
  delete process.env.AI_GATEWAY_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.MESHY_API_KEY;
});

afterEach(() => {
  if (ORIGINAL_GATEWAY === undefined) delete process.env.AI_GATEWAY_API_KEY;
  else process.env.AI_GATEWAY_API_KEY = ORIGINAL_GATEWAY;
  if (ORIGINAL_OPENAI === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = ORIGINAL_OPENAI;
  if (ORIGINAL_MESHY === undefined) delete process.env.MESHY_API_KEY;
  else process.env.MESHY_API_KEY = ORIGINAL_MESHY;
});

/** Build a minimal pipeline config the service accepts without throwing. */
function makeConfig(overrides: Record<string, unknown> = {}) {
  return {
    description: "test asset",
    assetId: "asset-1",
    name: "Test Asset",
    type: "prop",
    subtype: "weapon",
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("GenerationService — construction", () => {
  it("Constructs successfully with no API keys (warns but does not throw)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    expect(() => new GenerationService()).not.toThrow();
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/Missing API keys/),
    );

    warn.mockRestore();
    log.mockRestore();
  });

  it("Constructs successfully when keys are present (no warn)", () => {
    process.env.AI_GATEWAY_API_KEY = "k";
    process.env.MESHY_API_KEY = "m";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    expect(() => new GenerationService()).not.toThrow();
    // The "Missing API keys" warning should NOT fire.
    const calls = warn.mock.calls.flat().join(" ");
    expect(calls).not.toMatch(/Missing API keys/);

    warn.mockRestore();
    log.mockRestore();
  });
});

describe("GenerationService — startPipeline", () => {
  it("Returns a pipelineId in 'pipeline-<ts>-<rand>' format", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const svc = new GenerationService();
    const result = await svc.startPipeline(makeConfig());

    expect(result.pipelineId).toMatch(/^pipeline-\d+-[a-z0-9]+$/);
    expect(typeof result.status).toBe("string");
    expect(result.message).toBe("Pipeline started successfully");

    log.mockRestore();
    warn.mockRestore();
    errorSpy.mockRestore();
  });

  it("Pipeline appears in getPipelineStatus immediately after start", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const svc = new GenerationService();
    const { pipelineId } = await svc.startPipeline(makeConfig());

    const status = await svc.getPipelineStatus(pipelineId);
    expect(status.id).toBe(pipelineId);
    expect(typeof status.status).toBe("string");
    expect(status.stages).toBeDefined();
    expect(status.stages.textInput.status).toBe("completed");
    expect(status.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    log.mockRestore();
    warn.mockRestore();
    errorSpy.mockRestore();
  });

  it("Adds a 'rigging' stage when generationType=avatar AND enableRigging", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const svc = new GenerationService();
    const { pipelineId } = await svc.startPipeline(
      makeConfig({ generationType: "avatar", enableRigging: true }),
    );

    const status = await svc.getPipelineStatus(pipelineId);
    expect((status.stages as Record<string, unknown>).rigging).toBeDefined();

    log.mockRestore();
    warn.mockRestore();
    errorSpy.mockRestore();
  });

  it("Adds a 'spriteGeneration' stage when enableSprites is true", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const svc = new GenerationService();
    const { pipelineId } = await svc.startPipeline(
      makeConfig({ enableSprites: true }),
    );

    const status = await svc.getPipelineStatus(pipelineId);
    expect(
      (status.stages as Record<string, unknown>).spriteGeneration,
    ).toBeDefined();

    log.mockRestore();
    warn.mockRestore();
    errorSpy.mockRestore();
  });

  it("Each startPipeline call creates a distinct pipelineId", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const svc = new GenerationService();
    const a = await svc.startPipeline(makeConfig());
    const b = await svc.startPipeline(makeConfig());
    expect(a.pipelineId).not.toBe(b.pipelineId);

    log.mockRestore();
    warn.mockRestore();
    errorSpy.mockRestore();
  });
});

describe("GenerationService — getPipelineStatus", () => {
  it("Throws 'Pipeline ... not found' for unknown id", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const svc = new GenerationService();
    await expect(svc.getPipelineStatus("nonexistent")).rejects.toThrow(
      /Pipeline nonexistent not found/,
    );

    log.mockRestore();
    warn.mockRestore();
  });
});

describe("GenerationService — cleanupOldPipelines", () => {
  it("Drops completed pipelines older than 1 hour", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const svc = new GenerationService();

    // Force a fake "old completed" pipeline directly into the
    // private map so we don't need to wait for real time to pass.
    const fakeOld = {
      id: "old-1",
      config: makeConfig(),
      status: "completed",
      progress: 100,
      stages: {},
      results: {},
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    };
    const fakeRecent = {
      id: "recent-1",
      config: makeConfig(),
      status: "completed",
      progress: 100,
      stages: {},
      results: {},
      createdAt: new Date().toISOString(),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pipelines = (svc as any).activePipelines as Map<string, unknown>;
    pipelines.set("old-1", fakeOld);
    pipelines.set("recent-1", fakeRecent);

    svc.cleanupOldPipelines();

    expect(pipelines.has("old-1")).toBe(false);
    expect(pipelines.has("recent-1")).toBe(true);

    log.mockRestore();
    warn.mockRestore();
    errorSpy.mockRestore();
  });

  it("Drops failed pipelines older than 1 hour", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const svc = new GenerationService();
    const fakeOld = {
      id: "old-failed",
      config: makeConfig(),
      status: "failed",
      progress: 0,
      stages: {},
      results: {},
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      error: "test failure",
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pipelines = (svc as any).activePipelines as Map<string, unknown>;
    pipelines.set("old-failed", fakeOld);

    svc.cleanupOldPipelines();
    expect(pipelines.has("old-failed")).toBe(false);

    log.mockRestore();
    warn.mockRestore();
  });

  it("Preserves still-running pipelines even when older than 1 hour", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const svc = new GenerationService();
    const fakeOldRunning = {
      id: "old-running",
      config: makeConfig(),
      status: "processing",
      progress: 50,
      stages: {},
      results: {},
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pipelines = (svc as any).activePipelines as Map<string, unknown>;
    pipelines.set("old-running", fakeOldRunning);

    svc.cleanupOldPipelines();
    // Still running — must not be dropped.
    expect(pipelines.has("old-running")).toBe(true);

    log.mockRestore();
    warn.mockRestore();
  });

  it("No-op when there are no pipelines to clean", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const svc = new GenerationService();
    expect(() => svc.cleanupOldPipelines()).not.toThrow();

    log.mockRestore();
    warn.mockRestore();
  });
});

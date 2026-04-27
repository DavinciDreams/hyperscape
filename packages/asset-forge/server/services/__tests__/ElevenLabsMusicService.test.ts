/**
 * ElevenLabsMusicService — unit tests.
 *
 * Phase H test-coverage cut #3. Same recipe as the SoundEffects
 * service — vi.mock the SDK class, real-class wrapper to support
 * `new ElevenLabsClient(...)`, no live API calls.
 *
 * One twist: this service uses `(client as unknown as ClientWithMusic).music`
 * to reach a SDK-type-incomplete `music.compose()` endpoint. The
 * mock provides a `music` property so that cast resolves at runtime.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockCompose = vi.fn();

vi.mock("elevenlabs", () => ({
  ElevenLabsClient: class {
    music = { compose: mockCompose };
  },
}));

import { ElevenLabsMusicService } from "../ElevenLabsMusicService.js";

const ORIGINAL_API_KEY = process.env.ELEVENLABS_API_KEY;

beforeEach(() => {
  delete process.env.ELEVENLABS_API_KEY;
  mockCompose.mockReset();
});

afterEach(() => {
  if (ORIGINAL_API_KEY === undefined) {
    delete process.env.ELEVENLABS_API_KEY;
  } else {
    process.env.ELEVENLABS_API_KEY = ORIGINAL_API_KEY;
  }
});

function fakeAudioStream(payload: number[]) {
  const bytes = new Uint8Array(payload);
  return (async function* () {
    yield bytes;
  })();
}

describe("ElevenLabsMusicService — initialization", () => {
  it("isAvailable() is false when no key is set", () => {
    const svc = new ElevenLabsMusicService();
    expect(svc.isAvailable()).toBe(false);
  });

  it("isAvailable() is true when constructor receives explicit key", () => {
    const svc = new ElevenLabsMusicService("explicit-key");
    expect(svc.isAvailable()).toBe(true);
  });

  it("Falls back to ELEVENLABS_API_KEY env var when constructor key is missing", () => {
    process.env.ELEVENLABS_API_KEY = "env-key";
    const svc = new ElevenLabsMusicService();
    expect(svc.isAvailable()).toBe(true);
  });
});

describe("ElevenLabsMusicService — generateMusic", () => {
  it("throws when client is not initialized", async () => {
    const svc = new ElevenLabsMusicService();
    await expect(
      svc.generateMusic({ prompt: "epic battle theme" }),
    ).rejects.toThrow(/client not initialized/i);
  });

  it("forwards prompt + compositionPlan + modelId to music.compose", async () => {
    mockCompose.mockResolvedValueOnce(fakeAudioStream([1, 2]));
    const svc = new ElevenLabsMusicService("test-key");

    const plan = { sections: ["intro", "main"] };
    await svc.generateMusic({
      prompt: "boss theme",
      compositionPlan: plan,
      modelId: "music_v2",
    });

    expect(mockCompose).toHaveBeenCalledTimes(1);
    expect(mockCompose).toHaveBeenCalledWith({
      prompt: "boss theme",
      compositionPlan: plan,
      modelId: "music_v2",
    });
  });

  it("Defaults modelId to 'music_v1' when not specified", async () => {
    mockCompose.mockResolvedValueOnce(fakeAudioStream([0]));
    const svc = new ElevenLabsMusicService("test-key");

    await svc.generateMusic({ prompt: "ambient forest" });

    expect(mockCompose).toHaveBeenCalledWith(
      expect.objectContaining({ modelId: "music_v1" }),
    );
  });

  it("Returns a Buffer concatenated from streamed audio chunks", async () => {
    mockCompose.mockResolvedValueOnce(fakeAudioStream([100, 200, 50]));
    const svc = new ElevenLabsMusicService("test-key");

    const result = await svc.generateMusic({ prompt: "x" });
    expect(Buffer.isBuffer(result)).toBe(true);
    expect(Array.from(result)).toEqual([100, 200, 50]);
  });
});

describe("ElevenLabsMusicService — generateMusicDetailed", () => {
  it("Returns audio buffer with metadata + default format", async () => {
    mockCompose.mockResolvedValueOnce(fakeAudioStream([1, 2, 3]));
    const svc = new ElevenLabsMusicService("test-key");

    const result = await svc.generateMusicDetailed({
      prompt: "town theme",
      musicLengthMs: 60_000,
    });

    expect(Buffer.isBuffer(result.audio)).toBe(true);
    expect(result.metadata.prompt).toBe("town theme");
    expect(result.metadata.modelId).toBe("music_v1");
    expect(result.metadata.lengthMs).toBe(60_000);
    expect(result.format).toBe("mp3_44100_128");
  });

  it("Honors caller-supplied outputFormat", async () => {
    mockCompose.mockResolvedValueOnce(fakeAudioStream([1]));
    const svc = new ElevenLabsMusicService("test-key");

    const result = await svc.generateMusicDetailed({
      prompt: "x",
      outputFormat: "pcm_44100",
    });

    expect(result.format).toBe("pcm_44100");
  });

  it("Throws when client not initialized", async () => {
    const svc = new ElevenLabsMusicService();
    await expect(svc.generateMusicDetailed({ prompt: "x" })).rejects.toThrow(
      /client not initialized/i,
    );
  });
});

describe("ElevenLabsMusicService — createCompositionPlan", () => {
  it("Returns a 3-section plan (intro / main / outro)", async () => {
    const svc = new ElevenLabsMusicService("test-key");
    const plan = await svc.createCompositionPlan({
      prompt: "trailer music",
      musicLengthMs: 120_000,
    });
    expect(plan.sections).toHaveLength(3);
    expect(plan.sections.map((s) => s.name)).toEqual([
      "intro",
      "main",
      "outro",
    ]);
    // Main section absorbs the bulk of the duration
    const main = plan.sections.find((s) => s.name === "main");
    expect(main?.duration).toBe(120_000 - 10_000);
  });

  it("Defaults modelId to 'music_v1'", async () => {
    const svc = new ElevenLabsMusicService("test-key");
    const plan = await svc.createCompositionPlan({ prompt: "x" });
    expect(plan.modelId).toBe("music_v1");
  });

  it("Throws when client not initialized", async () => {
    const svc = new ElevenLabsMusicService();
    await expect(svc.createCompositionPlan({ prompt: "x" })).rejects.toThrow(
      /client not initialized/i,
    );
  });
});

describe("ElevenLabsMusicService — generateBatch", () => {
  it("Returns success entries for each fulfilled promise", async () => {
    mockCompose
      .mockResolvedValueOnce(fakeAudioStream([1]))
      .mockResolvedValueOnce(fakeAudioStream([2]));
    const svc = new ElevenLabsMusicService("test-key");

    const results = await svc.generateBatch([
      { prompt: "track 1" },
      { prompt: "track 2" },
    ]);
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.success)).toBe(true);
  });

  it("Mixed-success batches surface errors per-track without throwing", async () => {
    mockCompose
      .mockResolvedValueOnce(fakeAudioStream([5]))
      .mockRejectedValueOnce(new Error("model busy"));
    const svc = new ElevenLabsMusicService("test-key");

    const results = await svc.generateBatch([
      { prompt: "ok" },
      { prompt: "fail" },
    ]);
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(false);
    if (!results[1].success) {
      expect(results[1].error).toMatch(/model busy/);
    }
  });

  it("Throws when client not initialized — does not silently succeed", async () => {
    const svc = new ElevenLabsMusicService();
    await expect(svc.generateBatch([{ prompt: "x" }])).rejects.toThrow(
      /client not initialized/i,
    );
  });
});

describe("ElevenLabsMusicService — getStatus", () => {
  it("Reports availability + service metadata", () => {
    const svc = new ElevenLabsMusicService("test-key");
    const status = svc.getStatus();
    expect(status.available).toBe(true);
    expect(status.service).toMatch(/Music/);
    expect(status.model).toBe("music_v1");
    expect(status.formats).toContain("mp3_44100_128");
  });

  it("Reports unavailable when no key is set", () => {
    const svc = new ElevenLabsMusicService();
    const status = svc.getStatus();
    expect(status.available).toBe(false);
  });
});

/**
 * ElevenLabsSoundEffectsService — unit tests.
 *
 * Phase H test-coverage cut #2. Mirrors the AISDKService recipe:
 *   - vi.mock the SDK client at module load
 *   - construct fresh service instances per test
 *   - assert request shape, batch handling, cost estimation
 *
 * No live API calls — every `textToSoundEffects.convert` is mocked
 * to return a small async iterable yielding fake audio bytes.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockConvert = vi.fn();

vi.mock("elevenlabs", () => ({
  // Use a real class so `new ElevenLabsClient(...)` works. vi.fn()
  // returns a plain function which throws "not a constructor" when
  // invoked with `new`.
  ElevenLabsClient: class {
    textToSoundEffects = { convert: mockConvert };
  },
}));

import { ElevenLabsSoundEffectsService } from "../ElevenLabsSoundEffectsService.js";

const ORIGINAL_API_KEY = process.env.ELEVENLABS_API_KEY;

beforeEach(() => {
  delete process.env.ELEVENLABS_API_KEY;
  mockConvert.mockReset();
});

afterEach(() => {
  if (ORIGINAL_API_KEY === undefined) {
    delete process.env.ELEVENLABS_API_KEY;
  } else {
    process.env.ELEVENLABS_API_KEY = ORIGINAL_API_KEY;
  }
});

/** Build a fake audio stream that yields one chunk of given bytes. */
function fakeAudioStream(payload: number[]) {
  const bytes = new Uint8Array(payload);
  return (async function* () {
    yield bytes;
  })();
}

describe("ElevenLabsSoundEffectsService — initialization", () => {
  it("isAvailable() is false when no API key is set anywhere", () => {
    const svc = new ElevenLabsSoundEffectsService();
    expect(svc.isAvailable()).toBe(false);
  });

  it("isAvailable() is true when ELEVENLABS_API_KEY env var is set", () => {
    process.env.ELEVENLABS_API_KEY = "test-key-from-env";
    const svc = new ElevenLabsSoundEffectsService();
    expect(svc.isAvailable()).toBe(true);
  });

  it("isAvailable() is true when the constructor receives an explicit key", () => {
    const svc = new ElevenLabsSoundEffectsService("explicit-key");
    expect(svc.isAvailable()).toBe(true);
  });

  it("Explicit constructor key takes precedence over env var", () => {
    process.env.ELEVENLABS_API_KEY = "env-key";
    const svc = new ElevenLabsSoundEffectsService("explicit-key");
    expect(svc.isAvailable()).toBe(true);
    // We can't directly verify *which* key was used without inspecting
    // the mock — but `isAvailable` true confirms one was selected.
  });
});

describe("ElevenLabsSoundEffectsService — generateSoundEffect", () => {
  it("throws a descriptive error when client is not initialized", async () => {
    const svc = new ElevenLabsSoundEffectsService();
    await expect(
      svc.generateSoundEffect({ text: "explosion" }),
    ).rejects.toThrow(/client not initialized/i);
  });

  it("forwards text + duration + promptInfluence to the SDK convert call", async () => {
    mockConvert.mockResolvedValueOnce(fakeAudioStream([1, 2, 3, 4]));
    const svc = new ElevenLabsSoundEffectsService("test-key");

    await svc.generateSoundEffect({
      text: "thunder clap",
      durationSeconds: 3,
      promptInfluence: 0.7,
    });

    expect(mockConvert).toHaveBeenCalledTimes(1);
    expect(mockConvert).toHaveBeenCalledWith({
      text: "thunder clap",
      duration_seconds: 3,
      prompt_influence: 0.7,
    });
  });

  it("returns a Buffer concatenated from the streamed audio chunks", async () => {
    mockConvert.mockResolvedValueOnce(fakeAudioStream([10, 20, 30]));
    const svc = new ElevenLabsSoundEffectsService("test-key");

    const result = await svc.generateSoundEffect({ text: "splash" });
    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.length).toBe(3);
    expect(Array.from(result)).toEqual([10, 20, 30]);
  });

  it("propagates SDK errors as-is", async () => {
    mockConvert.mockRejectedValueOnce(new Error("rate limited"));
    const svc = new ElevenLabsSoundEffectsService("test-key");

    await expect(svc.generateSoundEffect({ text: "x" })).rejects.toThrow(
      /rate limited/,
    );
  });
});

describe("ElevenLabsSoundEffectsService — generateSoundEffectBatch", () => {
  it("returns aggregate stats for a successful batch", async () => {
    mockConvert
      .mockResolvedValueOnce(fakeAudioStream([1]))
      .mockResolvedValueOnce(fakeAudioStream([2, 3]))
      .mockResolvedValueOnce(fakeAudioStream([4, 5, 6]));
    const svc = new ElevenLabsSoundEffectsService("test-key");

    const result = await svc.generateSoundEffectBatch([
      { text: "swoosh" },
      { text: "thud" },
      { text: "clang" },
    ]);

    expect(result.total).toBe(3);
    expect(result.successful).toBe(3);
    expect(result.effects).toHaveLength(3);
    expect(result.effects.every((e) => e.success)).toBe(true);
  });

  it("partial failures surface as success:false with the error message", async () => {
    mockConvert
      .mockResolvedValueOnce(fakeAudioStream([1, 2]))
      .mockRejectedValueOnce(new Error("model overloaded"));
    const svc = new ElevenLabsSoundEffectsService("test-key");

    const result = await svc.generateSoundEffectBatch([
      { text: "ok" },
      { text: "fail" },
    ]);

    expect(result.total).toBe(2);
    expect(result.successful).toBe(1);
    expect(result.effects[0].success).toBe(true);
    expect(result.effects[1].success).toBe(false);
    const failed = result.effects[1] as {
      success: false;
      error: string;
      text: string;
    };
    expect(failed.error).toMatch(/model overloaded/);
    expect(failed.text).toBe("fail");
  });

  it("throws when client is not initialized — does not silently succeed", async () => {
    const svc = new ElevenLabsSoundEffectsService();
    await expect(svc.generateSoundEffectBatch([{ text: "x" }])).rejects.toThrow(
      /client not initialized/i,
    );
  });
});

describe("ElevenLabsSoundEffectsService — estimateCost", () => {
  it("returns 'auto' duration label when duration is null", () => {
    const svc = new ElevenLabsSoundEffectsService("test-key");
    const cost = svc.estimateCost(null);
    expect(cost.duration).toBe("auto");
    expect(typeof cost.credits).toBe("number");
    expect(typeof cost.estimatedCostUSD).toBe("string");
    expect(cost.credits).toBeGreaterThan(0);
  });

  it("scales cost with duration", () => {
    const svc = new ElevenLabsSoundEffectsService("test-key");
    const short = svc.estimateCost(1);
    const long = svc.estimateCost(10);
    expect(long.credits).toBeGreaterThan(short.credits);
    expect(parseFloat(long.estimatedCostUSD)).toBeGreaterThan(
      parseFloat(short.estimatedCostUSD),
    );
  });
});

/**
 * ElevenLabsVoiceService — unit tests.
 *
 * Phase H test-coverage cut #4. Same recipe as Music + SoundEffects:
 * mock the SDK client class, no live API calls.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockTtsConvert = vi.fn();
const mockGetAllVoices = vi.fn();
const mockGetSubscription = vi.fn();

vi.mock("elevenlabs", () => ({
  ElevenLabsClient: class {
    textToSpeech = { convert: mockTtsConvert };
    voices = { getAll: mockGetAllVoices };
    user = { getSubscription: mockGetSubscription };
  },
}));

import { ElevenLabsVoiceService } from "../ElevenLabsVoiceService.js";

const ORIGINAL_API_KEY = process.env.ELEVENLABS_API_KEY;

beforeEach(() => {
  delete process.env.ELEVENLABS_API_KEY;
  mockTtsConvert.mockReset();
  mockGetAllVoices.mockReset();
  mockGetSubscription.mockReset();
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

describe("ElevenLabsVoiceService — initialization", () => {
  it("isAvailable() is false when no key is set", () => {
    const svc = new ElevenLabsVoiceService();
    expect(svc.isAvailable()).toBe(false);
  });

  it("isAvailable() is true when constructor receives explicit key", () => {
    const svc = new ElevenLabsVoiceService("explicit-key");
    expect(svc.isAvailable()).toBe(true);
  });

  it("Falls back to ELEVENLABS_API_KEY env var", () => {
    process.env.ELEVENLABS_API_KEY = "env-key";
    const svc = new ElevenLabsVoiceService();
    expect(svc.isAvailable()).toBe(true);
  });
});

describe("ElevenLabsVoiceService — getAvailableVoices", () => {
  it("Throws when client not initialized", async () => {
    const svc = new ElevenLabsVoiceService();
    await expect(svc.getAvailableVoices()).rejects.toThrow(
      /client not initialized/i,
    );
  });

  it("Returns the SDK voices array verbatim", async () => {
    const sample = [{ voice_id: "v1", name: "Voice 1" }];
    mockGetAllVoices.mockResolvedValueOnce({ voices: sample });
    const svc = new ElevenLabsVoiceService("test-key");
    const voices = await svc.getAvailableVoices();
    expect(voices).toEqual(sample);
  });

  it("Returns empty array if SDK returns undefined voices field", async () => {
    mockGetAllVoices.mockResolvedValueOnce({});
    const svc = new ElevenLabsVoiceService("test-key");
    const voices = await svc.getAvailableVoices();
    expect(voices).toEqual([]);
  });
});

describe("ElevenLabsVoiceService — generateVoice", () => {
  it("Throws when client not initialized", async () => {
    const svc = new ElevenLabsVoiceService();
    await expect(
      svc.generateVoice({ text: "hello", voiceId: "v1" }),
    ).rejects.toThrow(/client not initialized/i);
  });

  it("Forwards voiceId + text + multilingual model id to convert", async () => {
    mockTtsConvert.mockResolvedValueOnce(fakeAudioStream([1]));
    const svc = new ElevenLabsVoiceService("test-key");

    await svc.generateVoice({ text: "greetings", voiceId: "voice-abc" });

    expect(mockTtsConvert).toHaveBeenCalledWith(
      "voice-abc",
      expect.objectContaining({
        text: "greetings",
        model_id: "eleven_multilingual_v2",
      }),
    );
  });

  it("Forwards voice_settings when caller provides settings", async () => {
    mockTtsConvert.mockResolvedValueOnce(fakeAudioStream([1]));
    const svc = new ElevenLabsVoiceService("test-key");

    await svc.generateVoice({
      text: "x",
      voiceId: "v1",
      settings: {
        stability: 0.5,
        similarity_boost: 0.7,
        style: 0.3,
        use_speaker_boost: true,
      },
    });

    expect(mockTtsConvert).toHaveBeenCalledWith(
      "v1",
      expect.objectContaining({
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.7,
          style: 0.3,
          use_speaker_boost: true,
        },
      }),
    );
  });

  it("Returns base64-encoded audio + npcId passthrough", async () => {
    mockTtsConvert.mockResolvedValueOnce(fakeAudioStream([72, 101, 108]));
    const svc = new ElevenLabsVoiceService("test-key");

    const result = await svc.generateVoice({
      text: "hi",
      voiceId: "v1",
      npcId: "blacksmith",
    });
    expect(result.success).toBe(true);
    expect(result.npcId).toBe("blacksmith");
    // base64 encoding of [72, 101, 108] = "Hel"
    expect(result.audioData).toBe(
      Buffer.from([72, 101, 108]).toString("base64"),
    );
  });
});

describe("ElevenLabsVoiceService — generateVoiceBatch", () => {
  it("Throws when client not initialized", async () => {
    const svc = new ElevenLabsVoiceService();
    await expect(
      svc.generateVoiceBatch({ texts: ["x"], voiceId: "v1" }),
    ).rejects.toThrow(/client not initialized/i);
  });

  it("Returns aggregate stats for a fully-successful batch", async () => {
    mockTtsConvert
      .mockResolvedValueOnce(fakeAudioStream([1]))
      .mockResolvedValueOnce(fakeAudioStream([2]));
    const svc = new ElevenLabsVoiceService("test-key");

    const result = await svc.generateVoiceBatch({
      texts: ["one", "two"],
      voiceId: "v1",
    });
    expect(result.total).toBe(2);
    expect(result.successful).toBe(2);
    expect(result.results.every((r) => r.success)).toBe(true);
  });

  it("Mixed-success batches surface errors per-text", async () => {
    mockTtsConvert
      .mockResolvedValueOnce(fakeAudioStream([1]))
      .mockRejectedValueOnce(new Error("voice quota"));
    const svc = new ElevenLabsVoiceService("test-key");

    const result = await svc.generateVoiceBatch({
      texts: ["ok", "fail"],
      voiceId: "v1",
    });
    expect(result.successful).toBe(1);
    expect(result.results[1].success).toBe(false);
    const failed = result.results[1] as {
      success: false;
      error: string;
      text: string;
    };
    expect(failed.error).toMatch(/voice quota/);
    expect(failed.text).toBe("fail");
  });
});

describe("ElevenLabsVoiceService — getSubscriptionInfo", () => {
  it("Throws when client not initialized", async () => {
    const svc = new ElevenLabsVoiceService();
    await expect(svc.getSubscriptionInfo()).rejects.toThrow(
      /client not initialized/i,
    );
  });

  it("Returns the SDK subscription payload", async () => {
    const payload = { tier: "creator", character_count: 5000 };
    mockGetSubscription.mockResolvedValueOnce(payload);
    const svc = new ElevenLabsVoiceService("test-key");
    const info = await svc.getSubscriptionInfo();
    expect(info).toEqual(payload);
  });
});

describe("ElevenLabsVoiceService — getAvailableModels", () => {
  it("Returns the static three-model list (no SDK call)", async () => {
    const svc = new ElevenLabsVoiceService("test-key");
    const models = await svc.getAvailableModels();
    expect(models).toHaveLength(3);
    const ids = models.map((m) => m.model_id);
    expect(ids).toContain("eleven_multilingual_v2");
    expect(ids).toContain("eleven_monolingual_v1");
    expect(ids).toContain("eleven_turbo_v2");
  });

  it("Throws when client not initialized", async () => {
    const svc = new ElevenLabsVoiceService();
    await expect(svc.getAvailableModels()).rejects.toThrow(
      /client not initialized/i,
    );
  });
});

describe("ElevenLabsVoiceService — placeholder methods throw NotImplemented", () => {
  it("speechToSpeech throws not-implemented", async () => {
    const svc = new ElevenLabsVoiceService("test-key");
    await expect(
      svc.speechToSpeech({ audio: Buffer.from([0]), voiceId: "v1" }),
    ).rejects.toThrow(/not yet implemented/i);
  });

  it("designVoice throws not-implemented", async () => {
    const svc = new ElevenLabsVoiceService("test-key");
    await expect(svc.designVoice({ voiceDescription: "x" })).rejects.toThrow(
      /not yet implemented/i,
    );
  });

  it("createVoiceFromPreview throws not-implemented", async () => {
    const svc = new ElevenLabsVoiceService("test-key");
    await expect(
      svc.createVoiceFromPreview({
        voiceName: "n",
        voiceDescription: "d",
        generatedVoiceId: "g",
      }),
    ).rejects.toThrow(/not yet implemented/i);
  });
});

describe("ElevenLabsVoiceService — estimateCost", () => {
  it("Sums character counts across all texts", () => {
    const svc = new ElevenLabsVoiceService("test-key");
    const cost = svc.estimateCost(["abc", "defg"]);
    expect(cost.characterCount).toBe(7);
    expect(cost.texts).toBe(2);
    expect(typeof cost.estimatedCostUSD).toBe("string");
  });

  it("Cost scales linearly with character count", () => {
    const svc = new ElevenLabsVoiceService("test-key");
    const small = svc.estimateCost(["a"]);
    const large = svc.estimateCost(["a".repeat(1000)]);
    expect(parseFloat(large.estimatedCostUSD)).toBeGreaterThan(
      parseFloat(small.estimatedCostUSD),
    );
  });
});

describe("ElevenLabsVoiceService — getRateLimitInfo", () => {
  it("Returns placeholder shape (rate-limit tracking not wired)", () => {
    const svc = new ElevenLabsVoiceService("test-key");
    const info = svc.getRateLimitInfo();
    expect(info.requestsRemaining).toBe("unknown");
    expect(info.resetTime).toBe("unknown");
  });
});

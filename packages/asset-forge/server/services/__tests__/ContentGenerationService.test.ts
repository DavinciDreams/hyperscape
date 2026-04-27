/**
 * ContentGenerationService — unit tests.
 *
 * Phase H test-coverage cut #8. ContentGenerationService is a
 * generation pipeline that uses Vercel AI SDK's `generateText`
 * (raw-text variant, no schema) and parses JSON out of the
 * response. Mocks `ai.generateText` via vi.hoisted.
 *
 * Test surface:
 *   - isEnabled reflects AI_GATEWAY_API_KEY
 *   - All four generate* methods throw a descriptive error when
 *     not enabled
 *   - Model selection by quality tier
 *   - JSON-response parsing including markdown-fenced ` ```json `
 *     blocks, plain ` ``` ` fences, and bare JSON
 *   - Parser rejects malformed responses
 *   - generateNPC injects an id + metadata + archetype tag
 *   - generateQuest, generateLore, generateDialogue happy paths
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockGenerateText } = vi.hoisted(() => ({
  mockGenerateText: vi.fn(),
}));

vi.mock("ai", () => ({
  generateText: mockGenerateText,
}));

import { ContentGenerationService } from "../ContentGenerationService.js";

const ORIGINAL_GATEWAY_KEY = process.env.AI_GATEWAY_API_KEY;

beforeEach(() => {
  delete process.env.AI_GATEWAY_API_KEY;
  mockGenerateText.mockReset();
});

afterEach(() => {
  if (ORIGINAL_GATEWAY_KEY === undefined) {
    delete process.env.AI_GATEWAY_API_KEY;
  } else {
    process.env.AI_GATEWAY_API_KEY = ORIGINAL_GATEWAY_KEY;
  }
});

function fakeText(raw: string) {
  return { text: raw };
}

describe("ContentGenerationService — initialization", () => {
  it("isEnabled is false when AI_GATEWAY_API_KEY is missing", () => {
    const svc = new ContentGenerationService();
    expect(svc.isEnabled).toBe(false);
  });

  it("isEnabled is true when AI_GATEWAY_API_KEY is present", () => {
    process.env.AI_GATEWAY_API_KEY = "test-key";
    const svc = new ContentGenerationService();
    expect(svc.isEnabled).toBe(true);
  });
});

describe("ContentGenerationService — generate methods throw when disabled", () => {
  it("generateDialogue throws AI_GATEWAY_API_KEY error", async () => {
    const svc = new ContentGenerationService();
    await expect(
      svc.generateDialogue({ npcName: "n", npcPersonality: "p" }),
    ).rejects.toThrow(/AI_GATEWAY_API_KEY required/);
  });

  it("generateNPC throws AI_GATEWAY_API_KEY error", async () => {
    const svc = new ContentGenerationService();
    await expect(
      svc.generateNPC({ archetype: "a", prompt: "p" }),
    ).rejects.toThrow(/AI_GATEWAY_API_KEY required/);
  });

  it("generateQuest throws AI_GATEWAY_API_KEY error", async () => {
    const svc = new ContentGenerationService();
    await expect(
      svc.generateQuest({ questType: "fetch", difficulty: "easy" }),
    ).rejects.toThrow(/AI_GATEWAY_API_KEY required/);
  });

  it("generateLore throws AI_GATEWAY_API_KEY error", async () => {
    const svc = new ContentGenerationService();
    await expect(
      svc.generateLore({ topic: "world history", scope: "kingdom" }),
    ).rejects.toThrow(/AI_GATEWAY_API_KEY required/);
  });
});

describe("ContentGenerationService — generateDialogue", () => {
  it("Calls generateText with quality model + temperature 0.8 + prompt", async () => {
    process.env.AI_GATEWAY_API_KEY = "k";
    mockGenerateText.mockResolvedValueOnce(
      fakeText('[{"id":"n1","text":"Hello"}]'),
    );
    const svc = new ContentGenerationService();

    await svc.generateDialogue({
      npcName: "Garrick",
      npcPersonality: "gruff blacksmith",
      quality: "speed",
    });

    expect(mockGenerateText).toHaveBeenCalledTimes(1);
    const args = mockGenerateText.mock.calls[0][0];
    expect(args.model).toBe("openai/gpt-5-mini");
    expect(args.temperature).toBe(0.8);
    expect(typeof args.prompt).toBe("string");
    expect(args.prompt).toContain("Garrick");
    expect(args.prompt).toContain("gruff blacksmith");
  });

  it("Defaults to 'speed' quality tier when caller does not specify", async () => {
    process.env.AI_GATEWAY_API_KEY = "k";
    mockGenerateText.mockResolvedValueOnce(fakeText("[]"));
    const svc = new ContentGenerationService();

    await svc.generateDialogue({ npcName: "x", npcPersonality: "y" });

    expect(mockGenerateText.mock.calls[0][0].model).toBe("openai/gpt-5-mini");
  });

  it("Parses bare-JSON response into nodes array", async () => {
    process.env.AI_GATEWAY_API_KEY = "k";
    mockGenerateText.mockResolvedValueOnce(
      fakeText('[{"id":"n1","text":"Hi"},{"id":"n2","text":"Bye"}]'),
    );
    const svc = new ContentGenerationService();

    const result = await svc.generateDialogue({
      npcName: "x",
      npcPersonality: "y",
    });
    expect(result.nodes).toHaveLength(2);
    expect(result.nodes[0]).toEqual({ id: "n1", text: "Hi" });
  });

  it("Parses markdown-fenced ```json response", async () => {
    process.env.AI_GATEWAY_API_KEY = "k";
    mockGenerateText.mockResolvedValueOnce(
      fakeText('```json\n[{"id":"n1","text":"Hi"}]\n```'),
    );
    const svc = new ContentGenerationService();

    const result = await svc.generateDialogue({
      npcName: "x",
      npcPersonality: "y",
    });
    expect(result.nodes).toEqual([{ id: "n1", text: "Hi" }]);
  });

  it("Parses plain ``` ``` fence response", async () => {
    process.env.AI_GATEWAY_API_KEY = "k";
    mockGenerateText.mockResolvedValueOnce(
      fakeText('```\n[{"id":"n1","text":"x"}]\n```'),
    );
    const svc = new ContentGenerationService();

    const result = await svc.generateDialogue({
      npcName: "x",
      npcPersonality: "y",
    });
    expect(result.nodes).toEqual([{ id: "n1", text: "x" }]);
  });

  it("Wraps single-object response into an array", async () => {
    process.env.AI_GATEWAY_API_KEY = "k";
    mockGenerateText.mockResolvedValueOnce(
      fakeText('{"id":"only","text":"Solo"}'),
    );
    const svc = new ContentGenerationService();

    const result = await svc.generateDialogue({
      npcName: "x",
      npcPersonality: "y",
    });
    expect(result.nodes).toEqual([{ id: "only", text: "Solo" }]);
  });

  it("Throws 'Invalid JSON response' on malformed AI output", async () => {
    process.env.AI_GATEWAY_API_KEY = "k";
    mockGenerateText.mockResolvedValueOnce(fakeText("not json at all"));
    const svc = new ContentGenerationService();

    await expect(
      svc.generateDialogue({ npcName: "x", npcPersonality: "y" }),
    ).rejects.toThrow(/Invalid JSON response/);
  });

  it("Returns the raw response alongside parsed nodes", async () => {
    process.env.AI_GATEWAY_API_KEY = "k";
    const raw = '[{"id":"n1","text":"Hi"}]';
    mockGenerateText.mockResolvedValueOnce(fakeText(raw));
    const svc = new ContentGenerationService();

    const result = await svc.generateDialogue({
      npcName: "x",
      npcPersonality: "y",
    });
    expect(result.rawResponse).toBe(raw);
  });
});

describe("ContentGenerationService — generateNPC", () => {
  it("Defaults to 'quality' tier", async () => {
    process.env.AI_GATEWAY_API_KEY = "k";
    mockGenerateText.mockResolvedValueOnce(
      fakeText('{"name":"Garrick","archetype":"warrior"}'),
    );
    const svc = new ContentGenerationService();

    await svc.generateNPC({ archetype: "warrior", prompt: "noble fighter" });
    expect(mockGenerateText.mock.calls[0][0].model).toBe("openai/gpt-5");
  });

  it("Injects id + metadata + archetype into the result", async () => {
    process.env.AI_GATEWAY_API_KEY = "k";
    mockGenerateText.mockResolvedValueOnce(
      fakeText('{"name":"Garrick","personality":{}}'),
    );
    const svc = new ContentGenerationService();

    const result = await svc.generateNPC({
      archetype: "blacksmith",
      prompt: "town smith",
    });

    expect(result.npc.id).toMatch(/^npc_\d+_[a-z0-9]+$/);
    expect(result.npc.name).toBe("Garrick");
    expect(result.npc.metadata).toMatchObject({
      generatedBy: "AI",
      archetype: "blacksmith",
    });
    expect(typeof result.npc.metadata.timestamp).toBe("string");
  });

  it("Throws on malformed NPC JSON", async () => {
    process.env.AI_GATEWAY_API_KEY = "k";
    mockGenerateText.mockResolvedValueOnce(fakeText("not json"));
    const svc = new ContentGenerationService();

    await expect(
      svc.generateNPC({ archetype: "x", prompt: "y" }),
    ).rejects.toThrow(/Invalid JSON response/);
  });
});

describe("ContentGenerationService — generateQuest", () => {
  it("Calls generateText with quality model + the configured temperature", async () => {
    process.env.AI_GATEWAY_API_KEY = "k";
    mockGenerateText.mockResolvedValueOnce(
      fakeText('{"name":"Lost Sword","objectives":[]}'),
    );
    const svc = new ContentGenerationService();

    await svc.generateQuest({
      questType: "fetch",
      difficulty: "medium",
      theme: "rescue",
    });

    const args = mockGenerateText.mock.calls[0][0];
    // generateQuest uses 0.7 (lower than the 0.8 used for dialogue/NPC
    // generation) to bias toward more deterministic objective lists.
    expect(args.temperature).toBe(0.7);
    expect(args.prompt).toContain("fetch");
    expect(args.prompt).toContain("medium");
  });

  it("Throws on malformed quest JSON", async () => {
    process.env.AI_GATEWAY_API_KEY = "k";
    mockGenerateText.mockResolvedValueOnce(fakeText("garbage"));
    const svc = new ContentGenerationService();

    await expect(
      svc.generateQuest({ questType: "x", difficulty: "easy" }),
    ).rejects.toThrow(/Invalid JSON response/);
  });
});

describe("ContentGenerationService — generateLore", () => {
  it("Calls generateText and forwards topic + scope into prompt", async () => {
    process.env.AI_GATEWAY_API_KEY = "k";
    mockGenerateText.mockResolvedValueOnce(
      fakeText('{"topic":"creation myth","scope":"world","content":"..."}'),
    );
    const svc = new ContentGenerationService();

    await svc.generateLore({
      topic: "creation myth",
      scope: "world",
    });

    const args = mockGenerateText.mock.calls[0][0];
    expect(args.prompt).toContain("creation myth");
    expect(args.prompt).toContain("world");
  });

  it("Throws on malformed lore JSON", async () => {
    process.env.AI_GATEWAY_API_KEY = "k";
    mockGenerateText.mockResolvedValueOnce(fakeText("..."));
    const svc = new ContentGenerationService();

    await expect(svc.generateLore({ topic: "x", scope: "y" })).rejects.toThrow(
      /Invalid JSON response/,
    );
  });
});

describe("ContentGenerationService — model selection", () => {
  it.each([
    ["quality", "openai/gpt-5"],
    ["speed", "openai/gpt-5-mini"],
    ["balanced", "openai/gpt-5"],
  ] as const)("quality '%s' resolves to model '%s'", async (quality, model) => {
    process.env.AI_GATEWAY_API_KEY = "k";
    mockGenerateText.mockResolvedValueOnce(fakeText("[]"));
    const svc = new ContentGenerationService();

    await svc.generateDialogue({
      npcName: "x",
      npcPersonality: "y",
      quality,
    });

    expect(mockGenerateText.mock.calls[0][0].model).toBe(model);
  });
});

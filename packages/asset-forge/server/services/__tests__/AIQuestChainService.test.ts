/**
 * AIQuestChainService — unit tests.
 *
 * Phase H test-coverage cut #6. AIQuestChainService uses the
 * Vercel AI SDK's `generateObject` for structured output and
 * depends on `aiSDKService` singleton. Both are mocked at module
 * load.
 *
 * Test surface:
 *   - generateQuestChain forwards request through to generateObject
 *   - Quest-chain linkage validation: broken previousQuestId
 *     references are nulled before return
 *   - System/user prompts include the question count, description,
 *     difficulty progression, and any NPCs/locations the caller
 *     supplies
 *   - Quality tier is forwarded to aiSDKService.getConfiguredModel
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock hoists above imports — define the mock fns inside
// `vi.hoisted` so they're initialized before the factory runs.
const { mockGenerateObject, mockGetConfiguredModel } = vi.hoisted(() => ({
  mockGenerateObject: vi.fn(),
  mockGetConfiguredModel: vi.fn(),
}));

vi.mock("ai", () => ({
  generateObject: mockGenerateObject,
}));

vi.mock("../AISDKService", () => ({
  aiSDKService: {
    getConfiguredModel: mockGetConfiguredModel,
  },
}));

import { AIQuestChainService } from "../AIQuestChainService.js";

beforeEach(() => {
  mockGenerateObject.mockReset();
  mockGetConfiguredModel.mockReset();
  // Default: `getConfiguredModel` resolves to a fake LanguageModel.
  mockGetConfiguredModel.mockResolvedValue({ modelId: "test-model" });
});

/**
 * Build a fake `generateObject` response with the shape the service
 * expects: `{ object: { quests, reasoning, npcSuggestions } }`.
 */
function fakeQuestChain(quests: unknown[]) {
  return {
    object: {
      quests,
      reasoning: "Test reasoning",
      npcSuggestions: [],
    },
  };
}

describe("AIQuestChainService — generateQuestChain", () => {
  it("Forwards the requested quality tier to aiSDKService.getConfiguredModel", async () => {
    mockGenerateObject.mockResolvedValueOnce(fakeQuestChain([]));
    const svc = new AIQuestChainService();

    await svc.generateQuestChain({
      description: "x",
      questCount: 1,
      quality: "speed",
    });

    expect(mockGetConfiguredModel).toHaveBeenCalledWith("speed");
  });

  it("Defaults to 'quality' tier when caller does not specify", async () => {
    mockGenerateObject.mockResolvedValueOnce(fakeQuestChain([]));
    const svc = new AIQuestChainService();

    await svc.generateQuestChain({ description: "x", questCount: 1 });

    expect(mockGetConfiguredModel).toHaveBeenCalledWith("quality");
  });

  it("Calls generateObject with the model + schema + temperature 0.8", async () => {
    mockGenerateObject.mockResolvedValueOnce(fakeQuestChain([]));
    const svc = new AIQuestChainService();

    await svc.generateQuestChain({ description: "test", questCount: 3 });

    expect(mockGenerateObject).toHaveBeenCalledTimes(1);
    const args = mockGenerateObject.mock.calls[0][0];
    expect(args.model).toEqual({ modelId: "test-model" });
    expect(args.temperature).toBe(0.8);
    expect(args.schema).toBeDefined();
    expect(typeof args.system).toBe("string");
    expect(typeof args.prompt).toBe("string");
  });

  it("User prompt mentions the requested quest count + description verbatim", async () => {
    mockGenerateObject.mockResolvedValueOnce(fakeQuestChain([]));
    const svc = new AIQuestChainService();

    await svc.generateQuestChain({
      description: "Goblin invasion saga",
      questCount: 5,
    });

    const args = mockGenerateObject.mock.calls[0][0];
    expect(args.prompt).toContain("5 quests");
    expect(args.prompt).toContain("Goblin invasion saga");
  });

  it("User prompt includes the difficulty progression label (default linear)", async () => {
    mockGenerateObject.mockResolvedValueOnce(fakeQuestChain([]));
    const svc = new AIQuestChainService();

    await svc.generateQuestChain({ description: "x", questCount: 1 });
    expect(mockGenerateObject.mock.calls[0][0].prompt).toMatch(
      /Difficulty progression: linear/,
    );
  });

  it("Honors caller-supplied difficulty progression", async () => {
    mockGenerateObject.mockResolvedValueOnce(fakeQuestChain([]));
    const svc = new AIQuestChainService();

    await svc.generateQuestChain({
      description: "x",
      questCount: 1,
      difficultyProgression: "escalating",
    });
    expect(mockGenerateObject.mock.calls[0][0].prompt).toMatch(
      /Difficulty progression: escalating/,
    );
  });

  it("User prompt lists existing NPCs when supplied", async () => {
    mockGenerateObject.mockResolvedValueOnce(fakeQuestChain([]));
    const svc = new AIQuestChainService();

    await svc.generateQuestChain({
      description: "x",
      questCount: 1,
      npcs: [
        { id: "npc_1", name: "Garrick", location: "Town" },
        { id: "npc_2", name: "Mira" },
      ],
    });

    const prompt = mockGenerateObject.mock.calls[0][0].prompt;
    expect(prompt).toContain("Garrick");
    expect(prompt).toContain("npc_1");
    expect(prompt).toContain("at Town");
    expect(prompt).toContain("Mira");
  });

  it("User prompt lists known locations when supplied", async () => {
    mockGenerateObject.mockResolvedValueOnce(fakeQuestChain([]));
    const svc = new AIQuestChainService();

    await svc.generateQuestChain({
      description: "x",
      questCount: 1,
      locations: [
        { name: "Catacombs", type: "dungeon" },
        { name: "Market", type: "town" },
      ],
    });

    const prompt = mockGenerateObject.mock.calls[0][0].prompt;
    expect(prompt).toContain("Catacombs (dungeon)");
    expect(prompt).toContain("Market (town)");
  });
});

describe("AIQuestChainService — quest chain linkage validation", () => {
  it("Nulls out previousQuestId when the referenced quest is not in the chain", async () => {
    const quests = [
      {
        id: "q1",
        title: "First",
        description: "",
        questGiverId: "n1",
        questGiverName: "N",
        location: "L",
        difficulty: 1,
        levelRequirement: 1,
        previousQuestId: null,
        objectives: [],
        rewards: { experience: 0, gold: 0, items: [] },
        dialogue: { intro: "", progress: "", completion: "" },
        storyBeat: "",
      },
      {
        id: "q2",
        title: "Second",
        description: "",
        questGiverId: "n1",
        questGiverName: "N",
        location: "L",
        difficulty: 2,
        levelRequirement: 2,
        previousQuestId: "q-nonexistent",
        objectives: [],
        rewards: { experience: 0, gold: 0, items: [] },
        dialogue: { intro: "", progress: "", completion: "" },
        storyBeat: "",
      },
    ];
    mockGenerateObject.mockResolvedValueOnce(fakeQuestChain(quests));
    const svc = new AIQuestChainService();

    const result = await svc.generateQuestChain({
      description: "x",
      questCount: 2,
    });
    expect(result.quests[0].previousQuestId).toBe(null);
    // q2's broken reference was repaired
    expect(result.quests[1].previousQuestId).toBe(null);
  });

  it("Preserves valid previousQuestId references", async () => {
    const quests = [
      {
        id: "q1",
        title: "First",
        description: "",
        questGiverId: "n1",
        questGiverName: "N",
        location: "L",
        difficulty: 1,
        levelRequirement: 1,
        previousQuestId: null,
        objectives: [],
        rewards: { experience: 0, gold: 0, items: [] },
        dialogue: { intro: "", progress: "", completion: "" },
        storyBeat: "",
      },
      {
        id: "q2",
        title: "Second",
        description: "",
        questGiverId: "n1",
        questGiverName: "N",
        location: "L",
        difficulty: 2,
        levelRequirement: 2,
        previousQuestId: "q1",
        objectives: [],
        rewards: { experience: 0, gold: 0, items: [] },
        dialogue: { intro: "", progress: "", completion: "" },
        storyBeat: "",
      },
    ];
    mockGenerateObject.mockResolvedValueOnce(fakeQuestChain(quests));
    const svc = new AIQuestChainService();

    const result = await svc.generateQuestChain({
      description: "x",
      questCount: 2,
    });
    expect(result.quests[1].previousQuestId).toBe("q1");
  });

  it("Returns reasoning + npcSuggestions verbatim from the model output", async () => {
    const npcSuggestions = [
      { name: "Elder Brom", role: "quest-giver", location: "Town", reason: "" },
    ];
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        quests: [],
        reasoning: "Three-act structure",
        npcSuggestions,
      },
    });
    const svc = new AIQuestChainService();

    const result = await svc.generateQuestChain({
      description: "x",
      questCount: 0,
    });
    expect(result.reasoning).toBe("Three-act structure");
    expect(result.npcSuggestions).toEqual(npcSuggestions);
  });
});

describe("AIQuestChainService — error propagation", () => {
  it("Propagates errors from getConfiguredModel", async () => {
    mockGetConfiguredModel.mockRejectedValueOnce(new Error("API key missing"));
    const svc = new AIQuestChainService();

    await expect(
      svc.generateQuestChain({ description: "x", questCount: 1 }),
    ).rejects.toThrow(/API key missing/);
  });

  it("Propagates errors from generateObject", async () => {
    mockGenerateObject.mockRejectedValueOnce(new Error("model overloaded"));
    const svc = new AIQuestChainService();

    await expect(
      svc.generateQuestChain({ description: "x", questCount: 1 }),
    ).rejects.toThrow(/model overloaded/);
  });
});

import { QuestsManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it, vi } from "vitest";
import {
  QuestsNotLoadedError,
  QuestsRegistry,
  UnknownQuestError,
} from "../QuestsRegistry.js";

function manifest() {
  return QuestsManifestSchema.parse({
    cook_s_assistant: {
      id: "cook_s_assistant",
      name: "Cook's Assistant",
      description: "Help the cook.",
      difficulty: "novice",
      questPoints: 1,
      replayable: false,
      requirements: {
        quests: [],
        skills: {},
        items: [],
      },
      startNpc: "lumbridge_cook",
      stages: [
        {
          type: "dialogue",
          id: "talk_to_cook",
          description: "Talk to the cook.",
          npcId: "lumbridge_cook",
        },
        {
          type: "gather",
          id: "gather_egg",
          description: "Get an egg.",
          target: "egg",
          count: 1,
        },
        {
          type: "dialogue",
          id: "return_to_cook",
          description: "Return to the cook.",
          npcId: "lumbridge_cook",
        },
      ],
      onStart: {},
      rewards: {
        questPoints: 1,
        items: [],
        xp: { cooking: 300 },
      },
    },
    dragon_slayer: {
      id: "dragon_slayer",
      name: "Dragon Slayer",
      description: "Slay the dragon.",
      difficulty: "experienced",
      questPoints: 2,
      replayable: false,
      requirements: {
        quests: ["cook_s_assistant"],
        skills: { combat: 32 },
        items: [],
      },
      startNpc: "oziach",
      stages: [
        {
          type: "kill",
          id: "slay_dragon",
          description: "Kill the dragon.",
          target: "elvarg",
          count: 1,
        },
      ],
      onStart: {},
      rewards: {
        questPoints: 2,
        items: [],
        xp: {},
      },
    },
  });
}

describe("QuestsRegistry", () => {
  it("throws pre-load", () => {
    expect(() => new QuestsRegistry().manifest).toThrow(QuestsNotLoadedError);
  });

  it("get + has + ids + all", () => {
    const r = new QuestsRegistry(manifest());
    expect(r.has("cook_s_assistant")).toBe(true);
    expect(r.has("ghost")).toBe(false);
    expect(r.ids.sort()).toEqual(["cook_s_assistant", "dragon_slayer"]);
    expect(r.get("cook_s_assistant").name).toBe("Cook's Assistant");
    expect(r.all().length).toBe(2);
    expect(() => r.get("ghost")).toThrow(UnknownQuestError);
  });

  it("canStart respects prereqs + skill gates", () => {
    const r = new QuestsRegistry(manifest());
    // Cook's Assistant: no prereqs, no skill gate
    expect(
      r.canStart("cook_s_assistant", {
        completedQuestIds: new Set(),
        skillLevels: {},
      }),
    ).toBe(true);

    // Dragon Slayer: needs cook_s_assistant + combat 32
    expect(
      r.canStart("dragon_slayer", {
        completedQuestIds: new Set(),
        skillLevels: { combat: 40 },
      }),
    ).toBe(false);

    expect(
      r.canStart("dragon_slayer", {
        completedQuestIds: new Set(["cook_s_assistant"]),
        skillLevels: { combat: 20 },
      }),
    ).toBe(false);

    expect(
      r.canStart("dragon_slayer", {
        completedQuestIds: new Set(["cook_s_assistant"]),
        skillLevels: { combat: 32 },
      }),
    ).toBe(true);
  });

  it("stage + nextStage walks quest stages", () => {
    const r = new QuestsRegistry(manifest());
    expect(r.stage("cook_s_assistant", "talk_to_cook").type).toBe("dialogue");
    const next = r.nextStage("cook_s_assistant", "talk_to_cook");
    expect(next?.id).toBe("gather_egg");
    expect(r.nextStage("cook_s_assistant", "return_to_cook")).toBeNull();
    expect(() => r.stage("cook_s_assistant", "ghost")).toThrow();
  });

  it("startNpc helper", () => {
    const r = new QuestsRegistry(manifest());
    expect(r.startNpc("dragon_slayer")).toBe("oziach");
  });

  it("loadFromJson validates via zod", () => {
    const r = new QuestsRegistry();
    r.loadFromJson(manifest());
    expect(r.ids.length).toBe(2);
  });

  it("onReloaded fires after every load() and supports unsubscribe", () => {
    const r = new QuestsRegistry();
    let count = 0;
    const off = r.onReloaded(() => {
      count++;
    });
    r.load(manifest());
    r.load(manifest());
    expect(count).toBe(2);
    off();
    r.load(manifest());
    expect(count).toBe(2);
  });

  it("onReloaded fires after loadFromJson too", () => {
    const r = new QuestsRegistry();
    let count = 0;
    r.onReloaded(() => {
      count++;
    });
    r.loadFromJson(manifest());
    expect(count).toBe(1);
  });

  it("onReloaded survives a throwing listener (logs but does not propagate)", () => {
    const r = new QuestsRegistry();
    const goodListener = vi.fn();
    r.onReloaded(() => {
      throw new Error("intentional");
    });
    r.onReloaded(goodListener);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => r.load(manifest())).not.toThrow();
    expect(goodListener).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });
});

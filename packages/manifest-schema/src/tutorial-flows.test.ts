/**
 * Faithfulness + defensiveness tests for `TutorialFlowsManifestSchema`.
 */

import { describe, expect, it } from "vitest";

import {
  TutorialFlowsManifestSchema,
  type TutorialFlowsManifest,
} from "./tutorial-flows.js";

const reference: TutorialFlowsManifest = [
  {
    id: "intro",
    name: "Welcome Flow",
    description: "New-player introduction.",
    category: "onboarding",
    autoStart: true,
    priority: 100,
    prerequisiteFlowIds: [],
    startStepId: "greet",
    steps: {
      greet: {
        id: "greet",
        titleKey: "tut.intro.greet.title",
        bodyKey: "tut.intro.greet.body",
        iconId: "icon.wave",
        anchor: { kind: "screen-center" },
        completionTriggers: [{ kind: "manual-continue" }],
        nextStepId: "move",
        skipToStepId: "",
        delaySec: 0,
        autoAdvanceSec: 0,
        skippableByUser: true,
      },
      move: {
        id: "move",
        titleKey: "tut.intro.move.title",
        bodyKey: "tut.intro.move.body",
        iconId: "",
        anchor: { kind: "screen-bottom" },
        completionTriggers: [
          {
            kind: "event",
            eventName: "player:moved",
            payloadMatch: {},
          },
        ],
        nextStepId: "pickup",
        skipToStepId: "",
        delaySec: 0,
        autoAdvanceSec: 60,
        skippableByUser: true,
      },
      pickup: {
        id: "pickup",
        titleKey: "tut.intro.pickup.title",
        bodyKey: "tut.intro.pickup.body",
        iconId: "",
        anchor: {
          kind: "world-entity",
          entityId: "starterApple",
        },
        completionTriggers: [
          {
            kind: "item-acquired",
            itemId: "apple",
            minCount: 1,
          },
        ],
        nextStepId: "",
        skipToStepId: "",
        delaySec: 0,
        autoAdvanceSec: 0,
        skippableByUser: true,
      },
    },
  },
  {
    id: "combatBasics",
    name: "Combat Basics",
    description: "Triggered after intro.",
    category: "combat",
    autoStart: true,
    priority: 50,
    prerequisiteFlowIds: ["intro"],
    startStepId: "attack",
    steps: {
      attack: {
        id: "attack",
        titleKey: "tut.combat.attack.title",
        bodyKey: "tut.combat.attack.body",
        iconId: "",
        anchor: { kind: "widget", widgetId: "combatHud" },
        completionTriggers: [
          {
            kind: "skill-level",
            skillId: "attack",
            minLevel: 2,
          },
        ],
        nextStepId: "",
        skipToStepId: "",
        delaySec: 0,
        autoAdvanceSec: 0,
        skippableByUser: true,
      },
    },
  },
];

describe("TutorialFlowsManifestSchema", () => {
  it("parses the reference manifest cleanly", () => {
    const result = TutorialFlowsManifestSchema.safeParse(reference);
    if (!result.success) {
      throw new Error(
        `Reference manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("applies defaults on minimal flow + step", () => {
    const parsed = TutorialFlowsManifestSchema.parse([
      {
        id: "f",
        name: "F",
        startStepId: "s",
        steps: {
          s: {
            id: "s",
            titleKey: "t.t",
            bodyKey: "t.b",
            completionTriggers: [{ kind: "manual-continue" }],
          },
        },
      },
    ]);
    expect(parsed[0].category).toBe("general");
    expect(parsed[0].autoStart).toBe(false);
    expect(parsed[0].priority).toBe(10);
    expect(parsed[0].prerequisiteFlowIds).toEqual([]);
    expect(parsed[0].steps.s.anchor).toEqual({ kind: "screen-center" });
    expect(parsed[0].steps.s.nextStepId).toBe("");
    expect(parsed[0].steps.s.skipToStepId).toBe("");
    expect(parsed[0].steps.s.delaySec).toBe(0);
    expect(parsed[0].steps.s.autoAdvanceSec).toBe(0);
    expect(parsed[0].steps.s.skippableByUser).toBe(true);
    expect(parsed[0].steps.s.iconId).toBe("");
  });

  it("accepts empty manifest", () => {
    expect(TutorialFlowsManifestSchema.safeParse([]).success).toBe(true);
  });

  it("rejects duplicate flow ids", () => {
    const bad = [
      {
        id: "dup",
        name: "A",
        startStepId: "s",
        steps: {
          s: {
            id: "s",
            titleKey: "t.a",
            bodyKey: "b.a",
            completionTriggers: [{ kind: "manual-continue" }],
          },
        },
      },
      {
        id: "dup",
        name: "B",
        startStepId: "s",
        steps: {
          s: {
            id: "s",
            titleKey: "t.b",
            bodyKey: "b.b",
            completionTriggers: [{ kind: "manual-continue" }],
          },
        },
      },
    ];
    expect(TutorialFlowsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects startStepId that does not resolve", () => {
    const bad = [
      {
        id: "f",
        name: "F",
        startStepId: "ghost",
        steps: {
          s: {
            id: "s",
            titleKey: "t.t",
            bodyKey: "t.b",
            completionTriggers: [{ kind: "manual-continue" }],
          },
        },
      },
    ];
    expect(TutorialFlowsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects nextStepId that does not resolve", () => {
    const bad = [
      {
        id: "f",
        name: "F",
        startStepId: "s",
        steps: {
          s: {
            id: "s",
            titleKey: "t.t",
            bodyKey: "t.b",
            completionTriggers: [{ kind: "manual-continue" }],
            nextStepId: "ghost",
          },
        },
      },
    ];
    expect(TutorialFlowsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects skipToStepId that does not resolve", () => {
    const bad = [
      {
        id: "f",
        name: "F",
        startStepId: "s",
        steps: {
          s: {
            id: "s",
            titleKey: "t.t",
            bodyKey: "t.b",
            completionTriggers: [{ kind: "manual-continue" }],
            skipToStepId: "ghost",
          },
        },
      },
    ];
    expect(TutorialFlowsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects step record key not matching inner step.id", () => {
    const bad = [
      {
        id: "f",
        name: "F",
        startStepId: "a",
        steps: {
          a: {
            id: "b",
            titleKey: "t.t",
            bodyKey: "t.b",
            completionTriggers: [{ kind: "manual-continue" }],
          },
        },
      },
    ];
    expect(TutorialFlowsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects step with zero completionTriggers", () => {
    const bad = [
      {
        id: "f",
        name: "F",
        startStepId: "s",
        steps: {
          s: {
            id: "s",
            titleKey: "t.t",
            bodyKey: "t.b",
            completionTriggers: [],
          },
        },
      },
    ];
    expect(TutorialFlowsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown prerequisite flow id", () => {
    const bad = [
      {
        id: "f",
        name: "F",
        startStepId: "s",
        prerequisiteFlowIds: ["ghost"],
        steps: {
          s: {
            id: "s",
            titleKey: "t.t",
            bodyKey: "t.b",
            completionTriggers: [{ kind: "manual-continue" }],
          },
        },
      },
    ];
    expect(TutorialFlowsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects cyclic prerequisites", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        startStepId: "s",
        prerequisiteFlowIds: ["b"],
        steps: {
          s: {
            id: "s",
            titleKey: "t.a",
            bodyKey: "b.a",
            completionTriggers: [{ kind: "manual-continue" }],
          },
        },
      },
      {
        id: "b",
        name: "B",
        startStepId: "s",
        prerequisiteFlowIds: ["a"],
        steps: {
          s: {
            id: "s",
            titleKey: "t.b",
            bodyKey: "b.b",
            completionTriggers: [{ kind: "manual-continue" }],
          },
        },
      },
    ];
    expect(TutorialFlowsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects invalid localization key format", () => {
    const bad = [
      {
        id: "f",
        name: "F",
        startStepId: "s",
        steps: {
          s: {
            id: "s",
            titleKey: "Has Spaces",
            bodyKey: "t.b",
            completionTriggers: [{ kind: "manual-continue" }],
          },
        },
      },
    ];
    expect(TutorialFlowsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects invalid event name format", () => {
    const bad = [
      {
        id: "f",
        name: "F",
        startStepId: "s",
        steps: {
          s: {
            id: "s",
            titleKey: "t.t",
            bodyKey: "t.b",
            completionTriggers: [
              {
                kind: "event",
                eventName: "Player Moved!",
              },
            ],
          },
        },
      },
    ];
    expect(TutorialFlowsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown trigger kind", () => {
    const bad = [
      {
        id: "f",
        name: "F",
        startStepId: "s",
        steps: {
          s: {
            id: "s",
            titleKey: "t.t",
            bodyKey: "t.b",
            completionTriggers: [{ kind: "mind-read" }],
          },
        },
      },
    ];
    expect(TutorialFlowsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown anchor kind", () => {
    const bad = [
      {
        id: "f",
        name: "F",
        startStepId: "s",
        steps: {
          s: {
            id: "s",
            titleKey: "t.t",
            bodyKey: "t.b",
            anchor: { kind: "hologram" },
            completionTriggers: [{ kind: "manual-continue" }],
          },
        },
      },
    ];
    expect(TutorialFlowsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects item-acquired minCount > 10_000", () => {
    const bad = [
      {
        id: "f",
        name: "F",
        startStepId: "s",
        steps: {
          s: {
            id: "s",
            titleKey: "t.t",
            bodyKey: "t.b",
            completionTriggers: [
              {
                kind: "item-acquired",
                itemId: "apple",
                minCount: 99_999,
              },
            ],
          },
        },
      },
    ];
    expect(TutorialFlowsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects skill-level minLevel > 200", () => {
    const bad = [
      {
        id: "f",
        name: "F",
        startStepId: "s",
        steps: {
          s: {
            id: "s",
            titleKey: "t.t",
            bodyKey: "t.b",
            completionTriggers: [
              {
                kind: "skill-level",
                skillId: "attack",
                minLevel: 500,
              },
            ],
          },
        },
      },
    ];
    expect(TutorialFlowsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects autoAdvanceSec > 600", () => {
    const bad = [
      {
        id: "f",
        name: "F",
        startStepId: "s",
        steps: {
          s: {
            id: "s",
            titleKey: "t.t",
            bodyKey: "t.b",
            completionTriggers: [{ kind: "manual-continue" }],
            autoAdvanceSec: 1000,
          },
        },
      },
    ];
    expect(TutorialFlowsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts world-position anchor", () => {
    const ok = [
      {
        id: "f",
        name: "F",
        startStepId: "s",
        steps: {
          s: {
            id: "s",
            titleKey: "t.t",
            bodyKey: "t.b",
            anchor: {
              kind: "world-position",
              position: { x: 10, y: 0, z: 5 },
            },
            completionTriggers: [{ kind: "manual-continue" }],
          },
        },
      },
    ];
    expect(TutorialFlowsManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("accepts quest-stage trigger", () => {
    const ok = [
      {
        id: "f",
        name: "F",
        startStepId: "s",
        steps: {
          s: {
            id: "s",
            titleKey: "t.t",
            bodyKey: "t.b",
            completionTriggers: [
              {
                kind: "quest-stage",
                questId: "cookInn",
                stageId: "talkToCook",
              },
            ],
          },
        },
      },
    ];
    expect(TutorialFlowsManifestSchema.safeParse(ok).success).toBe(true);
  });
});

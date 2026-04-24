/**
 * Tests for the TutorialFlowsProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { tutorialFlowsProvider } from "../TutorialFlowsProvider";

beforeEach(() => {
  tutorialFlowsProvider.unload();
});
afterEach(() => {
  tutorialFlowsProvider.unload();
});

const validManifest = [
  {
    id: "onboarding",
    name: "New Player Onboarding",
    category: "movement",
    autoStart: true,
    priority: 100,
    startStepId: "welcome",
    steps: {
      welcome: {
        id: "welcome",
        titleKey: "tutorial.welcome.title",
        bodyKey: "tutorial.welcome.body",
        completionTriggers: [{ kind: "manual-continue" }],
        nextStepId: "moveForward",
      },
      moveForward: {
        id: "moveForward",
        titleKey: "tutorial.move.title",
        bodyKey: "tutorial.move.body",
        anchor: { kind: "widget", widgetId: "movementHud" },
        completionTriggers: [{ kind: "event", eventName: "player:move" }],
        nextStepId: "",
        skipToStepId: "",
      },
    },
  },
  {
    id: "combat",
    name: "Combat Basics",
    autoStart: false,
    prerequisiteFlowIds: ["onboarding"],
    startStepId: "readyWeapon",
    steps: {
      readyWeapon: {
        id: "readyWeapon",
        titleKey: "tutorial.combat.ready.title",
        bodyKey: "tutorial.combat.ready.body",
        completionTriggers: [{ kind: "item-acquired", itemId: "bronzeSword" }],
      },
    },
  },
];

describe("TutorialFlowsProvider", () => {
  it("starts unloaded with safe-empty default", () => {
    expect(tutorialFlowsProvider.isLoaded()).toBe(false);
    expect(tutorialFlowsProvider.getManifest()).toBeNull();
    expect(tutorialFlowsProvider.getFlows()).toEqual([]);
  });

  it("loadRaw() accepts a valid manifest and fills defaults", () => {
    const parsed = tutorialFlowsProvider.loadRaw(validManifest);
    expect(parsed.length).toBe(2);
    expect(parsed[0].autoStart).toBe(true);
    expect(parsed[0].steps.welcome.skippableByUser).toBe(true);
    expect(parsed[0].steps.welcome.delaySec).toBe(0);
    expect(parsed[1].category).toBe("general");
    expect(tutorialFlowsProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() accepts empty array", () => {
    const parsed = tutorialFlowsProvider.loadRaw([]);
    expect(parsed.length).toBe(0);
    expect(tutorialFlowsProvider.isLoaded()).toBe(true);
    expect(tutorialFlowsProvider.getFlows()).toEqual([]);
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = tutorialFlowsProvider.loadRaw(validManifest);
    tutorialFlowsProvider.unload();
    tutorialFlowsProvider.load(parsed);
    expect(tutorialFlowsProvider.isLoaded()).toBe(true);
    expect(tutorialFlowsProvider.getFlows().length).toBe(2);
  });

  it("loadRaw() rejects duplicate flow ids", () => {
    const bad = [validManifest[0], { ...validManifest[0] }];
    expect(() => tutorialFlowsProvider.loadRaw(bad)).toThrow();
    expect(tutorialFlowsProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects startStepId referencing a non-declared step", () => {
    const bad = [
      {
        id: "f",
        name: "F",
        startStepId: "ghost",
        steps: {
          a: {
            id: "a",
            titleKey: "t.t",
            bodyKey: "t.b",
            completionTriggers: [{ kind: "manual-continue" }],
          },
        },
      },
    ];
    expect(() => tutorialFlowsProvider.loadRaw(bad)).toThrow();
    expect(tutorialFlowsProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects step record key not matching inner step.id", () => {
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
    expect(() => tutorialFlowsProvider.loadRaw(bad)).toThrow();
    expect(tutorialFlowsProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects nextStepId referencing a non-declared step", () => {
    const bad = [
      {
        id: "f",
        name: "F",
        startStepId: "a",
        steps: {
          a: {
            id: "a",
            titleKey: "t.t",
            bodyKey: "t.b",
            completionTriggers: [{ kind: "manual-continue" }],
            nextStepId: "ghost",
          },
        },
      },
    ];
    expect(() => tutorialFlowsProvider.loadRaw(bad)).toThrow();
    expect(tutorialFlowsProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects skipToStepId referencing a non-declared step", () => {
    const bad = [
      {
        id: "f",
        name: "F",
        startStepId: "a",
        steps: {
          a: {
            id: "a",
            titleKey: "t.t",
            bodyKey: "t.b",
            completionTriggers: [{ kind: "manual-continue" }],
            skipToStepId: "ghost",
          },
        },
      },
    ];
    expect(() => tutorialFlowsProvider.loadRaw(bad)).toThrow();
    expect(tutorialFlowsProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects empty completionTriggers", () => {
    const bad = [
      {
        id: "f",
        name: "F",
        startStepId: "a",
        steps: {
          a: {
            id: "a",
            titleKey: "t.t",
            bodyKey: "t.b",
            completionTriggers: [],
          },
        },
      },
    ];
    expect(() => tutorialFlowsProvider.loadRaw(bad)).toThrow();
    expect(tutorialFlowsProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects prerequisite referencing a non-declared flow", () => {
    const bad = [
      {
        id: "f",
        name: "F",
        startStepId: "a",
        prerequisiteFlowIds: ["ghost"],
        steps: {
          a: {
            id: "a",
            titleKey: "t.t",
            bodyKey: "t.b",
            completionTriggers: [{ kind: "manual-continue" }],
          },
        },
      },
    ];
    expect(() => tutorialFlowsProvider.loadRaw(bad)).toThrow();
    expect(tutorialFlowsProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects prerequisite cycles", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        startStepId: "s",
        prerequisiteFlowIds: ["b"],
        steps: {
          s: {
            id: "s",
            titleKey: "t.t",
            bodyKey: "t.b",
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
            titleKey: "t.t",
            bodyKey: "t.b",
            completionTriggers: [{ kind: "manual-continue" }],
          },
        },
      },
    ];
    expect(() => tutorialFlowsProvider.loadRaw(bad)).toThrow();
    expect(tutorialFlowsProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects malformed localization key", () => {
    const bad = [
      {
        id: "f",
        name: "F",
        startStepId: "a",
        steps: {
          a: {
            id: "a",
            titleKey: "Not_Valid.Key",
            bodyKey: "t.b",
            completionTriggers: [{ kind: "manual-continue" }],
          },
        },
      },
    ];
    expect(() => tutorialFlowsProvider.loadRaw(bad)).toThrow();
    expect(tutorialFlowsProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects malformed event name", () => {
    const bad = [
      {
        id: "f",
        name: "F",
        startStepId: "a",
        steps: {
          a: {
            id: "a",
            titleKey: "t.t",
            bodyKey: "t.b",
            completionTriggers: [
              { kind: "event", eventName: "Bad Event Name" },
            ],
          },
        },
      },
    ];
    expect(() => tutorialFlowsProvider.loadRaw(bad)).toThrow();
    expect(tutorialFlowsProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() accepts multiple anchor kinds", () => {
    const parsed = tutorialFlowsProvider.loadRaw([
      {
        id: "f",
        name: "F",
        startStepId: "a",
        steps: {
          a: {
            id: "a",
            titleKey: "t.t",
            bodyKey: "t.b",
            anchor: {
              kind: "world-position",
              position: { x: 1, y: 2, z: 3 },
            },
            completionTriggers: [
              { kind: "enter-volume", volumeId: "cave" },
              { kind: "quest-stage", questId: "q1", stageId: "s1" },
              { kind: "skill-level", skillId: "mining", minLevel: 5 },
            ],
            nextStepId: "",
          },
        },
      },
    ]);
    expect(parsed[0].steps.a.anchor.kind).toBe("world-position");
  });

  it("hotReload(manifest) replaces the current manifest", () => {
    tutorialFlowsProvider.loadRaw(validManifest);
    const replacement = tutorialFlowsProvider.loadRaw([]);
    tutorialFlowsProvider.hotReload(replacement);
    expect(tutorialFlowsProvider.getFlows().length).toBe(0);
  });

  it("hotReload(null) clears", () => {
    tutorialFlowsProvider.loadRaw(validManifest);
    tutorialFlowsProvider.hotReload(null);
    expect(tutorialFlowsProvider.isLoaded()).toBe(false);
    expect(tutorialFlowsProvider.getFlows()).toEqual([]);
  });

  it("unload() resets", () => {
    tutorialFlowsProvider.loadRaw(validManifest);
    tutorialFlowsProvider.unload();
    expect(tutorialFlowsProvider.isLoaded()).toBe(false);
    expect(tutorialFlowsProvider.getManifest()).toBeNull();
  });
});

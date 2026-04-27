import { TutorialFlowsManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it, vi } from "vitest";
import {
  TutorialFlowsNotLoadedError,
  TutorialFlowsRegistry,
  UnknownTutorialFlowError,
  UnknownTutorialStepError,
} from "../TutorialFlowsRegistry.js";

function manifest() {
  return TutorialFlowsManifestSchema.parse([
    {
      id: "movement",
      name: "Movement basics",
      category: "movement",
      autoStart: true,
      priority: 80,
      startStepId: "welcome",
      steps: {
        welcome: {
          id: "welcome",
          titleKey: "tut.movement.welcome.title",
          bodyKey: "tut.movement.welcome.body",
          completionTriggers: [{ kind: "manual-continue" }],
          nextStepId: "walk",
        },
        walk: {
          id: "walk",
          titleKey: "tut.movement.walk.title",
          bodyKey: "tut.movement.walk.body",
          completionTriggers: [{ kind: "event", eventName: "player:walked" }],
          skipToStepId: "",
          nextStepId: "",
        },
      },
    },
    {
      id: "combat",
      name: "Combat basics",
      category: "combat",
      autoStart: true,
      priority: 50,
      prerequisiteFlowIds: ["movement"],
      startStepId: "attack",
      steps: {
        attack: {
          id: "attack",
          titleKey: "tut.combat.attack.title",
          bodyKey: "tut.combat.attack.body",
          completionTriggers: [{ kind: "event", eventName: "player:attack" }],
          nextStepId: "",
        },
      },
    },
    {
      id: "craftingOptIn",
      name: "Crafting (opt-in)",
      category: "crafting",
      autoStart: false,
      startStepId: "gather",
      steps: {
        gather: {
          id: "gather",
          titleKey: "tut.crafting.gather.title",
          bodyKey: "tut.crafting.gather.body",
          completionTriggers: [
            {
              kind: "item-acquired",
              itemId: "stick",
              minCount: 3,
            },
          ],
          nextStepId: "",
        },
      },
    },
  ]);
}

describe("TutorialFlowsRegistry — not loaded", () => {
  it("throws pre-load", () => {
    expect(() => new TutorialFlowsRegistry().manifest).toThrow(
      TutorialFlowsNotLoadedError,
    );
  });
});

describe("TutorialFlowsRegistry — lookup", () => {
  it("indexes by id", () => {
    const r = new TutorialFlowsRegistry(manifest());
    expect(r.has("movement")).toBe(true);
    expect(r.get("combat").priority).toBe(50);
  });

  it("throws on unknown flow", () => {
    const r = new TutorialFlowsRegistry(manifest());
    expect(() => r.get("ghost")).toThrow(UnknownTutorialFlowError);
  });

  it("filters by category", () => {
    const r = new TutorialFlowsRegistry(manifest());
    expect(r.byCategory("combat").map((f) => f.id)).toEqual(["combat"]);
  });
});

describe("TutorialFlowsRegistry — step traversal", () => {
  it("returns start step", () => {
    const r = new TutorialFlowsRegistry(manifest());
    expect(r.startStep("movement").id).toBe("welcome");
  });

  it("walks next step", () => {
    const r = new TutorialFlowsRegistry(manifest());
    expect(r.nextStep("movement", "welcome")?.id).toBe("walk");
  });

  it("returns null at end of flow", () => {
    const r = new TutorialFlowsRegistry(manifest());
    expect(r.nextStep("movement", "walk")).toBeNull();
  });

  it("returns null when no skip target", () => {
    const r = new TutorialFlowsRegistry(manifest());
    expect(r.skipStep("movement", "welcome")).toBeNull();
  });

  it("throws on unknown step id", () => {
    const r = new TutorialFlowsRegistry(manifest());
    expect(() => r.step("movement", "ghost")).toThrow(UnknownTutorialStepError);
  });
});

describe("TutorialFlowsRegistry — topological order", () => {
  it("orders by prereqs", () => {
    const r = new TutorialFlowsRegistry(manifest());
    const order = r.topologicalOrder().map((f) => f.id);
    expect(order.indexOf("movement")).toBeLessThan(order.indexOf("combat"));
    expect(order).toContain("craftingOptIn");
    expect(order.length).toBe(3);
  });
});

describe("TutorialFlowsRegistry — availability", () => {
  it("allows root flow", () => {
    const r = new TutorialFlowsRegistry(manifest());
    expect(r.checkAvailability("movement", new Set()).available).toBe(true);
  });

  it("blocks on missing prereq", () => {
    const r = new TutorialFlowsRegistry(manifest());
    const out = r.checkAvailability("combat", new Set());
    expect(out.reason).toBe("missing-prereq");
    expect(out.missingPrereqId).toBe("movement");
  });

  it("blocks already complete", () => {
    const r = new TutorialFlowsRegistry(manifest());
    expect(r.checkAvailability("movement", new Set(["movement"])).reason).toBe(
      "already-complete",
    );
  });

  it("flow not found", () => {
    const r = new TutorialFlowsRegistry(manifest());
    expect(r.checkAvailability("ghost", new Set()).reason).toBe(
      "flow-not-found",
    );
  });
});

describe("TutorialFlowsRegistry — autoStartCandidates", () => {
  it("returns movement first", () => {
    const r = new TutorialFlowsRegistry(manifest());
    expect(r.autoStartCandidates(new Set()).map((f) => f.id)).toEqual([
      "movement",
    ]);
  });

  it("unlocks combat when movement done", () => {
    const r = new TutorialFlowsRegistry(manifest());
    expect(
      r.autoStartCandidates(new Set(["movement"])).map((f) => f.id),
    ).toEqual(["combat"]);
  });

  it("omits opt-in flows", () => {
    const r = new TutorialFlowsRegistry(manifest());
    const out = r
      .autoStartCandidates(new Set(["movement", "combat"]))
      .map((f) => f.id);
    expect(out).not.toContain("craftingOptIn");
  });
});

describe("TutorialFlowsRegistry — onReloaded", () => {
  it("fires after every successful load()", () => {
    const r = new TutorialFlowsRegistry();
    const cb = vi.fn();
    r.onReloaded(cb);
    r.load(manifest());
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("returned unsubscribe stops further notifications", () => {
    const r = new TutorialFlowsRegistry();
    const cb = vi.fn();
    const off = r.onReloaded(cb);
    r.load(manifest());
    off();
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("a throwing listener does not break subsequent listeners", () => {
    const r = new TutorialFlowsRegistry();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const bad = vi.fn(() => {
      throw new Error("listener boom");
    });
    const good = vi.fn();
    r.onReloaded(bad);
    r.onReloaded(good);
    r.load(manifest());
    expect(bad).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

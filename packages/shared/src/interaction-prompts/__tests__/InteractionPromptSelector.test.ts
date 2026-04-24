import { InteractionPromptsManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import {
  InteractionPromptController,
  InteractionPromptRegistry,
  UnknownInteractionPromptError,
} from "../InteractionPromptSelector.js";

function manifest() {
  return InteractionPromptsManifestSchema.parse([
    {
      id: "chest.open",
      interactionKind: "chest",
      actionId: "interact",
      mode: "tap",
      labelKey: "prompt.chest.open",
      priority: 10,
      autoHideDistanceMeters: 3,
    },
    {
      id: "chest.loot",
      interactionKind: "chest",
      actionId: "loot",
      mode: "hold",
      durationSec: 1.5,
      labelKey: "prompt.chest.loot",
      priority: 20,
      autoHideDistanceMeters: 2,
    },
    {
      id: "door.open",
      interactionKind: "door",
      actionId: "interact",
      mode: "tap",
      labelKey: "prompt.door.open",
      priority: 5,
      autoHideDistanceMeters: 2,
    },
    {
      id: "npc.talk",
      interactionKind: "npc",
      actionId: "interact",
      mode: "tap",
      labelKey: "prompt.npc.talk",
      priority: 10,
      autoHideDistanceMeters: 3,
    },
  ]);
}

describe("InteractionPromptRegistry — basics", () => {
  it("indexes prompts by id + kind", () => {
    const reg = new InteractionPromptRegistry(manifest());
    expect(reg.size).toBe(4);
    expect(reg.has("chest.open")).toBe(true);
    expect(reg.forKind("chest").map((p) => p.id)).toEqual([
      "chest.loot", // priority 20 first
      "chest.open", // priority 10
    ]);
  });

  it("forKind returns empty array for unknown kind", () => {
    const reg = new InteractionPromptRegistry(manifest());
    expect(reg.forKind("ghost")).toEqual([]);
  });

  it("get throws UnknownInteractionPromptError on miss", () => {
    const reg = new InteractionPromptRegistry(manifest());
    expect(() => reg.get("ghost")).toThrow(UnknownInteractionPromptError);
  });

  it("loadFromJson validates before loading", () => {
    const reg = new InteractionPromptRegistry();
    reg.loadFromJson([
      {
        id: "x",
        interactionKind: "test",
        actionId: "interact",
        labelKey: "prompt.x",
      },
    ]);
    expect(reg.size).toBe(1);
  });
});

describe("InteractionPromptRegistry — select", () => {
  it("picks highest-priority prompt for the kind", () => {
    const reg = new InteractionPromptRegistry(manifest());
    const p = reg.select({ interactionKind: "chest", distanceMeters: 1 });
    expect(p?.id).toBe("chest.loot"); // priority 20 beats open (10)
  });

  it("skips prompts beyond their autoHideDistance", () => {
    const reg = new InteractionPromptRegistry(manifest());
    // loot caps at 2m, open caps at 3m. At 2.5m, loot is out, open is in.
    const p = reg.select({ interactionKind: "chest", distanceMeters: 2.5 });
    expect(p?.id).toBe("chest.open");
  });

  it("returns null when all prompts are beyond range", () => {
    const reg = new InteractionPromptRegistry(manifest());
    const p = reg.select({ interactionKind: "chest", distanceMeters: 10 });
    expect(p).toBeNull();
  });

  it("returns null for unknown kind", () => {
    const reg = new InteractionPromptRegistry(manifest());
    const p = reg.select({ interactionKind: "ghost", distanceMeters: 1 });
    expect(p).toBeNull();
  });

  it("availableActionIds filter honored", () => {
    const reg = new InteractionPromptRegistry(manifest());
    // Player lacks the `loot` action binding → falls through to open
    const p = reg.select({
      interactionKind: "chest",
      distanceMeters: 1,
      availableActionIds: new Set(["interact"]),
    });
    expect(p?.id).toBe("chest.open");
  });

  it("availableActionIds empty filter hides all prompts", () => {
    const reg = new InteractionPromptRegistry(manifest());
    const p = reg.select({
      interactionKind: "chest",
      distanceMeters: 1,
      availableActionIds: new Set(),
    });
    expect(p).toBeNull();
  });

  it("rejects non-finite or negative distance", () => {
    const reg = new InteractionPromptRegistry(manifest());
    expect(() =>
      reg.select({ interactionKind: "chest", distanceMeters: -1 }),
    ).toThrow(TypeError);
    expect(() =>
      reg.select({ interactionKind: "chest", distanceMeters: Number.NaN }),
    ).toThrow(TypeError);
  });

  it("distance exactly at autoHideDistance still matches", () => {
    const reg = new InteractionPromptRegistry(manifest());
    // chest.loot has autoHideDistance=2; distance=2 is inclusive
    const p = reg.select({ interactionKind: "chest", distanceMeters: 2 });
    expect(p?.id).toBe("chest.loot");
  });
});

describe("InteractionPromptController — stateful", () => {
  it("starts with no current prompt", () => {
    const c = new InteractionPromptController(
      new InteractionPromptRegistry(manifest()),
    );
    expect(c.current).toBeNull();
  });

  it("show event fires when first eligible prompt appears", () => {
    const c = new InteractionPromptController(
      new InteractionPromptRegistry(manifest()),
    );
    const evt = c.tick({ interactionKind: "chest", distanceMeters: 1 });
    expect(evt?.kind).toBe("show");
    if (evt?.kind === "show") expect(evt.prompt.id).toBe("chest.loot");
    expect(c.current?.id).toBe("chest.loot");
  });

  it("same prompt re-selected emits null", () => {
    const c = new InteractionPromptController(
      new InteractionPromptRegistry(manifest()),
    );
    c.tick({ interactionKind: "chest", distanceMeters: 1 });
    expect(
      c.tick({ interactionKind: "chest", distanceMeters: 1.5 }),
    ).toBeNull();
  });

  it("swap event fires when kind/priority changes", () => {
    const c = new InteractionPromptController(
      new InteractionPromptRegistry(manifest()),
    );
    c.tick({ interactionKind: "chest", distanceMeters: 1 }); // loot
    // Walk back so loot is out but open is in
    const evt = c.tick({ interactionKind: "chest", distanceMeters: 2.5 });
    expect(evt?.kind).toBe("swap");
    if (evt?.kind === "swap") {
      expect(evt.previous.id).toBe("chest.loot");
      expect(evt.next.id).toBe("chest.open");
    }
  });

  it("hide event fires when no prompt is eligible", () => {
    const c = new InteractionPromptController(
      new InteractionPromptRegistry(manifest()),
    );
    c.tick({ interactionKind: "chest", distanceMeters: 1 });
    const evt = c.tick({ interactionKind: "chest", distanceMeters: 10 });
    expect(evt?.kind).toBe("hide");
    if (evt?.kind === "hide") expect(evt.prompt.id).toBe("chest.loot");
    expect(c.current).toBeNull();
  });

  it("tick(null) hides any current prompt", () => {
    const c = new InteractionPromptController(
      new InteractionPromptRegistry(manifest()),
    );
    c.tick({ interactionKind: "chest", distanceMeters: 1 });
    const evt = c.tick(null);
    expect(evt?.kind).toBe("hide");
    expect(c.current).toBeNull();
  });

  it("tick(null) when nothing showing is no-op", () => {
    const c = new InteractionPromptController(
      new InteractionPromptRegistry(manifest()),
    );
    expect(c.tick(null)).toBeNull();
  });

  it("reset drops current silently", () => {
    const c = new InteractionPromptController(
      new InteractionPromptRegistry(manifest()),
    );
    c.tick({ interactionKind: "chest", distanceMeters: 1 });
    c.reset();
    expect(c.current).toBeNull();
    // Next tick with same context fires a fresh `show`
    const evt = c.tick({ interactionKind: "chest", distanceMeters: 1 });
    expect(evt?.kind).toBe("show");
  });

  it("swap across interactionKinds (chest → npc)", () => {
    const c = new InteractionPromptController(
      new InteractionPromptRegistry(manifest()),
    );
    c.tick({ interactionKind: "chest", distanceMeters: 1 });
    const evt = c.tick({ interactionKind: "npc", distanceMeters: 1 });
    expect(evt?.kind).toBe("swap");
    if (evt?.kind === "swap") {
      expect(evt.previous.id).toBe("chest.loot");
      expect(evt.next.id).toBe("npc.talk");
    }
  });
});

describe("InteractionPromptController — integration", () => {
  it("approach + interact + walk-away sequence", () => {
    const c = new InteractionPromptController(
      new InteractionPromptRegistry(manifest()),
    );
    const events: string[] = [];
    const tick = (kind: string | null, dist = 0) => {
      const e = kind
        ? c.tick({ interactionKind: kind, distanceMeters: dist })
        : c.tick(null);
      if (e) events.push(`${e.kind}:${describeEvent(e)}`);
    };
    tick(null); // no-op
    tick("chest", 5); // too far — still nothing
    tick("chest", 2.5); // chest.open (within 3)
    tick("chest", 1); // swap to chest.loot (priority 20, within 2)
    tick(null); // hide
    expect(events).toEqual([
      "show:chest.open",
      "swap:chest.open→chest.loot",
      "hide:chest.loot",
    ]);
  });
});

function describeEvent(
  e:
    | { kind: "show"; prompt: { id: string } }
    | { kind: "hide"; prompt: { id: string } }
    | { kind: "swap"; previous: { id: string }; next: { id: string } },
): string {
  if (e.kind === "show" || e.kind === "hide") return e.prompt.id;
  return `${e.previous.id}→${e.next.id}`;
}

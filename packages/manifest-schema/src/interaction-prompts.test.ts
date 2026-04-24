/**
 * Faithfulness + defensiveness tests for `InteractionPromptsManifestSchema`.
 */

import { describe, expect, it } from "vitest";

import {
  InteractionPromptsManifestSchema,
  type InteractionPromptsManifest,
} from "./interaction-prompts.js";

const reference: InteractionPromptsManifest = [
  {
    id: "chest.open.tap",
    interactionKind: "chest",
    actionId: "interact",
    mode: "tap",
    durationSec: 0,
    labelKey: "prompt.chest.open",
    subLabelKey: "",
    iconId: "icon.hand",
    style: "default",
    anchor: "screen-center",
    autoHideDistanceMeters: 3,
    fadeInSec: 0.15,
    fadeOutSec: 0.2,
    priority: 0,
  },
  {
    id: "chest.loot.hold",
    interactionKind: "chest",
    actionId: "interact",
    mode: "hold",
    durationSec: 1.5,
    labelKey: "prompt.chest.loot",
    subLabelKey: "prompt.chest.loot.sub",
    iconId: "icon.bag",
    style: "emphasis",
    anchor: "screen-center",
    autoHideDistanceMeters: 2.5,
    fadeInSec: 0.2,
    fadeOutSec: 0.15,
    priority: 10,
  },
  {
    id: "door.toggle",
    interactionKind: "door",
    actionId: "interact",
    mode: "toggle",
    durationSec: 0,
    labelKey: "prompt.door.toggle",
    subLabelKey: "",
    iconId: "icon.door",
    style: "default",
    anchor: "world-target",
    autoHideDistanceMeters: 4,
    fadeInSec: 0.15,
    fadeOutSec: 0.2,
    priority: 0,
  },
];

describe("InteractionPromptsManifestSchema", () => {
  it("parses the reference manifest cleanly", () => {
    const result = InteractionPromptsManifestSchema.safeParse(reference);
    if (!result.success) {
      throw new Error(
        `Reference manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("applies prompt defaults on a minimal entry", () => {
    const parsed = InteractionPromptsManifestSchema.parse([
      {
        id: "x",
        interactionKind: "npc",
        actionId: "interact",
        labelKey: "prompt.x",
      },
    ]);
    expect(parsed[0].mode).toBe("tap");
    expect(parsed[0].durationSec).toBe(0);
    expect(parsed[0].subLabelKey).toBe("");
    expect(parsed[0].iconId).toBe("");
    expect(parsed[0].style).toBe("default");
    expect(parsed[0].anchor).toBe("screen-center");
    expect(parsed[0].autoHideDistanceMeters).toBe(3);
    expect(parsed[0].fadeInSec).toBe(0.15);
    expect(parsed[0].fadeOutSec).toBe(0.2);
    expect(parsed[0].priority).toBe(0);
  });

  it("accepts empty manifest", () => {
    expect(InteractionPromptsManifestSchema.safeParse([]).success).toBe(true);
  });

  it("rejects duplicate prompt ids", () => {
    const bad = [
      {
        id: "dup",
        interactionKind: "a",
        actionId: "interact",
        labelKey: "p.a",
      },
      {
        id: "dup",
        interactionKind: "b",
        actionId: "interact",
        labelKey: "p.b",
      },
    ];
    expect(InteractionPromptsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects two prompts on same interactionKind with same priority", () => {
    const bad = [
      {
        id: "a",
        interactionKind: "chest",
        actionId: "interact",
        labelKey: "p.a",
        priority: 10,
      },
      {
        id: "b",
        interactionKind: "chest",
        actionId: "interact",
        labelKey: "p.b",
        priority: 10,
      },
    ];
    expect(InteractionPromptsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts same-priority prompts on different interactionKinds", () => {
    const ok = [
      {
        id: "a",
        interactionKind: "chest",
        actionId: "interact",
        labelKey: "p.a",
        priority: 5,
      },
      {
        id: "b",
        interactionKind: "door",
        actionId: "interact",
        labelKey: "p.b",
        priority: 5,
      },
    ];
    expect(InteractionPromptsManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects hold mode with durationSec 0", () => {
    const bad = [
      {
        id: "a",
        interactionKind: "chest",
        actionId: "interact",
        labelKey: "p.a",
        mode: "hold",
        durationSec: 0,
      },
    ];
    expect(InteractionPromptsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects rapid-tap mode with durationSec 0", () => {
    const bad = [
      {
        id: "a",
        interactionKind: "chest",
        actionId: "interact",
        labelKey: "p.a",
        mode: "rapid-tap",
        durationSec: 0,
      },
    ];
    expect(InteractionPromptsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects tap mode with positive durationSec", () => {
    const bad = [
      {
        id: "a",
        interactionKind: "chest",
        actionId: "interact",
        labelKey: "p.a",
        mode: "tap",
        durationSec: 2,
      },
    ];
    expect(InteractionPromptsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects toggle mode with positive durationSec", () => {
    const bad = [
      {
        id: "a",
        interactionKind: "chest",
        actionId: "interact",
        labelKey: "p.a",
        mode: "toggle",
        durationSec: 2,
      },
    ];
    expect(InteractionPromptsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects invalid prompt id format", () => {
    const bad = [
      {
        id: "Has Spaces",
        interactionKind: "chest",
        actionId: "interact",
        labelKey: "p.a",
      },
    ];
    expect(InteractionPromptsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects invalid interactionKind format", () => {
    const bad = [
      {
        id: "a",
        interactionKind: "Chest With Spaces",
        actionId: "interact",
        labelKey: "p.a",
      },
    ];
    expect(InteractionPromptsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects invalid action id format", () => {
    const bad = [
      {
        id: "a",
        interactionKind: "chest",
        actionId: "Interact Button",
        labelKey: "p.a",
      },
    ];
    expect(InteractionPromptsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects invalid labelKey format", () => {
    const bad = [
      {
        id: "a",
        interactionKind: "chest",
        actionId: "interact",
        labelKey: "Prompt With Spaces",
      },
    ];
    expect(InteractionPromptsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects autoHideDistanceMeters > 1000", () => {
    const bad = [
      {
        id: "a",
        interactionKind: "chest",
        actionId: "interact",
        labelKey: "p.a",
        autoHideDistanceMeters: 5000,
      },
    ];
    expect(InteractionPromptsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown mode", () => {
    const bad = [
      {
        id: "a",
        interactionKind: "chest",
        actionId: "interact",
        labelKey: "p.a",
        mode: "stutter-tap",
      },
    ];
    expect(InteractionPromptsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown style", () => {
    const bad = [
      {
        id: "a",
        interactionKind: "chest",
        actionId: "interact",
        labelKey: "p.a",
        style: "neon-pink",
      },
    ];
    expect(InteractionPromptsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown anchor", () => {
    const bad = [
      {
        id: "a",
        interactionKind: "chest",
        actionId: "interact",
        labelKey: "p.a",
        anchor: "mini-map",
      },
    ];
    expect(InteractionPromptsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects priority outside [-1000, 1000]", () => {
    const bad = [
      {
        id: "a",
        interactionKind: "chest",
        actionId: "interact",
        labelKey: "p.a",
        priority: 2000,
      },
    ];
    expect(InteractionPromptsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts world-anchored prompt", () => {
    const ok = [
      {
        id: "sign",
        interactionKind: "sign",
        actionId: "interact",
        labelKey: "prompt.sign.read",
        anchor: "world-above",
      },
    ];
    expect(InteractionPromptsManifestSchema.safeParse(ok).success).toBe(true);
  });
});

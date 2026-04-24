import { describe, expect, it } from "vitest";
import {
  InputBindingManifestSchema,
  UserInputBindingsSchema,
  chordToString,
  chordsEqual,
  resolveInputBindings,
  validateInputBindings,
  type InputBindingManifest,
  type UserInputBindings,
} from "./input";

const baseManifest: InputBindingManifest = {
  id: "hyperscape.input.v1",
  name: "Hyperscape Inputs",
  actions: [
    {
      id: "move.forward",
      label: "Move Forward",
      defaults: [{ key: "KeyW", modifiers: [] }],
      rebindable: true,
    },
    {
      id: "ui.toggleMenu",
      label: "Toggle Menu",
      defaults: [{ key: "Escape", modifiers: [] }],
      rebindable: false,
    },
    {
      id: "combat.attack",
      label: "Attack",
      defaults: [{ button: "mouseLeft", modifiers: [] }],
      contexts: ["combat"],
      rebindable: true,
    },
  ],
};

describe("InputBindingManifestSchema", () => {
  it("round-trips via zod parse", () => {
    const parsed = InputBindingManifestSchema.parse(baseManifest);
    expect(parsed.actions).toHaveLength(3);
  });

  it("requires at least one default chord", () => {
    expect(() =>
      InputBindingManifestSchema.parse({
        ...baseManifest,
        actions: [
          { ...baseManifest.actions[0], defaults: [] },
          ...baseManifest.actions.slice(1),
        ],
      }),
    ).toThrow();
  });

  it("defaults rebindable to true", () => {
    const parsed = InputBindingManifestSchema.parse({
      id: "m",
      name: "n",
      actions: [
        {
          id: "a",
          label: "A",
          defaults: [{ key: "KeyA" }],
        },
      ],
    });
    expect(parsed.actions[0].rebindable).toBe(true);
  });

  it("defaults modifiers to an empty array", () => {
    const parsed = InputBindingManifestSchema.parse({
      id: "m",
      name: "n",
      actions: [
        {
          id: "a",
          label: "A",
          defaults: [{ key: "KeyA" }],
        },
      ],
    });
    expect(parsed.actions[0].defaults[0].modifiers).toEqual([]);
  });
});

describe("validateInputBindings", () => {
  it("passes on a clean manifest", () => {
    expect(validateInputBindings(baseManifest).ok).toBe(true);
  });

  it("flags duplicate action ids", () => {
    const issues = validateInputBindings({
      ...baseManifest,
      actions: [
        ...baseManifest.actions,
        {
          id: "move.forward",
          label: "dup",
          defaults: [{ key: "KeyX", modifiers: [] }],
        },
      ],
    }).issues;
    expect(issues.some((i) => i.code === "duplicate-action-id")).toBe(true);
  });

  it("flags a chord that has neither key nor button", () => {
    const issues = validateInputBindings({
      ...baseManifest,
      actions: [
        ...baseManifest.actions,
        {
          id: "broken",
          label: "broken",
          defaults: [{ modifiers: [] }],
        },
      ],
    }).issues;
    expect(issues.some((i) => i.code === "empty-chord")).toBe(true);
  });

  it("flags two actions conflicting in overlapping contexts", () => {
    const issues = validateInputBindings({
      ...baseManifest,
      actions: [
        ...baseManifest.actions,
        {
          id: "other",
          label: "Other",
          defaults: [{ key: "KeyW", modifiers: [] }],
          // context-free → overlaps with move.forward's "everywhere"
        },
      ],
    }).issues;
    expect(issues.some((i) => i.code === "conflict")).toBe(true);
  });

  it("does not flag conflicting chords in disjoint contexts", () => {
    const issues = validateInputBindings({
      ...baseManifest,
      actions: [
        {
          id: "a",
          label: "A",
          defaults: [{ key: "KeyA", modifiers: [] }],
          contexts: ["combat"],
        },
        {
          id: "b",
          label: "B",
          defaults: [{ key: "KeyA", modifiers: [] }],
          contexts: ["menu"],
        },
      ],
    }).issues;
    expect(issues.some((i) => i.code === "conflict")).toBe(false);
  });
});

describe("resolveInputBindings", () => {
  it("returns defaults when user bindings are null", () => {
    const resolved = resolveInputBindings(baseManifest, null);
    expect(resolved.bindings.every((b) => !b.overridden)).toBe(true);
    expect(resolved.bindings[0].chords).toEqual(
      baseManifest.actions[0].defaults,
    );
  });

  it("applies user overrides for matching actions", () => {
    const user: UserInputBindings = {
      schemaVersion: 1,
      manifestId: baseManifest.id,
      updatedAt: 0,
      bindings: [
        {
          actionId: "move.forward",
          chords: [{ key: "ArrowUp", modifiers: [] }],
        },
      ],
    };
    const resolved = resolveInputBindings(baseManifest, user);
    const moveForward = resolved.bindings.find(
      (b) => b.action.id === "move.forward",
    );
    expect(moveForward?.overridden).toBe(true);
    expect(moveForward?.chords).toEqual([{ key: "ArrowUp", modifiers: [] }]);
  });

  it("accepts an explicit empty-chord unbind", () => {
    const user: UserInputBindings = {
      schemaVersion: 1,
      manifestId: baseManifest.id,
      updatedAt: 0,
      bindings: [{ actionId: "move.forward", chords: [] }],
    };
    const resolved = resolveInputBindings(baseManifest, user);
    const moveForward = resolved.bindings.find(
      (b) => b.action.id === "move.forward",
    );
    expect(moveForward?.overridden).toBe(true);
    expect(moveForward?.chords).toEqual([]);
  });

  it("reports droppedOverrides for unknown actionIds", () => {
    const user: UserInputBindings = {
      schemaVersion: 1,
      manifestId: baseManifest.id,
      updatedAt: 0,
      bindings: [{ actionId: "ghost", chords: [{ key: "KeyG" }] }],
    };
    const resolved = resolveInputBindings(baseManifest, user);
    expect(resolved.droppedOverrides).toEqual(["ghost"]);
  });

  it("ignores user bindings that target a different manifest id", () => {
    const user: UserInputBindings = {
      schemaVersion: 1,
      manifestId: "different-id",
      updatedAt: 0,
      bindings: [
        {
          actionId: "move.forward",
          chords: [{ key: "ArrowUp", modifiers: [] }],
        },
      ],
    };
    const resolved = resolveInputBindings(baseManifest, user);
    const moveForward = resolved.bindings.find(
      (b) => b.action.id === "move.forward",
    );
    expect(moveForward?.overridden).toBe(false);
  });
});

describe("chordToString + chordsEqual", () => {
  it("normalizes modifier order", () => {
    const a = chordToString({ key: "KeyK", modifiers: ["shift", "ctrl"] });
    const b = chordToString({ key: "KeyK", modifiers: ["ctrl", "shift"] });
    expect(a).toBe(b);
    expect(a).toBe("ctrl+shift+KeyK");
  });

  it("equality ignores modifier order", () => {
    expect(
      chordsEqual(
        { key: "KeyK", modifiers: ["shift", "ctrl"] },
        { key: "KeyK", modifiers: ["ctrl", "shift"] },
      ),
    ).toBe(true);
  });

  it("different modifiers → unequal", () => {
    expect(
      chordsEqual(
        { key: "KeyK", modifiers: ["shift"] },
        { key: "KeyK", modifiers: ["ctrl"] },
      ),
    ).toBe(false);
  });

  it("pointer-only chord stringifies correctly", () => {
    expect(chordToString({ button: "mouseLeft", modifiers: [] })).toBe(
      "mouseLeft",
    );
  });
});

describe("UserInputBindingsSchema", () => {
  it("pins schemaVersion to 1", () => {
    expect(() =>
      UserInputBindingsSchema.parse({
        schemaVersion: 2,
        manifestId: "x",
        updatedAt: 0,
        bindings: [],
      }),
    ).toThrow();
  });
});

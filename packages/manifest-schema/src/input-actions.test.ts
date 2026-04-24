/**
 * Faithfulness + defensiveness tests for `InputActionsManifestSchema`.
 */

import { describe, expect, it } from "vitest";

import {
  InputActionsManifestSchema,
  type InputActionsManifest,
} from "./input-actions.js";

const reference: InputActionsManifest = [
  {
    id: "jump",
    name: "Jump",
    kind: "button",
    description: "Jump the character",
    category: "movement",
    rebindable: true,
    defaults: [
      {
        source: "key",
        code: "Space",
        modifiers: [],
        scale: 1,
        scheme: "keyboard-mouse",
      },
      {
        source: "gamepad-button",
        code: "0",
        modifiers: [],
        scale: 1,
        scheme: "gamepad",
      },
      {
        source: "touch-region",
        code: "jump-pad",
        modifiers: [],
        scale: 1,
        scheme: "touch",
      },
    ],
  },
  {
    id: "moveForward",
    name: "Move Forward",
    kind: "axis",
    description: "",
    category: "movement",
    rebindable: true,
    defaults: [
      {
        source: "key",
        code: "KeyW",
        modifiers: [],
        scale: 1,
        scheme: "keyboard-mouse",
      },
      {
        source: "gamepad-axis",
        code: "LeftStick",
        modifiers: [],
        scale: -1,
        scheme: "gamepad",
      },
    ],
  },
  {
    id: "openInventory",
    name: "Open Inventory",
    kind: "button",
    description: "",
    category: "ui",
    rebindable: true,
    defaults: [
      {
        source: "key",
        code: "KeyI",
        modifiers: [],
        scale: 1,
        scheme: "keyboard-mouse",
      },
    ],
  },
];

describe("InputActionsManifestSchema", () => {
  it("parses the reference manifest cleanly", () => {
    const result = InputActionsManifestSchema.safeParse(reference);
    if (!result.success) {
      throw new Error(
        `Reference manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("applies defaults on a minimal action", () => {
    const parsed = InputActionsManifestSchema.parse([
      { id: "test", name: "T", kind: "button" },
    ]);
    expect(parsed[0].rebindable).toBe(true);
    expect(parsed[0].category).toBe("");
    expect(parsed[0].description).toBe("");
    expect(parsed[0].defaults).toEqual([]);
  });

  it("applies binding defaults (empty modifiers + scale=1)", () => {
    const parsed = InputActionsManifestSchema.parse([
      {
        id: "t",
        name: "T",
        kind: "button",
        defaults: [{ source: "key", code: "Enter", scheme: "keyboard-mouse" }],
      },
    ]);
    expect(parsed[0].defaults[0].modifiers).toEqual([]);
    expect(parsed[0].defaults[0].scale).toBe(1);
  });

  it("rejects non-camelCase action id", () => {
    const bad = [{ ...reference[0], id: "Jump" }];
    expect(InputActionsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects snake_case action id", () => {
    const bad = [{ ...reference[0], id: "open_inventory" }];
    expect(InputActionsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown action kind", () => {
    const bad = [{ ...reference[0], kind: "trigger" }];
    expect(InputActionsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown binding source", () => {
    const bad = [
      {
        ...reference[0],
        defaults: [
          {
            source: "vr-button",
            code: "A",
            modifiers: [],
            scale: 1,
            scheme: "gamepad",
          },
        ],
      },
    ];
    expect(InputActionsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown binding scheme", () => {
    const bad = [
      {
        ...reference[0],
        defaults: [
          {
            source: "key",
            code: "Space",
            modifiers: [],
            scale: 1,
            scheme: "vr",
          },
        ],
      },
    ];
    expect(InputActionsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate modifiers in a binding", () => {
    const bad = [
      {
        ...reference[0],
        defaults: [
          {
            source: "key",
            code: "Space",
            modifiers: ["shift", "shift"],
            scale: 1,
            scheme: "keyboard-mouse",
          },
        ],
      },
    ];
    expect(InputActionsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown modifier name", () => {
    const bad = [
      {
        ...reference[0],
        defaults: [
          {
            source: "key",
            code: "Space",
            modifiers: ["super"],
            scale: 1,
            scheme: "keyboard-mouse",
          },
        ],
      },
    ];
    expect(InputActionsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects empty binding code", () => {
    const bad = [
      {
        ...reference[0],
        defaults: [
          {
            source: "key",
            code: "",
            modifiers: [],
            scale: 1,
            scheme: "keyboard-mouse",
          },
        ],
      },
    ];
    expect(InputActionsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate action ids", () => {
    const bad = [reference[0], { ...reference[0] }];
    expect(InputActionsManifestSchema.safeParse(bad).success).toBe(false);
  });
});

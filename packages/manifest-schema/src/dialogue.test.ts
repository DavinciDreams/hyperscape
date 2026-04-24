/**
 * Faithfulness + defensiveness tests for `DialogueManifestSchema`.
 */

import { describe, expect, it } from "vitest";

import { DialogueManifestSchema, type DialogueManifest } from "./dialogue.js";

const reference: DialogueManifest = [
  {
    id: "npc_greeter_intro",
    name: "Greeter intro",
    description: "First-meeting dialogue with the Lumbridge greeter.",
    start: "greet",
    nodes: {
      greet: {
        id: "greet",
        label: "opening line",
        kind: "line",
        speaker: "npc_greeter",
        textKey: "npc.greeter.hello",
        next: "ask_help",
      },
      ask_help: {
        id: "ask_help",
        label: "ask about help",
        kind: "choice",
        promptKey: "npc.greeter.prompt",
        options: [
          {
            textKey: "npc.greeter.option.accept",
            next: "give_quest",
            showIf: "",
            action: "",
          },
          {
            textKey: "npc.greeter.option.decline",
            next: "bye",
            showIf: "",
            action: "",
          },
        ],
      },
      give_quest: {
        id: "give_quest",
        label: "fire quest accept",
        kind: "action",
        action: "quest.accept",
        params: { questId: "lumbridge_intro" },
        next: "bye",
      },
      bye: {
        id: "bye",
        label: "goodbye line",
        kind: "line",
        speaker: "npc_greeter",
        textKey: "npc.greeter.goodbye",
        next: "finish",
      },
      finish: {
        id: "finish",
        label: "done",
        kind: "end",
      },
    },
  },
];

describe("DialogueManifestSchema", () => {
  it("parses the reference manifest cleanly", () => {
    const result = DialogueManifestSchema.safeParse(reference);
    if (!result.success) {
      throw new Error(
        `Reference manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("applies defaults on a minimal valid tree", () => {
    const parsed = DialogueManifestSchema.parse([
      {
        id: "t",
        name: "T",
        start: "a",
        nodes: {
          a: { id: "a", kind: "end" },
        },
      },
    ]);
    expect(parsed[0].description).toBe("");
    const a = parsed[0].nodes.a;
    if (a.kind === "end") {
      expect(a.label).toBe("");
    } else {
      throw new Error("expected end node");
    }
  });

  it("rejects start pointing at unknown node", () => {
    const bad = [
      {
        id: "t",
        name: "T",
        start: "nope",
        nodes: {
          a: { id: "a", kind: "end" },
        },
      },
    ];
    expect(DialogueManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects node id mismatch between key and `id` field", () => {
    const bad = [
      {
        id: "t",
        name: "T",
        start: "a",
        nodes: {
          a: { id: "b", kind: "end" },
        },
      },
    ];
    expect(DialogueManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects line node with unknown `next`", () => {
    const bad = [
      {
        id: "t",
        name: "T",
        start: "a",
        nodes: {
          a: {
            id: "a",
            kind: "line",
            speaker: "x",
            textKey: "greet",
            next: "missing",
          },
        },
      },
    ];
    expect(DialogueManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects choice option pointing at unknown node", () => {
    const bad = [
      {
        id: "t",
        name: "T",
        start: "a",
        nodes: {
          a: {
            id: "a",
            kind: "choice",
            options: [{ textKey: "go", next: "nowhere" }],
          },
          end: { id: "end", kind: "end" },
        },
      },
    ];
    expect(DialogueManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects branch pointing at unknown node", () => {
    const bad = [
      {
        id: "t",
        name: "T",
        start: "a",
        nodes: {
          a: {
            id: "a",
            kind: "branch",
            condition: "hasItem",
            ifTrue: "yes",
            ifFalse: "nope",
          },
          yes: { id: "yes", kind: "end" },
        },
      },
    ];
    expect(DialogueManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects tree with no `end` node", () => {
    const bad = [
      {
        id: "t",
        name: "T",
        start: "a",
        nodes: {
          a: { id: "a", kind: "line", speaker: "x", textKey: "hi", next: "a" },
        },
      },
    ];
    expect(DialogueManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects non-ASCII translation key", () => {
    const bad = [
      {
        id: "t",
        name: "T",
        start: "a",
        nodes: {
          a: {
            id: "a",
            kind: "line",
            speaker: "x",
            textKey: "npc.café",
            next: "b",
          },
          b: { id: "b", kind: "end" },
        },
      },
    ];
    expect(DialogueManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects empty choice options", () => {
    const bad = [
      {
        id: "t",
        name: "T",
        start: "a",
        nodes: {
          a: { id: "a", kind: "choice", options: [] },
          b: { id: "b", kind: "end" },
        },
      },
    ];
    expect(DialogueManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects empty speaker on line", () => {
    const bad = [
      {
        id: "t",
        name: "T",
        start: "a",
        nodes: {
          a: { id: "a", kind: "line", speaker: "", textKey: "hi", next: "b" },
          b: { id: "b", kind: "end" },
        },
      },
    ];
    expect(DialogueManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects empty action name on action node", () => {
    const bad = [
      {
        id: "t",
        name: "T",
        start: "a",
        nodes: {
          a: { id: "a", kind: "action", action: "", next: "b" },
          b: { id: "b", kind: "end" },
        },
      },
    ];
    expect(DialogueManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate tree ids", () => {
    const bad = [reference[0], { ...reference[0] }];
    expect(DialogueManifestSchema.safeParse(bad).success).toBe(false);
  });
});

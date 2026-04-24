import {
  DialogueTreeSchema,
  type DialogueTree,
} from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import {
  DialogueIllegalTransitionError,
  DialogueRunner,
  DialogueTransparentHopLimitError,
  type DialogueActionParams,
  type DialogueContext,
} from "../DialogueRunner.js";

/**
 * Spy-backed context. Captures every action call in-order for
 * assertions and exposes a settable predicate table. Missing
 * predicates default to `false` (the schema forbids empty-string
 * inside runtime calls — "always" branches have empty string which
 * the runner short-circuits before reaching us).
 */
function makeContext(
  opts: {
    predicates?: Record<string, boolean>;
  } = {},
): DialogueContext & {
  calls: Array<{ action: string; params: DialogueActionParams }>;
} {
  const calls: Array<{ action: string; params: DialogueActionParams }> = [];
  return {
    evaluateCondition: (name) => opts.predicates?.[name] ?? false,
    executeAction: (action, params) => {
      calls.push({ action, params });
    },
    calls,
  };
}

function parseTree(raw: unknown): DialogueTree {
  return DialogueTreeSchema.parse(raw);
}

describe("DialogueRunner — basic traversal", () => {
  it("start() walks from the start pointer to the first line", () => {
    const tree = parseTree({
      id: "greet",
      name: "Greet",
      start: "intro",
      nodes: {
        intro: {
          id: "intro",
          kind: "line",
          speaker: "npc.shopkeeper",
          textKey: "shop.greet",
          next: "end",
        },
        end: { id: "end", kind: "end" },
      },
    });
    const runner = new DialogueRunner(tree);
    const ctx = makeContext();
    runner.start(ctx);
    expect(runner.currentNodeId).toBe("intro");
    expect(runner.isEnded).toBe(false);
    expect(runner.present(ctx)).toEqual({
      kind: "line",
      speaker: "npc.shopkeeper",
      textKey: "shop.greet",
      sfxId: undefined,
    });
  });

  it("advance() moves past a line to the next visible node (end)", () => {
    const tree = parseTree({
      id: "t",
      name: "T",
      start: "l",
      nodes: {
        l: {
          id: "l",
          kind: "line",
          speaker: "n",
          textKey: "k",
          next: "e",
        },
        e: { id: "e", kind: "end" },
      },
    });
    const runner = new DialogueRunner(tree);
    const ctx = makeContext();
    runner.start(ctx);
    runner.advance(ctx);
    expect(runner.currentNodeId).toBe("e");
    expect(runner.isEnded).toBe(true);
    expect(runner.present(ctx)).toEqual({ kind: "end" });
  });

  it("present() surfaces optional sfxId on line nodes", () => {
    const tree = parseTree({
      id: "t",
      name: "T",
      start: "l",
      nodes: {
        l: {
          id: "l",
          kind: "line",
          speaker: "n",
          textKey: "k",
          sfxId: "sfx.door_creak",
          next: "e",
        },
        e: { id: "e", kind: "end" },
      },
    });
    const runner = new DialogueRunner(tree);
    const ctx = makeContext();
    runner.start(ctx);
    const pres = runner.present(ctx);
    expect(pres.kind).toBe("line");
    if (pres.kind === "line") {
      expect(pres.sfxId).toBe("sfx.door_creak");
    }
  });
});

describe("DialogueRunner — transparent nodes (action, branch)", () => {
  it("walks through action nodes executing side effects in order", () => {
    const tree = parseTree({
      id: "t",
      name: "T",
      start: "a1",
      nodes: {
        a1: {
          id: "a1",
          kind: "action",
          action: "quest.start",
          params: { questId: "q1" },
          next: "a2",
        },
        a2: {
          id: "a2",
          kind: "action",
          action: "sfx.play",
          params: { clip: "fanfare" },
          next: "l",
        },
        l: {
          id: "l",
          kind: "line",
          speaker: "narrator",
          textKey: "quest.q1.start",
          next: "e",
        },
        e: { id: "e", kind: "end" },
      },
    });
    const runner = new DialogueRunner(tree);
    const ctx = makeContext();
    runner.start(ctx);
    expect(ctx.calls).toEqual([
      { action: "quest.start", params: { questId: "q1" } },
      { action: "sfx.play", params: { clip: "fanfare" } },
    ]);
    expect(runner.currentNodeId).toBe("l");
  });

  it("branch follows ifTrue when condition is true", () => {
    const tree = parseTree({
      id: "t",
      name: "T",
      start: "b",
      nodes: {
        b: {
          id: "b",
          kind: "branch",
          condition: "has_sword",
          ifTrue: "lt",
          ifFalse: "lf",
        },
        lt: {
          id: "lt",
          kind: "line",
          speaker: "n",
          textKey: "true",
          next: "e",
        },
        lf: {
          id: "lf",
          kind: "line",
          speaker: "n",
          textKey: "false",
          next: "e",
        },
        e: { id: "e", kind: "end" },
      },
    });
    const runner = new DialogueRunner(tree);
    const ctx = makeContext({ predicates: { has_sword: true } });
    runner.start(ctx);
    expect(runner.currentNodeId).toBe("lt");
  });

  it("branch follows ifFalse when condition is false (default)", () => {
    const tree = parseTree({
      id: "t",
      name: "T",
      start: "b",
      nodes: {
        b: {
          id: "b",
          kind: "branch",
          condition: "has_sword",
          ifTrue: "lt",
          ifFalse: "lf",
        },
        lt: {
          id: "lt",
          kind: "line",
          speaker: "n",
          textKey: "true",
          next: "e",
        },
        lf: {
          id: "lf",
          kind: "line",
          speaker: "n",
          textKey: "false",
          next: "e",
        },
        e: { id: "e", kind: "end" },
      },
    });
    const runner = new DialogueRunner(tree);
    const ctx = makeContext();
    runner.start(ctx);
    expect(runner.currentNodeId).toBe("lf");
  });

  it("transparent hop limit trips on author-introduced cycle", () => {
    const tree = parseTree({
      id: "t",
      name: "T",
      start: "a1",
      nodes: {
        a1: {
          id: "a1",
          kind: "action",
          action: "noop",
          params: {},
          next: "a2",
        },
        a2: {
          id: "a2",
          kind: "action",
          action: "noop",
          params: {},
          next: "a1",
        },
        // Schema requires at least one end node.
        dead: { id: "dead", kind: "end" },
      },
    });
    const runner = new DialogueRunner(tree, { maxTransparentHops: 8 });
    const ctx = makeContext();
    let caught: unknown;
    try {
      runner.start(ctx);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(DialogueTransparentHopLimitError);
  });
});

describe("DialogueRunner — choice nodes", () => {
  function choiceTree(): DialogueTree {
    return parseTree({
      id: "t",
      name: "T",
      start: "c",
      nodes: {
        c: {
          id: "c",
          kind: "choice",
          promptKey: "c.prompt",
          options: [
            { textKey: "c.a", next: "la", showIf: "", action: "" },
            {
              textKey: "c.b",
              next: "lb",
              showIf: "unlocked_b",
              action: "analytics.chose_b",
            },
            { textKey: "c.c", next: "lc", showIf: "", action: "" },
          ],
        },
        la: { id: "la", kind: "line", speaker: "n", textKey: "la", next: "e" },
        lb: { id: "lb", kind: "line", speaker: "n", textKey: "lb", next: "e" },
        lc: { id: "lc", kind: "line", speaker: "n", textKey: "lc", next: "e" },
        e: { id: "e", kind: "end" },
      },
    });
  }

  it("present() filters options by showIf predicate", () => {
    const runner = new DialogueRunner(choiceTree());
    const ctx = makeContext(); // unlocked_b = false
    runner.start(ctx);
    const pres = runner.present(ctx);
    expect(pres.kind).toBe("choice");
    if (pres.kind === "choice") {
      expect(pres.options).toEqual([
        { originalIndex: 0, textKey: "c.a", action: "" },
        { originalIndex: 2, textKey: "c.c", action: "" },
      ]);
      expect(pres.promptKey).toBe("c.prompt");
    }
  });

  it("present() exposes showIf-gated options when predicate is true", () => {
    const runner = new DialogueRunner(choiceTree());
    const ctx = makeContext({ predicates: { unlocked_b: true } });
    runner.start(ctx);
    const pres = runner.present(ctx);
    if (pres.kind !== "choice") throw new Error("expected choice");
    expect(pres.options).toHaveLength(3);
    expect(pres.options[1]?.originalIndex).toBe(1);
  });

  it("pickChoice() fires the option's action then advances", () => {
    const runner = new DialogueRunner(choiceTree());
    const ctx = makeContext({ predicates: { unlocked_b: true } });
    runner.start(ctx);
    runner.pickChoice(1, ctx);
    expect(ctx.calls).toEqual([{ action: "analytics.chose_b", params: {} }]);
    expect(runner.currentNodeId).toBe("lb");
  });

  it("pickChoice() rejects a hidden option (showIf failed)", () => {
    const runner = new DialogueRunner(choiceTree());
    const ctx = makeContext(); // unlocked_b = false
    runner.start(ctx);
    expect(() => runner.pickChoice(1, ctx)).toThrow(
      DialogueIllegalTransitionError,
    );
  });

  it("pickChoice() rejects out-of-range index", () => {
    const runner = new DialogueRunner(choiceTree());
    const ctx = makeContext();
    runner.start(ctx);
    expect(() => runner.pickChoice(99, ctx)).toThrow(
      DialogueIllegalTransitionError,
    );
  });

  it("advance() on a choice node is illegal", () => {
    const runner = new DialogueRunner(choiceTree());
    const ctx = makeContext();
    runner.start(ctx);
    expect(() => runner.advance(ctx)).toThrow(DialogueIllegalTransitionError);
  });
});

describe("DialogueRunner — lifecycle errors + reset", () => {
  const tree = () =>
    parseTree({
      id: "t",
      name: "T",
      start: "l",
      nodes: {
        l: { id: "l", kind: "line", speaker: "n", textKey: "k", next: "e" },
        e: { id: "e", kind: "end" },
      },
    });

  it("present() throws before start()", () => {
    const runner = new DialogueRunner(tree());
    const ctx = makeContext();
    expect(() => runner.present(ctx)).toThrow(DialogueIllegalTransitionError);
  });

  it("advance() on end is illegal", () => {
    const runner = new DialogueRunner(tree());
    const ctx = makeContext();
    runner.start(ctx);
    runner.advance(ctx);
    expect(runner.isEnded).toBe(true);
    expect(() => runner.advance(ctx)).toThrow(DialogueIllegalTransitionError);
  });

  it("reset() returns the runner to unstarted state at the start pointer", () => {
    const runner = new DialogueRunner(tree());
    const ctx = makeContext();
    runner.start(ctx);
    runner.advance(ctx);
    expect(runner.isEnded).toBe(true);

    runner.reset();
    expect(runner.isStarted).toBe(false);
    expect(runner.isEnded).toBe(false);
    expect(runner.currentNodeId).toBe("l");

    runner.start(ctx);
    expect(runner.isStarted).toBe(true);
    expect(runner.currentNodeId).toBe("l");
  });
});

describe("DialogueRunner — realistic quest-giver flow", () => {
  it("line → choice → branch → action → line → end", () => {
    const tree = parseTree({
      id: "quest_intro",
      name: "Quest Intro",
      start: "greet",
      nodes: {
        greet: {
          id: "greet",
          kind: "line",
          speaker: "npc.elder",
          textKey: "quest.intro",
          next: "offer",
        },
        offer: {
          id: "offer",
          kind: "choice",
          promptKey: "quest.prompt",
          options: [
            {
              textKey: "quest.accept",
              next: "check_level",
              showIf: "",
              action: "",
            },
            {
              textKey: "quest.decline",
              next: "farewell",
              showIf: "",
              action: "",
            },
          ],
        },
        check_level: {
          id: "check_level",
          kind: "branch",
          condition: "player_level_ge_5",
          ifTrue: "grant",
          ifFalse: "too_weak",
        },
        grant: {
          id: "grant",
          kind: "action",
          action: "quest.grant",
          params: { questId: "q_intro" },
          next: "accepted",
        },
        accepted: {
          id: "accepted",
          kind: "line",
          speaker: "npc.elder",
          textKey: "quest.accepted",
          next: "e",
        },
        too_weak: {
          id: "too_weak",
          kind: "line",
          speaker: "npc.elder",
          textKey: "quest.too_weak",
          next: "e",
        },
        farewell: {
          id: "farewell",
          kind: "line",
          speaker: "npc.elder",
          textKey: "quest.farewell",
          next: "e",
        },
        e: { id: "e", kind: "end" },
      },
    });

    const runner = new DialogueRunner(tree);
    const ctx = makeContext({ predicates: { player_level_ge_5: true } });

    runner.start(ctx);
    expect(runner.currentNodeId).toBe("greet");

    runner.advance(ctx);
    expect(runner.currentNodeId).toBe("offer");

    runner.pickChoice(0, ctx);
    // Walked: offer → check_level (branch, true) → grant (action) → accepted.
    expect(runner.currentNodeId).toBe("accepted");
    expect(ctx.calls).toEqual([
      { action: "quest.grant", params: { questId: "q_intro" } },
    ]);

    runner.advance(ctx);
    expect(runner.isEnded).toBe(true);
  });

  it("same tree, under-leveled player lands on too_weak", () => {
    const tree = parseTree({
      id: "quest_intro",
      name: "Quest Intro",
      start: "greet",
      nodes: {
        greet: {
          id: "greet",
          kind: "line",
          speaker: "npc.elder",
          textKey: "quest.intro",
          next: "offer",
        },
        offer: {
          id: "offer",
          kind: "choice",
          options: [
            {
              textKey: "quest.accept",
              next: "check_level",
              showIf: "",
              action: "",
            },
          ],
        },
        check_level: {
          id: "check_level",
          kind: "branch",
          condition: "player_level_ge_5",
          ifTrue: "grant",
          ifFalse: "too_weak",
        },
        grant: {
          id: "grant",
          kind: "action",
          action: "quest.grant",
          params: { questId: "q_intro" },
          next: "accepted",
        },
        accepted: {
          id: "accepted",
          kind: "line",
          speaker: "n",
          textKey: "q.a",
          next: "e",
        },
        too_weak: {
          id: "too_weak",
          kind: "line",
          speaker: "n",
          textKey: "q.w",
          next: "e",
        },
        e: { id: "e", kind: "end" },
      },
    });

    const runner = new DialogueRunner(tree);
    const ctx = makeContext(); // player_level_ge_5 = false
    runner.start(ctx);
    runner.advance(ctx);
    runner.pickChoice(0, ctx);
    expect(runner.currentNodeId).toBe("too_weak");
    expect(ctx.calls).toEqual([]); // grant never fired
  });
});

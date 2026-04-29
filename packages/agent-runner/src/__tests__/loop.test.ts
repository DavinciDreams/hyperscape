/**
 * Loop dispatcher tests. Uses `FakeLLM` to script Anthropic-shaped
 * responses, runs them through `runAgentLoop`, asserts every
 * dispatch path works correctly.
 *
 * Where this test lives in the stack: above the per-action unit
 * tests in `eliza-game-builder` (which validate handler logic),
 * below the live-LLM example (which exercises the real API). This
 * is the seam-test layer — proves the conversion from Anthropic's
 * tool-use vocabulary to ElizaOS's action-handler vocabulary works
 * round-trip.
 */

import { describe, expect, it } from "vitest";
import {
  GameBuilderService,
  catalogStatsAction,
  listWidgetsAction,
  getWidgetAction,
  proposeUIPackAction,
} from "@hyperforge/eliza-game-builder";
import type { StaticCatalogDocument } from "@hyperforge/widget-catalog";
import { FakeLLM, textBlock, toolUseBlock } from "../fakeLLM.js";
import { runAgentLoop } from "../loop.js";

const fixtureCatalog: StaticCatalogDocument = {
  version: 1,
  builtAt: "2026-04-28T19:00:00.000Z",
  widgets: [
    {
      id: "com.test.demo.alpha",
      name: "Alpha",
      description: "First demo widget",
      category: "panel",
      defaultSize: { width: 4, height: 3 },
      icon: "",
      props: [],
      defaultProps: {},
      jsdocSummary: "",
      sourcePath: "",
    },
    {
      id: "com.test.demo.beta",
      name: "Beta",
      description: "Second demo widget",
      category: "hud",
      defaultSize: { width: 2, height: 2 },
      icon: "",
      props: [],
      defaultProps: {},
      jsdocSummary: "",
      sourcePath: "",
    },
  ],
  stats: { total: 2, byCategory: { panel: 1, hud: 1 } },
};

function makeRuntime() {
  const service = GameBuilderService.create({ catalog: fixtureCatalog });
  return {
    getService: <T>(name: string) =>
      name === "gameBuilderService" ? (service as unknown as T) : null,
  } as unknown as import("@elizaos/core").IAgentRuntime;
}

const ACTIONS = [
  catalogStatsAction,
  listWidgetsAction,
  getWidgetAction,
  proposeUIPackAction,
];

describe("runAgentLoop", () => {
  it("returns immediately when LLM emits no tool calls", async () => {
    const llm = new FakeLLM([
      {
        content: [textBlock("I don't need any tools.")],
        stop_reason: "end_turn",
      },
    ]);
    const result = await runAgentLoop({
      messages: [{ role: "user", content: "Hi" }],
      actions: ACTIONS,
      runtime: makeRuntime(),
      llm,
    });
    expect(result.finished).toBe(true);
    expect(result.truncated).toBe(false);
    expect(result.turns.length).toBe(1);
    expect(result.turns[0]!.toolCalls).toEqual([]);
    expect(result.finalText).toBe("I don't need any tools.");
  });

  it("dispatches a single tool call and continues", async () => {
    const llm = new FakeLLM([
      {
        content: [toolUseBlock("u1", "GET_CATALOG_STATS", {})],
      },
      {
        content: [textBlock("Got it. We have 2 widgets.")],
        stop_reason: "end_turn",
      },
    ]);
    const result = await runAgentLoop({
      messages: [{ role: "user", content: "How many widgets?" }],
      actions: ACTIONS,
      runtime: makeRuntime(),
      llm,
    });
    expect(result.finished).toBe(true);
    expect(result.turns.length).toBe(2);
    expect(result.turns[0]!.toolCalls.length).toBe(1);
    expect(result.turns[0]!.toolCalls[0]!.name).toBe("GET_CATALOG_STATS");
    expect(result.turns[0]!.toolCalls[0]!.result?.success).toBe(true);
    expect(result.finalText).toContain("2 widgets");
  });

  it("walks the full design loop with multiple tool calls", async () => {
    // Three turns: stats → list → propose-pack → final text.
    const validPack = {
      version: 1,
      id: "minimal-hud",
      name: "Minimal HUD",
      widgets: [{ id: "com.test.demo.alpha" }],
      layouts: {
        default: {
          id: "x",
          name: "y",
          revision: 1,
          instances: [
            {
              instanceId: "i1",
              widgetId: "com.test.demo.alpha",
              position: {
                kind: "anchored",
                anchor: "top-left",
                offset: { x: 0, y: 0 },
              },
              props: {},
            },
          ],
        },
      },
    };
    const llm = new FakeLLM([
      {
        content: [toolUseBlock("u1", "GET_CATALOG_STATS", {})],
      },
      {
        content: [
          toolUseBlock("u2", "LIST_GAME_WIDGETS", { category: "panel" }),
        ],
      },
      {
        content: [toolUseBlock("u3", "PROPOSE_UI_PACK", { pack: validPack })],
      },
      {
        content: [textBlock("Pack shipped. 1 widget in the default layout.")],
        stop_reason: "end_turn",
      },
    ]);
    const result = await runAgentLoop({
      messages: [{ role: "user", content: "Build a minimal panel HUD." }],
      actions: ACTIONS,
      runtime: makeRuntime(),
      llm,
    });
    expect(result.finished).toBe(true);
    expect(result.turns.length).toBe(4);
    const calls = result.turns.flatMap((t) => t.toolCalls.map((c) => c.name));
    expect(calls).toEqual([
      "GET_CATALOG_STATS",
      "LIST_GAME_WIDGETS",
      "PROPOSE_UI_PACK",
    ]);
    expect(result.lastUIPack).toBeDefined();
    const captured = result.lastUIPack as { id: string };
    expect(captured.id).toBe("minimal-hud");
  });

  it("surfaces tool failures back to the model and recovers on retry", async () => {
    // Turn 1: agent submits an invalid pack (missing `id`).
    // Turn 2: agent reads the issue list and fixes it.
    // Turn 3: agent finishes.
    const badPack = {
      version: 1,
      name: "Broken",
      widgets: [],
      layouts: {
        default: {
          id: "x",
          name: "y",
          revision: 1,
          instances: [],
        },
      },
    };
    const fixedPack = { ...badPack, id: "broken-fixed" };
    const llm = new FakeLLM([
      {
        content: [toolUseBlock("u1", "PROPOSE_UI_PACK", { pack: badPack })],
      },
      {
        content: [toolUseBlock("u2", "PROPOSE_UI_PACK", { pack: fixedPack })],
      },
      {
        content: [textBlock("Fixed and accepted.")],
        stop_reason: "end_turn",
      },
    ]);
    const result = await runAgentLoop({
      messages: [{ role: "user", content: "Build a HUD." }],
      actions: ACTIONS,
      runtime: makeRuntime(),
      llm,
    });
    expect(result.finished).toBe(true);
    expect(result.turns[0]!.toolCalls[0]!.result?.success).toBe(false);
    expect(result.turns[1]!.toolCalls[0]!.result?.success).toBe(true);
    const captured = result.lastUIPack as { id: string };
    expect(captured.id).toBe("broken-fixed");
  });

  it("returns truncated=true when maxTurns exceeded", async () => {
    // Script always emits tool_use → loop never exits naturally.
    const llm = new FakeLLM([
      { content: [toolUseBlock("u1", "GET_CATALOG_STATS", {})] },
      { content: [toolUseBlock("u2", "GET_CATALOG_STATS", {})] },
      { content: [toolUseBlock("u3", "GET_CATALOG_STATS", {})] },
    ]);
    const result = await runAgentLoop({
      messages: [{ role: "user", content: "Loop forever" }],
      actions: ACTIONS,
      runtime: makeRuntime(),
      llm,
      maxTurns: 3,
    });
    expect(result.finished).toBe(false);
    expect(result.truncated).toBe(true);
    expect(result.turns.length).toBe(3);
  });

  it("handles unknown tool names gracefully", async () => {
    const llm = new FakeLLM([
      {
        content: [toolUseBlock("u1", "DOES_NOT_EXIST", {})],
      },
      {
        content: [textBlock("My bad, that tool doesn't exist.")],
        stop_reason: "end_turn",
      },
    ]);
    const result = await runAgentLoop({
      messages: [{ role: "user", content: "Try a bad tool" }],
      actions: ACTIONS,
      runtime: makeRuntime(),
      llm,
    });
    expect(result.finished).toBe(true);
    expect(result.turns[0]!.toolCalls[0]!.result).toBeUndefined();
  });

  it("supports onTurn progress callback", async () => {
    const seen: number[] = [];
    const llm = new FakeLLM([
      {
        content: [toolUseBlock("u1", "GET_CATALOG_STATS", {})],
      },
      {
        content: [textBlock("done")],
        stop_reason: "end_turn",
      },
    ]);
    await runAgentLoop({
      messages: [{ role: "user", content: "Hi" }],
      actions: ACTIONS,
      runtime: makeRuntime(),
      llm,
      onTurn: (t) => seen.push(t.turn),
    });
    expect(seen).toEqual([0, 1]);
  });

  it("forwards tools and system prompt to the LLM client", async () => {
    const llm = new FakeLLM([
      {
        content: [textBlock("noop")],
        stop_reason: "end_turn",
      },
    ]);
    await runAgentLoop({
      messages: [{ role: "user", content: "Hi" }],
      actions: ACTIONS,
      runtime: makeRuntime(),
      llm,
      system: "You are a helpful game-builder.",
      model: "claude-test-model",
    });
    expect(llm.seenRequests.length).toBe(1);
    const req = llm.seenRequests[0]!;
    expect(req.system).toBe("You are a helpful game-builder.");
    expect(req.model).toBe("claude-test-model");
    expect(req.tools.map((t) => t.name).sort()).toEqual([
      "GET_CATALOG_STATS",
      "GET_GAME_WIDGET",
      "LIST_GAME_WIDGETS",
      "PROPOSE_UI_PACK",
    ]);
  });
});

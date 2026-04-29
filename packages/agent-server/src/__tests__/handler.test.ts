/**
 * Handler tests. Validate the request → agent loop → response chain
 * end-to-end with a `FakeLLM`. No real API calls.
 */

import { describe, expect, it } from "vitest";
import { FakeLLM, textBlock, toolUseBlock } from "@hyperforge/agent-runner";
import { GameBuilderService } from "@hyperforge/eliza-game-builder";
import type { StaticCatalogDocument } from "@hyperforge/widget-catalog";
import { handleDesignRequest, parseDesignRequest } from "../handler.js";

const fixtureCatalog: StaticCatalogDocument = {
  version: 1,
  builtAt: "2026-04-28T19:00:00.000Z",
  widgets: [
    {
      id: "com.test.demo.alpha",
      name: "Alpha",
      description: "First widget",
      category: "panel",
      defaultSize: { width: 4, height: 3 },
      icon: "",
      props: [],
      defaultProps: {},
      jsdocSummary: "",
      sourcePath: "",
    },
  ],
  stats: { total: 1, byCategory: { panel: 1 } },
};

function makeService(): GameBuilderService {
  return GameBuilderService.create({ catalog: fixtureCatalog });
}

const validPack = {
  version: 1,
  id: "test-pack",
  name: "Test Pack",
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

describe("parseDesignRequest", () => {
  it("accepts a valid body", () => {
    const r = parseDesignRequest({ prompt: "design a HUD" });
    expect("ok" in r && r.ok === false).toBe(false);
    expect((r as { prompt: string }).prompt).toBe("design a HUD");
  });

  it("rejects non-object body", () => {
    const r = parseDesignRequest("not an object");
    expect("ok" in r && r.ok === false).toBe(true);
  });

  it("rejects missing prompt field", () => {
    const r = parseDesignRequest({});
    if (!("ok" in r) || r.ok !== false) throw new Error("should be error");
    expect(r.code).toBe("MISSING_PROMPT");
  });

  it("forwards optional model + maxTurns", () => {
    const r = parseDesignRequest({
      prompt: "x",
      model: "claude-haiku",
      maxTurns: 3,
    }) as { model: string; maxTurns: number };
    expect(r.model).toBe("claude-haiku");
    expect(r.maxTurns).toBe(3);
  });
});

describe("handleDesignRequest", () => {
  it("returns ok with pack when agent emits PROPOSE_UI_PACK", async () => {
    const llm = new FakeLLM([
      { content: [toolUseBlock("u1", "GET_CATALOG_STATS", {})] },
      {
        content: [toolUseBlock("u2", "PROPOSE_UI_PACK", { pack: validPack })],
      },
      {
        content: [textBlock("Done.")],
        stop_reason: "end_turn",
      },
    ]);

    const result = await handleDesignRequest(
      { prompt: "design a HUD" },
      { llm, service: makeService() },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pack).toBeDefined();
    expect((result.pack as { id: string }).id).toBe("test-pack");
    expect(result.finalText).toContain("Done");
    expect(result.turns).toBe(3);
    expect(result.truncated).toBe(false);
  });

  it("returns ok with null pack when agent never proposes", async () => {
    const llm = new FakeLLM([
      {
        content: [textBlock("I won't design today.")],
        stop_reason: "end_turn",
      },
    ]);
    const result = await handleDesignRequest(
      { prompt: "hi" },
      { llm, service: makeService() },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pack).toBeNull();
  });

  it("returns MISSING_PROMPT error for empty prompt", async () => {
    const llm = new FakeLLM([]);
    const result = await handleDesignRequest(
      { prompt: "   " },
      { llm, service: makeService() },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("MISSING_PROMPT");
  });

  it("returns AGENT_FAILED when llm throws", async () => {
    const llm = {
      async sendMessage() {
        throw new Error("connection refused");
      },
    };
    const result = await handleDesignRequest(
      { prompt: "design something" },
      { llm, service: makeService() },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("AGENT_FAILED");
    expect(result.error).toContain("connection refused");
  });

  it("forwards onTurn callback to the loop", async () => {
    const llm = new FakeLLM([
      { content: [toolUseBlock("u1", "GET_CATALOG_STATS", {})] },
      { content: [textBlock("done")], stop_reason: "end_turn" },
    ]);
    const seen: Array<{ turn: number; calls: ReadonlyArray<string> }> = [];
    await handleDesignRequest(
      { prompt: "x" },
      {
        llm,
        service: makeService(),
        onTurn: (turn, calls) => seen.push({ turn, calls }),
      },
    );
    expect(seen.length).toBe(2);
    expect(seen[0]!.calls).toEqual(["GET_CATALOG_STATS"]);
    expect(seen[1]!.calls).toEqual([]);
  });

  it("respects per-request maxTurns", async () => {
    // Endless tool calls — should hit maxTurns=2 and report truncated.
    const llm = new FakeLLM([
      { content: [toolUseBlock("u1", "GET_CATALOG_STATS", {})] },
      { content: [toolUseBlock("u2", "GET_CATALOG_STATS", {})] },
    ]);
    const result = await handleDesignRequest(
      { prompt: "loop", maxTurns: 2 },
      { llm, service: makeService() },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.truncated).toBe(true);
    expect(result.turns).toBe(2);
  });
});

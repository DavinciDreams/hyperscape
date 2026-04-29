/**
 * Live agent demo. Runs the full agent loop against the real
 * Anthropic API with the live 52-widget catalog.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-ant-... bun run packages/agent-runner/examples/live-agent.ts
 *
 * Optional flags:
 *   --prompt="<text>"   override the default user prompt
 *   --model=<id>        override the model (default: claude-sonnet-4-5)
 *   --max-turns=<n>     stop after N turns (default: 10)
 *
 * What this proves:
 *   - The action descriptions are good enough for a real LLM to
 *     pick the right tool given a free-form user prompt.
 *   - The parameter schemas survive the round-trip into Anthropic
 *     tool format and back.
 *   - The loop converges — Claude eventually emits a `PROPOSE_UI_PACK`
 *     and stops calling tools.
 *   - The validated UIPack is captured on `result.lastUIPack` for
 *     the host to feed to `loadUIPackOnClient`.
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import {
  GameBuilderService,
  catalogStatsAction,
  listWidgetsAction,
  getWidgetAction,
  searchWidgetsAction,
  proposeUIPackAction,
  scaffoldWidgetAction,
} from "@hyperforge/eliza-game-builder";
import { runAgentLoop, type LLMClient } from "../src/index.js";

// Load package-local `.env` so the key can live next to the example
// regardless of the cwd the script is invoked from. Variables already
// set in the environment win — explicit override.
loadPackageEnv();

function loadPackageEnv(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const envPath = resolve(here, "..", ".env");
  if (!existsSync(envPath)) return;
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const DEFAULT_PROMPT =
  "Design a minimal HUD for a Hyperia world. I want just an HP bar in the top-left and a chat log in the bottom-left. Don't include anything else. Use existing widgets from the catalog if available.";

const DEFAULT_MODEL = "claude-sonnet-4-5";

const SYSTEM_PROMPT = `You are HyperForge's game-builder agent. Your job is to design UI packs for Hyperia worlds by composing existing widgets from the catalog.

Workflow:
1. Start with GET_CATALOG_STATS to see what's available.
2. Use LIST_GAME_WIDGETS or SEARCH_GAME_WIDGETS to find candidate widgets.
3. Use GET_GAME_WIDGET to inspect a candidate's prop schema before using it.
4. Compose a UIPackManifest that uses widgets you've verified exist. Submit via PROPOSE_UI_PACK.
5. If the pack fails validation, read the issues and fix them in your next call.

The UIPackManifest schema requires: version: 1, id (string), name (string), widgets (array of {id}), and layouts.default with {id, name, revision, instances[]}. Each instance needs instanceId, widgetId, position {kind: "anchored", anchor: <one of: top-left, top-right, top-center, bottom-left, bottom-right, bottom-center, middle-left, middle-right, middle-center>, offset: {x, y}}, and props ({} if you don't customize).

Be concise. Don't list every widget in the catalog — pick what's relevant.`;

function parseFlag(name: string): string | undefined {
  const prefix = `--${name}=`;
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith(prefix)) return arg.slice(prefix.length);
  }
  return undefined;
}

async function main(): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error(
      "ANTHROPIC_API_KEY missing. Set it in your environment and re-run.",
    );
    process.exit(2);
  }

  const prompt = parseFlag("prompt") ?? DEFAULT_PROMPT;
  const model = parseFlag("model") ?? DEFAULT_MODEL;
  const maxTurns = Number.parseInt(parseFlag("max-turns") ?? "10", 10);

  console.log("─".repeat(72));
  console.log("HyperForge — live agent demo");
  console.log("─".repeat(72));
  console.log(`Model:    ${model}`);
  console.log(`Prompt:   ${prompt}`);
  console.log(`MaxTurns: ${maxTurns}`);
  console.log("─".repeat(72));

  // Build the runtime + service from the on-disk catalog.
  const service = GameBuilderService.create({
    workspaceRoot: process.cwd(),
  });
  const stats = service.getCatalog().stats;
  console.log(
    `Catalog loaded: ${stats.total} widgets across ${
      Object.keys(stats.byCategory).length
    } categories`,
  );
  console.log("─".repeat(72));

  const runtime = {
    getService: <T>(name: string) =>
      name === GameBuilderService.serviceType
        ? (service as unknown as T)
        : null,
  } as unknown as import("@elizaos/core").IAgentRuntime;

  const anthropic = new Anthropic({ apiKey });
  const llm: LLMClient = {
    async sendMessage(req) {
      return anthropic.messages.create({
        model: req.model,
        system: req.system,
        messages: req.messages as never,
        tools: req.tools as never,
        max_tokens: req.max_tokens,
      });
    },
  };

  const result = await runAgentLoop({
    messages: [{ role: "user", content: prompt }],
    actions: [
      catalogStatsAction,
      listWidgetsAction,
      getWidgetAction,
      searchWidgetsAction,
      proposeUIPackAction,
      scaffoldWidgetAction,
    ],
    runtime,
    llm,
    model,
    system: SYSTEM_PROMPT,
    maxTurns,
    onTurn: (t) => {
      const calls = t.toolCalls.length;
      if (calls === 0) {
        console.log(`[turn ${t.turn}] (final answer)`);
      } else {
        for (const c of t.toolCalls) {
          const status = c.result?.success ? "✓" : "✗";
          console.log(`[turn ${t.turn}] ${status} ${c.name}`);
        }
      }
    },
  });

  console.log("─".repeat(72));
  console.log(`Finished:  ${result.finished}`);
  console.log(`Truncated: ${result.truncated}`);
  console.log(`Turns:     ${result.turns.length}`);
  console.log("─".repeat(72));
  console.log("Final answer:");
  console.log(result.finalText || "(no text)");
  console.log("─".repeat(72));

  if (result.lastUIPack) {
    console.log("Captured UIPack:");
    console.log(JSON.stringify(result.lastUIPack, null, 2));
  } else {
    console.log("No UIPack captured. The agent didn't call PROPOSE_UI_PACK.");
  }
}

main().catch((err: unknown) => {
  console.error("Live agent run failed:", err);
  process.exit(1);
});

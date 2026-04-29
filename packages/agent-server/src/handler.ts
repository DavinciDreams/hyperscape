/**
 * `handleDesignRequest` — pure handler the HTTP route delegates to.
 *
 * Separated from `bin.ts` / `serve()` so the agent loop's behavior
 * can be unit-tested with a `FakeLLM` without spinning up a real
 * server or making real API calls.
 *
 * Contract:
 *   request   `{ prompt: string, model?: string, maxTurns?: number }`
 *   response  `{ ok: true,  pack: UIPackManifest | null,
 *               finalText: string, turns: number,
 *               truncated: boolean }`
 *           | `{ ok: false, error: string, code: ErrorCode }`
 */

import {
  GameBuilderService,
  catalogStatsAction,
  listWidgetsAction,
  getWidgetAction,
  searchWidgetsAction,
  proposeUIPackAction,
  scaffoldWidgetAction,
} from "@hyperforge/eliza-game-builder";
import { runAgentLoop, type LLMClient } from "@hyperforge/agent-runner";

const SYSTEM_PROMPT = `You are HyperForge's game-builder agent. Your job is to design UI packs for Hyperia worlds by composing existing widgets from the catalog.

Workflow:
1. Start with GET_CATALOG_STATS to see what's available.
2. Use LIST_GAME_WIDGETS or SEARCH_GAME_WIDGETS to find candidate widgets. Don't search the same query twice.
3. Use GET_GAME_WIDGET to inspect a candidate's prop schema before using it. Only inspect widgets you intend to use.
4. Compose a UIPackManifest that uses widgets you've verified exist. Submit via PROPOSE_UI_PACK.
5. If the pack fails validation, read the issues and fix them in your next call.

Be efficient. Aim to converge in 4-6 tool calls. Don't list every widget — pick what's relevant.

The UIPackManifest schema requires: version: 1, id (string), name (string), widgets (array of {id}), and layouts.default with {id, name, revision, instances[]}. Each instance needs instanceId, widgetId, position {kind: "anchored", anchor: <one of: top-left, top-right, top-center, bottom-left, bottom-right, bottom-center, middle-left, middle-right, middle-center>, offset: {x, y}}, and props ({} if you don't customize).`;

export type ErrorCode =
  | "BAD_REQUEST"
  | "MISSING_PROMPT"
  | "AGENT_FAILED"
  | "TRUNCATED";

export interface DesignRequest {
  readonly prompt: string;
  readonly model?: string;
  readonly maxTurns?: number;
}

export interface DesignSuccessResponse {
  readonly ok: true;
  readonly pack: unknown;
  readonly finalText: string;
  readonly turns: number;
  readonly truncated: boolean;
}

export interface DesignErrorResponse {
  readonly ok: false;
  readonly error: string;
  readonly code: ErrorCode;
}

export type DesignResponse = DesignSuccessResponse | DesignErrorResponse;

export interface HandleDesignOptions {
  /** LLM client (real Anthropic in production, FakeLLM in tests). */
  readonly llm: LLMClient;
  /** Pre-built service so tests can inject a fixture catalog. */
  readonly service: GameBuilderService;
  /** Default model id. Overridden per-request. */
  readonly defaultModel?: string;
  /** Default maxTurns. Overridden per-request. */
  readonly defaultMaxTurns?: number;
  /** Optional log hook called on every turn. */
  readonly onTurn?: (turn: number, calls: ReadonlyArray<string>) => void;
}

const ACTIONS = [
  catalogStatsAction,
  listWidgetsAction,
  getWidgetAction,
  searchWidgetsAction,
  proposeUIPackAction,
  scaffoldWidgetAction,
];

export async function handleDesignRequest(
  request: DesignRequest,
  options: HandleDesignOptions,
): Promise<DesignResponse> {
  const prompt = request.prompt?.trim();
  if (!prompt) {
    return {
      ok: false,
      error: "Missing or empty `prompt` field.",
      code: "MISSING_PROMPT",
    };
  }

  const runtime = {
    getService: <T>(name: string) =>
      name === GameBuilderService.serviceType
        ? (options.service as unknown as T)
        : null,
  } as unknown as import("@elizaos/core").IAgentRuntime;

  try {
    const result = await runAgentLoop({
      messages: [{ role: "user", content: prompt }],
      actions: ACTIONS,
      runtime,
      llm: options.llm,
      model: request.model ?? options.defaultModel,
      maxTurns: request.maxTurns ?? options.defaultMaxTurns ?? 12,
      system: SYSTEM_PROMPT,
      onTurn: options.onTurn
        ? (t) =>
            options.onTurn!(
              t.turn,
              t.toolCalls.map((c) => c.name),
            )
        : undefined,
    });

    return {
      ok: true,
      pack: result.lastUIPack ?? null,
      finalText: result.finalText,
      turns: result.turns.length,
      truncated: result.truncated,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      code: "AGENT_FAILED",
    };
  }
}

/**
 * Parse a JSON request body and validate the shape. Returns the
 * structured `DesignRequest` or an error response.
 */
export function parseDesignRequest(
  body: unknown,
): DesignRequest | DesignErrorResponse {
  if (!body || typeof body !== "object") {
    return {
      ok: false,
      error: "Request body must be a JSON object.",
      code: "BAD_REQUEST",
    };
  }
  const b = body as Record<string, unknown>;
  if (typeof b.prompt !== "string") {
    return {
      ok: false,
      error: "Field `prompt` must be a string.",
      code: "MISSING_PROMPT",
    };
  }
  return {
    prompt: b.prompt,
    model: typeof b.model === "string" ? b.model : undefined,
    maxTurns: typeof b.maxTurns === "number" ? b.maxTurns : undefined,
  };
}

/**
 * `@hyperforge/agent-runner` — public API.
 *
 * Phase A4.3 of `PLAN_AI_AUTHORING_FOUNDATIONS.md`. The bridge
 * between our typed services (catalog, scaffolder) and a live
 * LLM. Adapts ElizaOS `Action[]` to Anthropic tool definitions,
 * drives the tool-use conversation, dispatches tool calls back
 * to the action handlers.
 *
 * Two consumers:
 *   1. The `examples/live-agent.ts` demo script — proves the loop
 *      works against the real Anthropic API + the live 52-widget
 *      catalog.
 *   2. Future surfaces (chat UI in the running client, MCP server,
 *      CI smoke tests) that need to drive an LLM through these
 *      actions.
 */

export { actionToAnthropicTool, actionsToAnthropicTools } from "./adapter.js";

export {
  runAgentLoop,
  type LLMClient,
  type SendMessageRequest,
  type RunAgentLoopOptions,
  type RunAgentLoopResult,
  type TurnRecord,
  type ContentBlockParam,
} from "./loop.js";

export {
  FakeLLM,
  textBlock,
  toolUseBlock,
  type FakeLLMScriptStep,
} from "./fakeLLM.js";

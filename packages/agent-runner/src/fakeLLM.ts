/**
 * `FakeLLM` — scripted Anthropic-shaped responses for tests.
 *
 * The real Anthropic SDK returns a `Message` with `content` blocks
 * + `stop_reason`. Tests construct a sequence of those messages
 * and the FakeLLM hands them out one per `sendMessage` call.
 *
 * This lets us test `runAgentLoop` end-to-end — including
 * tool dispatch, multi-turn flow, error recovery — without
 * spending API tokens or needing network access.
 */

import type {
  Message,
  ToolUseBlock,
  TextBlock,
} from "@anthropic-ai/sdk/resources/messages";
import type { LLMClient, SendMessageRequest } from "./loop.js";

export interface FakeLLMScriptStep {
  /** What the model "outputs". */
  readonly content: ReadonlyArray<TextBlock | ToolUseBlock>;
  /**
   * Stop reason. Default "tool_use" if any tool_use blocks present,
   * otherwise "end_turn".
   */
  readonly stop_reason?: Message["stop_reason"];
}

export class FakeLLM implements LLMClient {
  readonly seenRequests: SendMessageRequest[] = [];
  private cursor = 0;

  constructor(readonly script: ReadonlyArray<FakeLLMScriptStep>) {}

  async sendMessage(request: SendMessageRequest): Promise<Message> {
    this.seenRequests.push(request);
    if (this.cursor >= this.script.length) {
      throw new Error(
        `FakeLLM script exhausted: requested ${this.cursor + 1} responses, only ${this.script.length} scripted`,
      );
    }
    const step = this.script[this.cursor++]!;
    const hasToolUse = step.content.some((b) => b.type === "tool_use");
    return {
      id: `fake-msg-${this.cursor}`,
      type: "message",
      role: "assistant",
      content: step.content as Message["content"],
      model: request.model,
      stop_reason: step.stop_reason ?? (hasToolUse ? "tool_use" : "end_turn"),
      stop_sequence: null,
      usage: { input_tokens: 0, output_tokens: 0 },
    };
  }
}

/** Convenience: build a TextBlock with no usage stats. */
export function textBlock(text: string): TextBlock {
  return { type: "text", text } as TextBlock;
}

/** Convenience: build a ToolUseBlock. */
export function toolUseBlock(
  id: string,
  name: string,
  input: unknown,
): ToolUseBlock {
  return { type: "tool_use", id, name, input };
}

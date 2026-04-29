/**
 * Minimal `IAgentRuntime` stub for unit tests. Plugin-hyperia uses
 * the same pattern: tests don't boot a full ElizaOS runtime, they
 * hand actions a thin shim that exposes only what the action
 * actually touches — `getService`.
 */

import type { Content, Memory } from "@elizaos/core";
import type { GameBuilderService } from "../services/GameBuilderService.js";

export interface CapturedCallback {
  readonly text: string;
  readonly action?: string;
  readonly error?: boolean;
}

export interface MakeRuntimeOptions {
  readonly service?: GameBuilderService | null;
}

export function makeStubRuntime(options: MakeRuntimeOptions = {}) {
  const calls: CapturedCallback[] = [];
  const runtime = {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    getService: <T>(name: string): T | null => {
      if (options.service && name === "gameBuilderService") {
        return options.service as unknown as T;
      }
      return null;
    },
  } as unknown as import("@elizaos/core").IAgentRuntime;

  const callback = async (content: Content): Promise<Memory[]> => {
    calls.push({
      text: typeof content.text === "string" ? content.text : "",
      action: typeof content.action === "string" ? content.action : undefined,
      error: content.error === true,
    });
    return [];
  };

  return { runtime, callback, calls };
}

export function makeMessage(text: string): Memory {
  return {
    id: "test-id" as unknown as Memory["id"],
    entityId: "test-entity" as unknown as Memory["entityId"],
    roomId: "test-room" as unknown as Memory["roomId"],
    content: { text },
    createdAt: Date.now(),
  } as unknown as Memory;
}

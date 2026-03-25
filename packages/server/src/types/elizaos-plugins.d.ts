/**
 * Ambient module declarations for ElizaOS plugins.
 *
 * These serve two purposes:
 *
 * 1. Fix broken upstream type chains where .d.ts re-exports point to missing files:
 *    - plugin-anthropic@2.0.0-alpha.6  (index.node.d.ts missing)
 *    - plugin-ollama@2.0.0-alpha.6     (dist/index.d.ts missing)
 *    - plugin-sql@2.0.0-alpha.12       (index.node.d.ts missing)
 *    - plugin-trajectory-logger@2.0.0-alpha.11 (no .d.ts files at all)
 *
 * 2. Unify Plugin types across version mismatches: plugins depend on different
 *    @elizaos/core versions (alpha.3, alpha.10) while the server uses alpha.12.
 *    By importing Plugin from @elizaos/core here, all declarations reference the
 *    server's resolved version, avoiding structural incompatibilities.
 *
 * These declarations can be removed once upstream packages ship correct .d.ts
 * files and align on a single @elizaos/core version.
 */

declare module "@elizaos/plugin-openai" {
  import type { Plugin } from "@elizaos/core";

  export const openaiPlugin: Plugin;
  const _default: Plugin;
  export default _default;
}

declare module "@elizaos/plugin-anthropic" {
  import type { Plugin } from "@elizaos/core";

  export const anthropicPlugin: Plugin;
  const _default: Plugin;
  export default _default;
}

declare module "@elizaos/plugin-openrouter" {
  import type { Plugin } from "@elizaos/core";

  export const openrouterPlugin: Plugin;
  const _default: Plugin;
  export default _default;
}

declare module "@elizaos/plugin-ollama" {
  import type { Plugin } from "@elizaos/core";

  export const ollamaPlugin: Plugin;
  const _default: Plugin;
  export default _default;
}

declare module "@elizaos/plugin-sql" {
  import type { IDatabaseAdapter, Plugin, UUID } from "@elizaos/core";

  export const plugin: Plugin;
  export function createDatabaseAdapter(
    config: { dataDir?: string; postgresUrl?: string },
    agentId: UUID,
  ): IDatabaseAdapter;
  const _default: Plugin;
  export default _default;
}

declare module "@elizaos/plugin-local-embedding" {
  import type { Plugin } from "@elizaos/core";

  export const localAiPlugin: Plugin;
  const _default: Plugin;
  export default _default;
}

declare module "@elizaos/plugin-trajectory-logger" {
  import type { Plugin, IAgentRuntime } from "@elizaos/core";

  export class TrajectoryLoggerService {
    static serviceType: string;
    static resolveFromRuntime(
      runtime: IAgentRuntime,
    ): TrajectoryLoggerService | null;
    static waitForService(
      runtime: IAgentRuntime,
      timeoutMs?: number,
    ): Promise<TrajectoryLoggerService | null>;
    startTrajectory(
      agentIdOrStepId: string,
      options?: Record<string, unknown>,
    ): Promise<string>;
    startStep(trajectoryId: string, envState: Record<string, unknown>): string;
    getCurrentStepId(trajectoryId: string): string | null;
    completeStep(
      trajectoryId: string,
      action: Record<string, unknown>,
      rewardInfo?: Record<string, unknown>,
    ): void;
    endTrajectory(
      trajectoryId: string,
      status: string,
      finalMetrics?: Record<string, unknown>,
    ): Promise<void>;
    listTrajectories(options?: Record<string, unknown>): Promise<{
      trajectories: Array<{ id: string }>;
      total: number;
      offset: number;
      limit: number;
    }>;
    getTrajectoryDetail(
      trajectoryId: string,
    ): Promise<Record<string, unknown> | null>;
    wrapPlugin(plugin: Plugin): Plugin;
  }

  export class RewardService {}

  export function wrapPluginActions(
    plugin: Plugin,
    logger: TrajectoryLoggerService,
  ): Plugin;

  export function wrapPluginProviders(
    plugin: Plugin,
    logger: TrajectoryLoggerService,
  ): Plugin;

  export function setTrajectoryContext(
    runtime: IAgentRuntime,
    trajectoryId: string,
    logger: TrajectoryLoggerService,
  ): void;

  export function getTrajectoryContext(
    runtime: IAgentRuntime,
  ): { trajectoryId: string; logger: TrajectoryLoggerService } | undefined;

  export function clearTrajectoryContext(runtime: IAgentRuntime): void;

  export function startAutonomousTick(
    trajectoryLogger: TrajectoryLoggerService,
    context: {
      agentId: string;
      source?: string;
      scenarioId?: string;
      episodeId?: string;
      batchId?: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<string>;

  export function endAutonomousTick(
    trajectoryLogger: TrajectoryLoggerService,
    trajectoryId: string,
    status?: "completed" | "terminated" | "error" | "timeout",
    finalMetrics?: Record<string, unknown>,
  ): Promise<void>;

  export function loggedLLMCall(
    trajectoryLogger: TrajectoryLoggerService,
    trajectoryId: string,
    options: {
      model: string;
      modelVersion?: string;
      systemPrompt: string;
      userPrompt: string;
      temperature?: number;
      maxTokens?: number;
      purpose?: "action" | "reasoning" | "evaluation" | "response" | "other";
      actionType?: string;
    },
    llmCallFn: () => Promise<{
      text: string;
      reasoning?: string;
      tokens?: { prompt?: number; completion?: number };
      latencyMs?: number;
    }>,
  ): Promise<string>;

  export const trajectoryLoggerPlugin: Plugin;
  const _default: Plugin;
  export default _default;
}

/**
 * Embedded Eliza Agent Module
 *
 * This module provides embedded ElizaOS agent support for the Hyperscape server.
 * Agents run directly in the server process with direct world access, eliminating
 * the need for external ElizaOS processes and WebSocket connections.
 *
 * Usage:
 * ```typescript
 * import { initializeAgents, getAgentManager } from './eliza';
 *
 * // During server startup
 * await initializeAgents(world, config);
 *
 * // Later, to manage agents
 * const manager = getAgentManager();
 * await manager.createAgent({ ... });
 * ```
 */

export { EmbeddedHyperscapeService } from "./EmbeddedHyperscapeService.js";
export {
  AgentManager,
  getAgentManager,
  setAgentManager,
} from "./AgentManager.js";
export type { HyperscapeService } from "./AgentManager.js";
export type {
  EmbeddedAgentConfig,
  EmbeddedAgentInfo,
  AgentState,
  AgentCharacterConfig,
  EmbeddedGameState,
  NearbyEntityData,
  IEmbeddedHyperscapeService,
} from "./types.js";

export {
  spawnModelAgents,
  getRunningAgents,
  getAgentRuntimeByCharacterId,
  stopModelAgent,
  stopAllModelAgents,
  getAvailableModels,
  MODEL_AGENTS,
} from "./ModelAgentSpawner.js";
export type { ModelProviderConfig } from "./ModelAgentSpawner.js";

// ElizaOS-powered duel bots (LLM agents for matchmaker)
export { ElizaDuelBot } from "./ElizaDuelBot.js";
export type {
  ElizaDuelBotConfig,
  ElizaDuelBotMetrics,
} from "./ElizaDuelBot.js";
export { ElizaDuelMatchmaker } from "./ElizaDuelMatchmaker.js";
export type {
  ElizaDuelMatchmakerConfig,
  MatchResult,
} from "./ElizaDuelMatchmaker.js";

// Shared agent helpers (plugin loading, character creation, model routing)
export {
  loadModelPlugin as loadAgentModelPlugin,
  loadSqlPlugin as loadAgentSqlPlugin,
  loadTrajectoryLoggerPlugin as loadAgentTrajectoryLoggerPlugin,
  createAgentCharacter as createAgentCharacterConfig,
  buildModelSecrets,
  /** @deprecated Legacy PGLite path; agents use Postgres via plugin-sql */
  ensurePgliteDataDir,
  DEFAULT_SMALL_MODELS,
  MODEL_SETTING_KEYS,
  COMPETITIVE_SYSTEM_PROMPT,
} from "./agentHelpers.js";

import type { World } from "@hyperscape/shared";
import { AgentManager, setAgentManager } from "./AgentManager.js";
import { spawnModelAgents, getAvailableModels } from "./ModelAgentSpawner.js";
import {
  resolveElizaPostgresUrl,
  createSqlAdapterForAgent,
} from "./sharedElizaDatabase.js";
import {
  loadSqlPlugin,
  loadTrajectoryLoggerPlugin,
  elizaDatabaseSecretsFromUrl,
} from "./agentHelpers.js";

/**
 * Server configuration type (partial, for what we need)
 */
interface ServerConfig {
  autoStartAgents?: boolean;
  /** Spawn ElizaOS agents with different AI models (default: false in dev, true in production) */
  spawnModelAgents?: boolean;
  /** Maximum number of model agents to spawn */
  maxModelAgents?: number;
  /** Specific providers to spawn (openai, anthropic, groq, xai, elizacloud) */
  modelProviders?: Array<
    "openai" | "anthropic" | "groq" | "xai" | "openrouter" | "elizacloud"
  >;
}

/**
 * Initialize the embedded agent system
 *
 * This should be called during server startup after the world is created.
 *
 * @param world - The Hyperscape world instance
 * @param config - Server configuration
 * @returns The initialized AgentManager
 */
export async function initializeAgents(
  world: World,
  config?: ServerConfig,
): Promise<AgentManager> {
  // Create the agent manager
  const manager = new AgentManager(world);

  // Set as global instance
  setAgentManager(manager);

  // Wire behavior tick trace writer to Postgres so embedded agent ticks
  // produce trajectory rows alongside the AutonomousBehaviorManager path.
  const pgUrl = resolveElizaPostgresUrl();
  if (pgUrl) {
    try {
      const pgModule = await import("pg");
      const PgPool = pgModule.default?.Pool ?? pgModule.Pool;
      const pool = new PgPool({ connectionString: pgUrl, max: 2 });
      let tickSeq = 0;
      manager.setBehaviorTraceWriter(async (record) => {
        tickSeq++;
        const traceId = `tick-trace-${record.characterId}-${record.timestamp}`;
        const plannerStepId = `tick-step-${record.characterId}-${tickSeq}`;
        const id = `tick-${record.characterId}-${record.timestamp}-${Math.random().toString(36).slice(2, 8)}`;
        await pool.query(
          `INSERT INTO trajectories (id, agent_id, source, status, start_time, end_time, duration_ms, step_count, metadata_json, steps_json)
           VALUES ($1, $2, $3, $4, $5, $5, 0, 1, $6, $7)`,
          [
            id,
            record.characterId,
            "embedded-behavior-tick",
            "completed",
            record.timestamp,
            JSON.stringify({
              traceId,
              plannerStepId,
              agentName: record.agentName,
              actionType: record.actionType,
              action: record.action,
              goalType: record.goal?.type ?? null,
              goalQuestId: record.goal?.questId ?? null,
              goalDescription: record.goal?.description ?? null,
              gameState: record.gameState,
            }),
            JSON.stringify([
              {
                timestamp: record.timestamp,
                traceId,
                plannerStepId,
                actionType: record.actionType,
                action: record.action,
                gameState: record.gameState,
              },
            ]),
          ],
        );
      });
      console.log(
        "[initializeAgents] Behavior tick trace writer connected to Postgres",
      );
    } catch (err) {
      console.warn(
        `[initializeAgents] Could not set up behavior trace writer: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Load agents from database if auto-start is enabled
  const autoStart = config?.autoStartAgents !== false;
  if (autoStart) {
    await manager.loadAgentsFromDatabase();
  }

  // Spawn ElizaOS agents with different AI models.
  // Default is conservative in development to avoid runaway RSS from
  // heavyweight model runtime initialization.
  const spawnEnvValue = process.env.SPAWN_MODEL_AGENTS;
  const spawnRequestedByEnv =
    spawnEnvValue == null || spawnEnvValue === ""
      ? null
      : spawnEnvValue !== "false";
  const streamingDuelEnabled = process.env.STREAMING_DUEL_ENABLED === "true";
  const defaultSpawnModelAgents =
    process.env.NODE_ENV === "production" || streamingDuelEnabled;
  const spawnRequested =
    config?.spawnModelAgents ?? spawnRequestedByEnv ?? defaultSpawnModelAgents;
  const embeddedAgentCount = manager.getAllAgents().length;
  const allowSpawnWithEmbeddedAgents =
    process.env.SPAWN_MODEL_AGENTS_WITH_EMBEDDED === "true";
  const shouldSpawnAgents =
    spawnRequested &&
    (embeddedAgentCount === 0 || allowSpawnWithEmbeddedAgents);

  if (
    spawnRequested &&
    embeddedAgentCount > 0 &&
    !allowSpawnWithEmbeddedAgents
  ) {
    return manager;
  }

  if (shouldSpawnAgents) {
    const availableModels = getAvailableModels();
    if (availableModels.length > 0) {
      const maxAgents =
        config?.maxModelAgents ??
        parseInt(process.env.MAX_MODEL_AGENTS || "25", 10);

      await spawnModelAgents(world, {
        maxAgents,
        providers: config?.modelProviders,
      });
    }
  }

  // NOTE: attachRuntimesToEmbeddedAgents disabled to save memory.
  // Embedded agents use the thin Postgres trace writer (embedded-behavior-tick).
  // Model agents (Groq) use full Eliza runtime with TrajectoryLoggerService
  // for autonomous_llm_selection trajectories with canonical planner context.

  return manager;
}

/**
 * Attach lightweight Eliza runtimes to embedded agents that don't have one.
 *
 * This ensures the AgentBehaviorTicker can use the real TrajectoryLoggerService
 * (with trace_id, planner context, LLM call details) instead of the thin
 * fallback Postgres writer.  The runtimes only need plugin-sql and
 * plugin-trajectory-logger — no model plugin, no autonomous behavior.
 */
async function attachRuntimesToEmbeddedAgents(
  manager: AgentManager,
  postgresUrl: string,
): Promise<void> {
  const allAgents = manager.getAllAgents();
  const agentsWithoutRuntime = allAgents.filter(
    (a) => !manager.getAgentRuntime(a.characterId),
  );

  if (agentsWithoutRuntime.length === 0) return;

  const sqlPlugin = await loadSqlPlugin("EmbeddedTrajectory");
  const trajectoryPlugin =
    await loadTrajectoryLoggerPlugin("EmbeddedTrajectory");
  if (!sqlPlugin || !trajectoryPlugin) {
    console.warn(
      "[initializeAgents] Cannot attach trajectory runtimes: SQL or trajectory plugin unavailable",
    );
    return;
  }

  const { AgentRuntime } = await import("@elizaos/core");
  const dbSecrets = elizaDatabaseSecretsFromUrl(postgresUrl);
  let attached = 0;

  for (const agent of agentsWithoutRuntime) {
    try {
      const adapter = createSqlAdapterForAgent(
        agent.characterId as import("@elizaos/core").UUID,
        postgresUrl,
      );
      const runtime = new AgentRuntime({
        character: {
          id: agent.characterId,
          name: agent.name || agent.characterId,
          username: agent.characterId,
          system: "Trajectory logging runtime for embedded agent",
          bio: ["embedded"],
          topics: [],
          adjectives: [],
          settings: {
            model: "none",
            secrets: {
              ...dbSecrets,
              MEMORY_LONG_TERM_ENABLED: "false",
              MEMORY_LONG_TERM_VECTOR_SEARCH_ENABLED: "false",
              ACTION_FILTER_ENABLED: "false",
            },
          },
          plugins: [],
        },
        plugins: [sqlPlugin, trajectoryPlugin],
        adapter,
      });

      // Pre-create the agent row in the elizaos schema so ensureAgentExists
      // doesn't fail during runtime.initialize().
      try {
        const { sql: sqlTag } = await import("drizzle-orm");
        await (
          adapter as unknown as {
            db: { execute(q: unknown): Promise<unknown> };
          }
        ).db.execute(
          sqlTag.raw(
            `INSERT INTO elizaos.agents (id, name, username, system, enabled, created_at, updated_at)
             VALUES ('${agent.characterId}', '${(agent.name || agent.characterId).replace(/'/g, "''")}', '${agent.characterId}', 'embedded-trajectory', true, now(), now())
             ON CONFLICT (id) DO NOTHING`,
          ),
        );
      } catch {
        // Table may not exist yet — initialize() will handle it
      }

      await Promise.race([
        runtime.initialize({ skipMigrations: true }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), 15_000),
        ),
      ]);

      manager.setAgentRuntime(agent.characterId, runtime);
      attached++;
    } catch (err) {
      console.warn(
        `[initializeAgents] Failed to attach trajectory runtime to ${agent.characterId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  if (attached > 0) {
    console.log(
      `[initializeAgents] Attached trajectory runtimes to ${attached}/${agentsWithoutRuntime.length} embedded agents`,
    );
  }
}

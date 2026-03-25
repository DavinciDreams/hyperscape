process.env.USE_LOCAL_POSTGRES = "true";

const { loadConfig } = await import("./packages/server/src/startup/config.ts");
const { initializeDatabase, closeDatabase } =
  await import("./packages/server/src/startup/database.ts");
const { stringToUuid, AgentRuntime } = await import("@elizaos/core");
const { plugin: sqlPlugin } = await import("@elizaos/plugin-sql");
const {
  trajectoryLoggerPlugin,
  startAutonomousTick,
  endAutonomousTick,
  TrajectoryLoggerService,
} = await import("@elizaos/plugin-trajectory-logger");
const { createSqlAdapterForAgent } =
  await import("./packages/server/src/eliza/sharedElizaDatabase.ts");
const { sql } = await import("drizzle-orm");

const config = await loadConfig();
await initializeDatabase(config);

const postgresUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL || "";
if (!postgresUrl) {
  throw new Error("resolved postgres url missing");
}

const agentId = stringToUuid("cursor-smoke-trajectory-agent");
const character = {
  id: agentId,
  name: "Cursor Smoke",
  username: "cursor-smoke",
  system: "Smoke test agent",
  bio: ["smoke"],
  topics: ["smoke"],
  adjectives: ["smoke"],
  settings: {
    model: "test",
    secrets: {
      POSTGRES_URL: postgresUrl,
      DATABASE_URL: postgresUrl,
      MEMORY_LONG_TERM_ENABLED: "true",
      MEMORY_LONG_TERM_VECTOR_SEARCH_ENABLED: "false",
      ACTION_FILTER_ENABLED: "false",
    },
  },
  plugins: [],
};

const adapter = createSqlAdapterForAgent(agentId, postgresUrl);
const runtime = new AgentRuntime({
  character,
  plugins: [sqlPlugin, trajectoryLoggerPlugin],
  adapter,
});

await runtime.initialize();

// The core registers a no-op stub under "trajectory_logger" that starts
// synchronously.  The real SQL-backed plugin starts asynchronously (DB init).
// waitForService() polls until the real instance is available.
const logger = await TrajectoryLoggerService.waitForService(runtime);
if (!logger) {
  throw new Error(
    `trajectory_logger service not found (real SQL-backed). ` +
      `Available: ${JSON.stringify(Array.from(runtime.getAllServices().keys()))}`,
  );
}

console.log(
  JSON.stringify({
    loggerType: logger.constructor?.name ?? null,
    hasStartTrajectory: typeof logger.startTrajectory === "function",
    hasEndTrajectory: typeof logger.endTrajectory === "function",
    hasStartStep: typeof logger.startStep === "function",
  }),
);

const trajectoryId = await startAutonomousTick(logger, {
  agentId: runtime.agentId,
  metadata: { source: "cursor_smoke" },
});
await endAutonomousTick(logger, trajectoryId, "completed", {
  stepCount: 1,
  totalReward: 0,
});

const schemaResult = await runtime.adapter.db.execute(
  sql.raw("select current_schema() as schema"),
);
// trajectory_logger creates tables in the default search_path, not in the
// elizaos schema, so query without schema prefix.
const countResult = await runtime.adapter.db.execute(
  sql.raw(
    `select count(*)::int as count from trajectories where agent_id = '${runtime.agentId}'`,
  ),
);

console.log(
  JSON.stringify({
    databaseUrlSet: Boolean(process.env.DATABASE_URL),
    postgresUrlSet: Boolean(process.env.POSTGRES_URL),
    adapterName: runtime.adapter?.constructor?.name ?? null,
    loggerPresent: true,
    currentSchema: schemaResult.rows?.[0]?.schema ?? null,
    trajectoryRows: countResult.rows?.[0]?.count ?? null,
  }),
);

await runtime.stop();
await closeDatabase();
// Force exit — connection pool may not drain cleanly in smoke tests
process.exit(0);

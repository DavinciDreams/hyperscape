import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Client } from "pg";
import { config as loadDotenv } from "dotenv";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

interface TrajectoryExportRow {
  id: string;
  agent_id: string;
  source: string;
  status: string;
  start_time: number;
  end_time: number | null;
  duration_ms: number | null;
  metadata_json: string | JsonObject | null;
  steps_json: string | JsonValue[] | null;
  metrics_json: string | JsonObject | null;
  created_at: string;
}

interface PlannerTrajectoryExportRecord {
  schema_version: "hyperscape-planner-export-v1";
  trajectory_id: string;
  agent_id: string;
  source: string;
  status: string;
  start_time: number;
  end_time: number | null;
  duration_ms: number | null;
  created_at: string;
  trace_id: string;
  planner_step_id: string;
  metadata: JsonObject;
  steps: JsonValue[];
  metrics: JsonObject;
}

function parseArgs(argv: string[]): {
  outputPath: string;
  limit: number;
  agentId: string;
} {
  let outputPath =
    "/home/shaw/Documents/hyperscape-robot-workspace/end_to_end_outputs/planner/hyperscape_planner_trajectories.jsonl";
  let limit = 200;
  let agentId = "";

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--output" && argv[index + 1]) {
      outputPath = argv[index + 1]!;
      index += 1;
      continue;
    }
    if (arg === "--limit" && argv[index + 1]) {
      const parsed = Number.parseInt(argv[index + 1]!, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        limit = parsed;
      }
      index += 1;
      continue;
    }
    if (arg === "--agent-id" && argv[index + 1]) {
      agentId = argv[index + 1]!;
      index += 1;
    }
  }

  return { outputPath, limit, agentId };
}

function parseJsonCell<T extends JsonValue | JsonObject | JsonValue[]>(
  value: string | T | null,
  fallback: T,
): T {
  if (value === null) {
    return fallback;
  }
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value;
}

function asString(value: JsonValue | undefined): string {
  return typeof value === "string" ? value : "";
}

async function loadEnv(): Promise<void> {
  loadDotenv({ path: resolve(process.cwd(), ".env") });
  loadDotenv({ path: resolve(process.cwd(), "../server/.env") });
  loadDotenv({
    path: resolve(
      "/home/shaw/Documents/hyperscape-robot-workspace/hyperscape/packages/server/.env",
    ),
    override: false,
  });
}

function resolveDatabaseUrl(): string {
  const explicit = process.env.DATABASE_URL;
  if (explicit && explicit.trim().length > 0) {
    return explicit.trim();
  }

  const postgresPassword = process.env.POSTGRES_PASSWORD;
  if (!postgresPassword || postgresPassword.trim().length === 0) {
    throw new Error(
      "DATABASE_URL is required unless local PostgreSQL settings are available",
    );
  }

  const postgresUser = process.env.POSTGRES_USER || "hyperscape";
  const postgresDb = process.env.POSTGRES_DB || "hyperscape";
  const postgresHost = process.env.POSTGRES_HOST || "127.0.0.1";
  const postgresPort = Number.parseInt(process.env.POSTGRES_PORT || "5488", 10);

  return `postgresql://${encodeURIComponent(postgresUser)}:${encodeURIComponent(postgresPassword)}@${postgresHost}:${postgresPort}/${postgresDb}`;
}

async function exportPlannerTrajectories(): Promise<void> {
  const { outputPath, limit, agentId } = parseArgs(process.argv.slice(2));
  await loadEnv();

  const databaseUrl = resolveDatabaseUrl();

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const params: Array<string | number> = [];
    let whereClause =
      "WHERE source IN ('autonomous_llm_selection', 'embedded-behavior-tick', 'chat', 'chat-orphan')";
    if (agentId.trim().length > 0) {
      params.push(agentId.trim());
      whereClause += ` AND agent_id = $${params.length}`;
    }
    params.push(limit);

    const query = `
      SELECT
        id,
        agent_id,
        source,
        status,
        start_time,
        end_time,
        duration_ms,
        metadata_json,
        steps_json,
        metrics_json,
        created_at
      FROM trajectories
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${params.length}
    `;

    const result = await client.query<TrajectoryExportRow>(query, params);
    const lines: string[] = [];

    for (const row of result.rows) {
      const metadata = parseJsonCell<JsonObject>(row.metadata_json, {});
      const steps = parseJsonCell<JsonValue[]>(row.steps_json, []);
      const metrics = parseJsonCell<JsonObject>(row.metrics_json, {});
      const traceId = asString(metadata.traceId);
      const plannerStepId = asString(metadata.plannerStepId);
      const record: PlannerTrajectoryExportRecord = {
        schema_version: "hyperscape-planner-export-v1",
        trajectory_id: row.id,
        agent_id: row.agent_id,
        source: row.source,
        status: row.status,
        start_time: row.start_time,
        end_time: row.end_time,
        duration_ms: row.duration_ms,
        created_at: row.created_at,
        trace_id: traceId,
        planner_step_id: plannerStepId,
        metadata,
        steps,
        metrics,
      };
      lines.push(JSON.stringify(record));
    }

    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${lines.join("\n")}\n`, "utf8");
    process.stdout.write(
      `Exported ${lines.length} planner trajectories to ${outputPath}\n`,
    );
  } finally {
    await client.end();
  }
}

void exportPlannerTrajectories().catch(async (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Planner trajectory export failed: ${message}\n`);
  process.exitCode = 1;
});

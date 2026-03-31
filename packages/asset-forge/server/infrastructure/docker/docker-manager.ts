/**
 * Docker Container Manager for Asset Forge
 *
 * Auto-manages a local PostgreSQL container for development.
 * Mirrors the game server's docker-manager pattern.
 *
 * Set USE_LOCAL_POSTGRES=true in .env to enable.
 */

import { spawn, execFile } from "child_process";
import { promisify } from "util";
import { resolveDockerBinary } from "./resolveDockerBinary";

const execFileAsync = promisify(execFile);
const DOCKER_BIN = resolveDockerBinary();

export const DEFAULT_DEV_POSTGRES_PASSWORD = "forge_dev_password";

async function execDocker(
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(DOCKER_BIN, args);
}

export interface DockerManagerConfig {
  containerName: string;
  postgresUser: string;
  postgresPassword: string;
  postgresDb: string;
  postgresPort: number;
  imageName: string;
}

export class DockerManager {
  private config: DockerManagerConfig;
  private containerStartedByUs = false;

  constructor(config: DockerManagerConfig) {
    this.config = config;
  }

  async checkDockerRunning(): Promise<void> {
    await execDocker(["info"]);
  }

  async checkPostgresRunning(): Promise<boolean> {
    const { stdout: existsOut } = await execDocker([
      "ps",
      "-a",
      "--filter",
      `name=^/${this.config.containerName}$`,
      "--format",
      "{{.Names}}",
    ]);
    const exists = existsOut.trim() === this.config.containerName;
    if (!exists) return false;

    const { stdout } = await execDocker([
      "inspect",
      "-f",
      "{{.State.Running}}",
      this.config.containerName,
    ]);
    return stdout.trim() === "true";
  }

  async startPostgres(): Promise<void> {
    const { stdout } = await execDocker([
      "ps",
      "-a",
      "--filter",
      `name=^/${this.config.containerName}$`,
      "--format",
      "{{.Names}}",
    ]);
    if (stdout.trim() === this.config.containerName) {
      await execDocker(["start", this.config.containerName]);
      this.containerStartedByUs = true;
    } else {
      await this.createPostgresContainer();
      this.containerStartedByUs = true;
    }

    await this.waitForPostgres();
  }

  private async createPostgresContainer(): Promise<void> {
    const dockerArgs = [
      "run",
      "-d",
      "--name",
      this.config.containerName,
      "-e",
      `POSTGRES_USER=${this.config.postgresUser}`,
      "-e",
      `POSTGRES_PASSWORD=${this.config.postgresPassword}`,
      "-e",
      `POSTGRES_DB=${this.config.postgresDb}`,
      "-p",
      `${this.config.postgresPort}:5432`,
      "-v",
      `${this.config.containerName}-data:/var/lib/postgresql/data`,
      this.config.imageName,
    ];

    return new Promise((resolve, reject) => {
      const proc = spawn(DOCKER_BIN, dockerArgs, { stdio: "inherit" });
      proc.on("exit", (code) => {
        if (code === 0) resolve();
        else
          reject(
            new Error(`Docker container creation failed with code ${code}`),
          );
      });
      proc.on("error", reject);
    });
  }

  private async waitForPostgres(maxAttempts: number = 30): Promise<void> {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const { stdout } = await execDocker([
          "exec",
          this.config.containerName,
          "pg_isready",
          "-U",
          this.config.postgresUser,
        ]);
        if (stdout.includes("accepting connections")) return;
      } catch {
        // pg_isready returns non-zero when not ready — retry
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new Error("PostgreSQL failed to become ready within timeout period");
  }

  async stopPostgres(): Promise<void> {
    if (!this.containerStartedByUs) return;
    await execDocker(["stop", this.config.containerName]);
  }

  async getConnectionString(): Promise<string> {
    return `postgresql://${this.config.postgresUser}:${this.config.postgresPassword}@localhost:${this.config.postgresPort}/${this.config.postgresDb}`;
  }
}

/**
 * Creates a DockerManager with defaults from environment variables.
 *
 * Env vars:
 * - FORGE_POSTGRES_CONTAINER (default: forge-postgres)
 * - FORGE_POSTGRES_USER (default: forge)
 * - FORGE_POSTGRES_PASSWORD (default: forge_dev_password)
 * - FORGE_POSTGRES_DB (default: forge)
 * - FORGE_POSTGRES_PORT (default: 5489)
 * - FORGE_POSTGRES_IMAGE (default: postgres:16-alpine)
 */
export function createDefaultDockerManager(): DockerManager {
  const postgresPassword =
    process.env.FORGE_POSTGRES_PASSWORD || DEFAULT_DEV_POSTGRES_PASSWORD;

  if (
    !process.env.FORGE_POSTGRES_PASSWORD &&
    process.env.NODE_ENV === "production"
  ) {
    throw new Error("FORGE_POSTGRES_PASSWORD is required in production.");
  }

  return new DockerManager({
    containerName: process.env.FORGE_POSTGRES_CONTAINER || "forge-postgres",
    postgresUser: process.env.FORGE_POSTGRES_USER || "forge",
    postgresPassword: postgresPassword,
    postgresDb: process.env.FORGE_POSTGRES_DB || "forge",
    postgresPort: parseInt(process.env.FORGE_POSTGRES_PORT || "5489", 10),
    imageName: process.env.FORGE_POSTGRES_IMAGE || "postgres:16-alpine",
  });
}

import os from "os";
import { System } from "../shared";
import type { World } from "../../types";

// 2Hz server frame rate — bare minimum for systems that need world.tick().
// Game logic runs on the 600ms TickSystem, not here. The frame loop only
// drives system lifecycle callbacks (EntityManager sync, ServerNetwork commit,
// PersistenceSystem saves, terrain generation).
// With hot=0 (mobs removed from server hot set), each frame is ~200 system
// callbacks that mostly no-op. At 2Hz this is 400 calls/sec — negligible.
const TICK_RATE =
  Number.parseFloat(process.env.SERVER_RUNTIME_TICK_RATE || "") || 0.5; // 0.5 seconds = 2Hz
const TICK_INTERVAL_MS = TICK_RATE * 1000;
const MAX_TICKS_PER_FRAME = 1; // No catch-up at 2Hz
const MIN_SCHEDULE_DELAY_MS = Math.max(
  1,
  Number.parseInt(process.env.SERVER_RUNTIME_MIN_DELAY_MS || "", 10) || 50,
);

/**
 * Server Runtime System
 *
 * Drives world.tick() at 2Hz for system lifecycle callbacks.
 * All game logic (AI, combat, movement) runs on the 600ms TickSystem.
 * Mobs are not in the hot set — only players/UI elements on client.
 */
export class ServerRuntime extends System {
  private running = false;
  private lastTickTime = 0;
  private tickAccumulator = 0;
  private tickTimer: ReturnType<typeof setTimeout> | null = null;

  // Performance monitoring
  private lastStatsTime = 0;
  private statsInterval = 1000;
  private cachedStats: {
    maxMemory: number;
    currentMemory: number;
    maxCPU: number;
    currentCPU: number;
  } | null = null;

  constructor(world: World) {
    super(world);
  }

  start() {
    this.running = true;
    this.lastTickTime = performance.now();
    this.scheduleTick();
  }

  private scheduleTick() {
    if (!this.running) return;

    const delay =
      this.tickAccumulator >= TICK_INTERVAL_MS
        ? MIN_SCHEDULE_DELAY_MS
        : Math.max(
            MIN_SCHEDULE_DELAY_MS,
            TICK_INTERVAL_MS - this.tickAccumulator,
          );

    this.tickTimer = setTimeout(() => {
      const currentTime = performance.now();
      const deltaTime = currentTime - this.lastTickTime;

      this.tickAccumulator += deltaTime;

      // Cap accumulator to prevent unbounded growth
      const maxAccumulatorMs = TICK_INTERVAL_MS * MAX_TICKS_PER_FRAME;
      if (this.tickAccumulator > maxAccumulatorMs) {
        this.tickAccumulator = maxAccumulatorMs;
      }

      let simulatedTickTime = currentTime - this.tickAccumulator;

      while (this.tickAccumulator >= TICK_INTERVAL_MS) {
        simulatedTickTime += TICK_INTERVAL_MS;

        try {
          this.world.tick(simulatedTickTime);
        } catch (error) {
          console.error("[ServerRuntime] Tick error:", error);
          this.tickAccumulator = 0;
          break;
        }

        this.tickAccumulator -= TICK_INTERVAL_MS;
      }

      this.lastTickTime = currentTime;
      this.scheduleTick();
    }, delay);
  }

  /**
   * Get server performance stats with caching to avoid expensive CPU sampling
   */
  async getStats() {
    const now = Date.now();

    if (this.cachedStats && now - this.lastStatsTime < this.statsInterval) {
      return this.cachedStats;
    }

    const memUsage = process.memoryUsage();
    const startCPU = process.cpuUsage();
    await new Promise((resolve) => setTimeout(resolve, 100));
    const endCPU = process.cpuUsage(startCPU);
    const cpuPercent = (endCPU.user + endCPU.system) / 1000 / 100;

    this.cachedStats = {
      maxMemory: Math.round(os.totalmem() / 1024 / 1024),
      currentMemory: Math.round(memUsage.rss / 1024 / 1024),
      maxCPU: os.cpus().length * 100,
      currentCPU: cpuPercent,
    };

    this.lastStatsTime = now;
    return this.cachedStats;
  }

  destroy() {
    this.running = false;
    if (this.tickTimer) {
      clearTimeout(this.tickTimer);
      this.tickTimer = null;
    }
    this.cachedStats = null;
  }
}

/**
 * worldGeneration.worker — Runs terrain generation off the main thread.
 *
 * Accepts a WorldCreationConfig, runs generateWorldFromConfig, and posts
 * back the resulting WorldData. This prevents UI freezes during generation
 * of large worlds.
 */

import { generateWorldFromConfig } from "../components/WorldBuilder/worldGeneration";

export interface WorldGenRequest {
  type: "generateWorld";
  id: string;
  config: Parameters<typeof generateWorldFromConfig>[0];
}

export interface WorldGenResponse {
  type: "result" | "error";
  id: string;
  data?: ReturnType<typeof generateWorldFromConfig>;
  error?: string;
  elapsedMs?: number;
}

self.onmessage = (event: MessageEvent<WorldGenRequest>) => {
  const { type, id, config } = event.data;

  if (type !== "generateWorld") {
    (self as unknown as Worker).postMessage({
      type: "error",
      id,
      error: `Unknown message type: ${type}`,
    } satisfies WorldGenResponse);
    return;
  }

  try {
    const start = performance.now();
    const world = generateWorldFromConfig(config);
    const elapsedMs = Math.round(performance.now() - start);

    (self as unknown as Worker).postMessage({
      type: "result",
      id,
      data: world,
      elapsedMs,
    } satisfies WorldGenResponse);
  } catch (err) {
    (self as unknown as Worker).postMessage({
      type: "error",
      id,
      error: err instanceof Error ? err.message : String(err),
    } satisfies WorldGenResponse);
  }
};

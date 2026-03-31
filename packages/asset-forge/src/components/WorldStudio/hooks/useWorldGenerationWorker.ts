/**
 * useWorldGenerationWorker — Async world generation via Web Worker
 *
 * Provides a `generateWorld(config)` function that runs generation in a
 * background thread. Falls back to main-thread execution if workers are
 * unavailable.
 */

import { useCallback, useEffect, useRef } from "react";

import type { WorldCreationConfig, WorldData } from "../../WorldBuilder/types";
import { generateWorldFromConfig } from "../../WorldBuilder/worldGeneration";
import type {
  WorldGenRequest,
  WorldGenResponse,
} from "../../../workers/worldGeneration.worker";

interface PendingGeneration {
  resolve: (result: { world: WorldData; elapsedMs: number }) => void;
  reject: (error: Error) => void;
}

interface GenerationResult {
  world: WorldData;
  elapsedMs: number;
}

export function useWorldGenerationWorker() {
  const workerRef = useRef<Worker | null>(null);
  const pendingRef = useRef<Map<string, PendingGeneration>>(new Map());
  const nextIdRef = useRef(0);
  const fallbackRef = useRef(false);

  // Initialize worker lazily
  useEffect(() => {
    try {
      const worker = new Worker(
        new URL("../../../workers/worldGeneration.worker.ts", import.meta.url),
        { type: "module" },
      );

      worker.onmessage = (event: MessageEvent<WorldGenResponse>) => {
        const { type, id, data, error, elapsedMs } = event.data;
        const pending = pendingRef.current.get(id);
        if (!pending) return;
        pendingRef.current.delete(id);

        if (type === "error") {
          pending.reject(new Error(error ?? "Unknown worker error"));
        } else {
          pending.resolve({
            world: data as WorldData,
            elapsedMs: elapsedMs ?? 0,
          });
        }
      };

      worker.onerror = (event) => {
        console.warn(
          "[WorldGenWorker] Worker error, falling back to main thread:",
          event.message,
        );
        fallbackRef.current = true;
        // Reject all pending tasks
        for (const [id, pending] of pendingRef.current) {
          pending.reject(new Error("Worker crashed"));
          pendingRef.current.delete(id);
        }
      };

      workerRef.current = worker;
    } catch {
      console.warn(
        "[WorldGenWorker] Failed to create worker, using main thread fallback",
      );
      fallbackRef.current = true;
    }

    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
      // Reject any remaining pending
      for (const [, pending] of pendingRef.current) {
        pending.reject(new Error("Worker terminated"));
      }
      pendingRef.current.clear();
    };
  }, []);

  const generateWorld = useCallback(
    (config: WorldCreationConfig): Promise<GenerationResult> => {
      // Main-thread fallback
      if (fallbackRef.current || !workerRef.current) {
        return new Promise((resolve, reject) => {
          // Yield to let React update loading state before blocking
          setTimeout(() => {
            try {
              const start = performance.now();
              const world = generateWorldFromConfig(config);
              const elapsedMs = Math.round(performance.now() - start);
              resolve({ world, elapsedMs });
            } catch (err) {
              reject(err instanceof Error ? err : new Error(String(err)));
            }
          }, 16);
        });
      }

      const id = String(nextIdRef.current++);
      return new Promise((resolve, reject) => {
        pendingRef.current.set(id, { resolve, reject });
        workerRef.current!.postMessage({
          type: "generateWorld",
          id,
          config,
        } satisfies WorldGenRequest);
      });
    },
    [],
  );

  return { generateWorld };
}

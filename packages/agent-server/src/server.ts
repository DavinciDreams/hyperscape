/**
 * `serve()` — start the HTTP server. Uses `bun.serve` directly to
 * avoid pulling an HTTP framework dep just for two routes.
 *
 * Routes:
 *
 *   GET  /         → "ok" healthcheck
 *   POST /design   → run the agent loop, return DesignResponse
 *   OPTIONS *      → CORS preflight
 *
 * CORS is permissive (`Access-Control-Allow-Origin: *`) — this is a
 * dev/local server, not internet-facing. Production deployments
 * should put a reverse proxy in front and tighten this header.
 */

import {
  handleDesignRequest,
  parseDesignRequest,
  type DesignErrorResponse,
  type HandleDesignOptions,
} from "./handler.js";

export interface ServeOptions extends HandleDesignOptions {
  readonly port?: number;
  readonly hostname?: string;
}

export interface ServeResult {
  readonly port: number;
  readonly url: string;
  /** Stop the server. */
  readonly stop: () => Promise<void>;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

export function serve(options: ServeOptions): ServeResult {
  const port = options.port ?? 5180;
  const hostname = options.hostname ?? "0.0.0.0";

  const server = (
    globalThis as { Bun?: { serve: (config: unknown) => unknown } }
  ).Bun?.serve({
    port,
    hostname,
    async fetch(req: Request): Promise<Response> {
      const url = new URL(req.url);

      if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
      }

      if (url.pathname === "/" && req.method === "GET") {
        return jsonResponse({
          ok: true,
          service: "@hyperforge/agent-server",
          version: 1,
        });
      }

      if (url.pathname === "/design" && req.method === "POST") {
        let body: unknown;
        try {
          body = await req.json();
        } catch {
          return jsonResponse(
            {
              ok: false,
              error: "Invalid JSON in request body.",
              code: "BAD_REQUEST",
            } satisfies DesignErrorResponse,
            400,
          );
        }
        const parsed = parseDesignRequest(body);
        if ("ok" in parsed && parsed.ok === false) {
          return jsonResponse(parsed, 400);
        }
        const result = await handleDesignRequest(
          parsed as { prompt: string; model?: string; maxTurns?: number },
          options,
        );
        const status = result.ok ? 200 : 500;
        return jsonResponse(result, status);
      }

      return jsonResponse(
        {
          ok: false,
          error: `No route for ${req.method} ${url.pathname}`,
          code: "BAD_REQUEST",
        } satisfies DesignErrorResponse,
        404,
      );
    },
  }) as { stop: () => void; port: number } | undefined;

  if (!server) {
    throw new Error(
      "@hyperforge/agent-server requires the bun runtime. " +
        "Run with `bun run src/bin.ts` or `bun start`.",
    );
  }

  return {
    port: server.port,
    url: `http://localhost:${server.port}`,
    async stop() {
      server.stop();
    },
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
  });
}

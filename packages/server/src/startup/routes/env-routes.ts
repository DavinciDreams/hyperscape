/**
 * Environment Routes Module - Public environment variable exposure
 *
 * Exposes PUBLIC_* environment variables to the client via a JavaScript
 * endpoint that sets global variables in the browser.
 *
 * Endpoints:
 * - GET /env.js - Returns JavaScript that sets globalThis.env with public variables
 *
 * Usage:
 * ```typescript
 * import { registerEnvRoutes } from './routes/env-routes';
 * registerEnvRoutes(fastify, config);
 * ```
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { ServerConfig } from "../config.js";
import { getPublicEnvs } from "../config.js";

/**
 * Register environment variables endpoint
 *
 * Creates a /env.js endpoint that exposes PUBLIC_* environment variables
 * to the client by generating JavaScript code that sets globalThis.env.
 *
 * @param fastify - Fastify server instance
 * @param config - Server configuration
 */
export function registerEnvRoutes(
  fastify: FastifyInstance,
  config: ServerConfig,
): void {
  fastify.get("/env.js", async (req: FastifyRequest, reply: FastifyReply) => {
    const publicEnvs = getPublicEnvs();
    const forwardedProto = req.headers["x-forwarded-proto"];
    const protoHeader = Array.isArray(forwardedProto)
      ? forwardedProto[0]
      : forwardedProto;
    const protocol =
      typeof protoHeader === "string" && protoHeader.trim()
        ? protoHeader.split(",")[0]?.trim()
        : req.protocol;
    const host = req.headers.host;

    if (host) {
      const origin = `${protocol}://${host}`;
      publicEnvs["PUBLIC_API_URL"] ||= origin;
      publicEnvs["PUBLIC_WS_URL"] ||=
        `${protocol === "https" ? "wss" : "ws"}://${host}/ws`;
      publicEnvs["PUBLIC_CDN_URL"] ||= `${origin}/game-assets`;
    }

    // Expose plugin paths to client for systems loading
    if (config.systemsPath) {
      publicEnvs["PLUGIN_PATH"] = config.systemsPath;
    }

    const envsCode = `
  if (!globalThis.env) globalThis.env = {}
  globalThis.env = ${JSON.stringify(publicEnvs)}
`;

    reply
      .type("application/javascript")
      .header("Cache-Control", "no-cache, no-store, must-revalidate")
      .send(envsCode);
  });
}

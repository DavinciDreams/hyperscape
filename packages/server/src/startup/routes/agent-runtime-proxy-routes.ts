/**
 * Agent runtime proxy routes.
 *
 * Proxies browser dashboard calls to an external Hyades/Safier runtime while
 * keeping the browser pointed at the Hyperscape origin.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

const PROXY_PREFIX = "/api/agent-runtime";

type ProxyBody = string | Buffer | ArrayBuffer | ArrayBufferView;

function normalizeAgentRuntimeUrl(rawUrl: string | undefined): URL | null {
  const trimmed = rawUrl?.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function joinTargetPath(basePath: string, proxyPath: string): string {
  const normalizedBase = basePath.endsWith("/")
    ? basePath.slice(0, -1)
    : basePath;
  const normalizedProxy = proxyPath.startsWith("/")
    ? proxyPath
    : `/${proxyPath}`;

  if (!normalizedBase) {
    return normalizedProxy;
  }

  if (normalizedProxy === "/") {
    return normalizedBase || "/";
  }

  return `${normalizedBase}${normalizedProxy}`;
}

function buildTargetUrl(requestUrl: string, baseUrl: URL): string {
  const incoming = new URL(requestUrl, "http://hyperscape.local");
  const proxyPath = incoming.pathname.startsWith(PROXY_PREFIX)
    ? incoming.pathname.slice(PROXY_PREFIX.length) || "/"
    : "/";
  const target = new URL(baseUrl.toString());
  target.pathname = joinTargetPath(baseUrl.pathname, proxyPath);
  target.search = incoming.search;
  return target.toString();
}

function buildProxyHeaders(request: FastifyRequest): Record<string, string> {
  const headers: Record<string, string> = {};

  for (const [key, value] of Object.entries(request.headers)) {
    const lowerKey = key.toLowerCase();
    if (
      lowerKey === "host" ||
      lowerKey === "connection" ||
      lowerKey === "content-length" ||
      lowerKey === "accept-encoding"
    ) {
      continue;
    }

    if (Array.isArray(value)) {
      headers[key] = value.join(", ");
    } else if (value !== undefined) {
      headers[key] = String(value);
    }
  }

  return headers;
}

function buildProxyBody(request: FastifyRequest): ProxyBody | undefined {
  if (request.body === undefined || request.body === null) {
    return undefined;
  }

  if (
    typeof request.body === "string" ||
    Buffer.isBuffer(request.body) ||
    request.body instanceof ArrayBuffer ||
    ArrayBuffer.isView(request.body)
  ) {
    return request.body;
  }

  return JSON.stringify(request.body);
}

function copyResponseHeaders(response: Response, reply: FastifyReply): void {
  response.headers.forEach((value, key) => {
    const lowerKey = key.toLowerCase();
    if (
      lowerKey === "content-encoding" ||
      lowerKey === "content-length" ||
      lowerKey === "transfer-encoding" ||
      lowerKey === "connection"
    ) {
      return;
    }
    reply.header(key, value);
  });
}

export function registerAgentRuntimeProxyRoutes(
  fastify: FastifyInstance,
): void {
  console.log("[AgentRuntimeProxy] Registering agent runtime proxy routes...");

  fastify.all(
    `${PROXY_PREFIX}/*`,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const baseUrl = normalizeAgentRuntimeUrl(
        process.env.HYADES_RUNTIME_URL ||
          process.env.SAFIER_RUNTIME_URL ||
          process.env.AGENT_RUNTIME_URL ||
          process.env.PUBLIC_HYADES_URL ||
          process.env.PUBLIC_SAFIER_URL ||
          process.env.PUBLIC_AGENT_RUNTIME_URL,
      );

      if (!baseUrl) {
        return reply.code(503).send({
          error: "Agent runtime proxy is not configured",
          message:
            "Set HYADES_RUNTIME_URL, SAFIER_RUNTIME_URL, or AGENT_RUNTIME_URL on the Hyperscape server.",
        });
      }

      const targetUrl = buildTargetUrl(request.url, baseUrl);

      try {
        const response = await fetch(targetUrl, {
          method: request.method,
          headers: buildProxyHeaders(request),
          body: (request.method === "GET" || request.method === "HEAD"
            ? undefined
            : buildProxyBody(request)) as BodyInit | undefined,
          redirect: "manual",
        });

        copyResponseHeaders(response, reply);
        const arrayBuffer = await response.arrayBuffer();
        return reply.code(response.status).send(Buffer.from(arrayBuffer));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return reply.code(502).send({
          error: "Agent runtime proxy request failed",
          message,
        });
      }
    },
  );
}

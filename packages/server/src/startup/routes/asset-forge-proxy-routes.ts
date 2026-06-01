/**
 * Asset Forge proxy routes.
 *
 * Keeps in-game authoring UI on the Hyperscape origin while Asset Forge remains
 * the content-generation and manifest-authoring backend.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

const PROXY_PREFIX = "/api/asset-forge";
const COMPAT_PROXY_PREFIXES = [
  "/api/generation",
  "/api/assets",
  "/api/prompts",
] as const;

type ProxyBody = string | Buffer | ArrayBuffer | ArrayBufferView;
type FetchRequestBody = NonNullable<Parameters<typeof fetch>[1]>["body"];

function normalizeAssetForgeUrl(rawUrl: string | undefined): URL | null {
  const trimmed = rawUrl?.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed
      : null;
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
  return normalizedProxy === "/"
    ? normalizedBase || "/"
    : `${normalizedBase}${normalizedProxy}`;
}

function buildTargetUrl(requestUrl: string, baseUrl: URL): string {
  const incoming = new URL(requestUrl, "http://hyperscape.local");
  let proxyPath = "/";

  if (incoming.pathname.startsWith(PROXY_PREFIX)) {
    proxyPath = incoming.pathname.slice(PROXY_PREFIX.length) || "/";
  } else {
    const compatPrefix = COMPAT_PROXY_PREFIXES.find((prefix) =>
      incoming.pathname.startsWith(prefix),
    );
    if (compatPrefix) {
      proxyPath = incoming.pathname;
    }
  }

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

  if (process.env.ASSET_FORGE_API_TOKEN) {
    headers.authorization = `Bearer ${process.env.ASSET_FORGE_API_TOKEN}`;
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

function responseHasJsonContent(response: Response): boolean {
  return (response.headers.get("content-type") || "").includes(
    "application/json",
  );
}

export function registerAssetForgeProxyRoutes(fastify: FastifyInstance): void {
  console.log("[AssetForgeProxy] Registering Asset Forge proxy routes...");

  const proxyPatterns = [
    `${PROXY_PREFIX}/*`,
    ...COMPAT_PROXY_PREFIXES.map((prefix) => `${prefix}/*`),
  ];

  const proxyHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const baseUrl = normalizeAssetForgeUrl(
      process.env.ASSET_FORGE_API_URL ||
        process.env.ASSET_FORGE_URL ||
        process.env.PUBLIC_ASSET_FORGE_URL,
    );

    if (!baseUrl) {
      return reply.code(503).send({
        error: "Asset Forge proxy is not configured",
        message:
          "Set ASSET_FORGE_API_URL or ASSET_FORGE_URL on the Hyperscape server.",
      });
    }

    try {
      const response = await fetch(buildTargetUrl(request.url, baseUrl), {
        method: request.method,
        headers: buildProxyHeaders(request),
        body:
          request.method === "GET" || request.method === "HEAD"
            ? undefined
            : (buildProxyBody(request) as FetchRequestBody | undefined),
        redirect: "manual",
      });

      if (!response.ok && !responseHasJsonContent(response)) {
        const upstreamBody = await response.text();
        return reply.code(response.status).send({
          error: "Asset Forge upstream request failed",
          message: upstreamBody.trim() || response.statusText,
          statusCode: response.status,
        });
      }

      copyResponseHeaders(response, reply);
      const arrayBuffer = await response.arrayBuffer();
      return reply.code(response.status).send(Buffer.from(arrayBuffer));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(502).send({
        error: "Asset Forge proxy request failed",
        message,
      });
    }
  };

  for (const pattern of proxyPatterns) {
    fastify.all(pattern, proxyHandler);
  }
}

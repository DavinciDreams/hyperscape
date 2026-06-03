import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Position3D, World } from "@hyperscape/shared";
import {
  ConjureService,
  ConjureServiceError,
} from "../../infrastructure/conjure/ConjureService.js";
import {
  ConjurePlacementError,
  ConjurePlacementService,
} from "../../infrastructure/conjure/ConjurePlacementService.js";
import { verifyBearerAuthToken } from "../../infrastructure/auth/AuthTokenVerifier.js";

type ConjureRequestBody = {
  prompt?: string;
  speechTranscript?: string;
  type?: string;
  subtype?: string;
  quality?: string;
  uploadedImageFilename?: string;
};

type ConjurePlacementRequestBody = {
  assetId?: string;
  prompt?: string;
  position?: Partial<Position3D>;
  modelScale?: number;
};

function sendConjureError(
  reply: FastifyReply,
  error: unknown,
  fallbackMessage: string,
) {
  if (error instanceof ConjureServiceError) {
    return reply.code(error.statusCode).send({ error: error.message });
  }
  if (error instanceof ConjurePlacementError) {
    return reply.code(error.statusCode).send({ error: error.message });
  }

  const message = error instanceof Error ? error.message : fallbackMessage;
  return reply.code(502).send({ error: message });
}

async function requireConjureAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const verified = await verifyBearerAuthToken(request.headers.authorization);
    if (verified) return;
  } catch (error) {
    request.log.warn({ error }, "Conjure auth verification failed");
  }

  await reply.code(401).send({ error: "Authentication required" });
}

function parsePlacementPosition(
  body: ConjurePlacementRequestBody | undefined,
): Position3D {
  const position = body?.position;
  if (
    typeof position?.x !== "number" ||
    typeof position?.y !== "number" ||
    typeof position?.z !== "number"
  ) {
    throw new ConjurePlacementError("Placement position is required", 400);
  }

  return { x: position.x, y: position.y, z: position.z };
}

function sanitizeUploadedImageFilename(filename: string | undefined): string {
  const clean = filename?.trim();
  if (!clean) return "";
  if (!/^[a-f0-9]+\.(png|jpe?g|webp)$/i.test(clean)) {
    throw new ConjureServiceError("Invalid conjure image upload", 400);
  }
  return clean;
}

function getRequestOrigin(request: FastifyRequest): string {
  const forwardedProto = request.headers["x-forwarded-proto"];
  const protoHeader = Array.isArray(forwardedProto)
    ? forwardedProto[0]
    : forwardedProto;
  const protocol =
    typeof protoHeader === "string" && protoHeader.trim()
      ? protoHeader.split(",")[0]?.trim()
      : request.protocol;
  const host = request.headers.host;
  if (!host) {
    throw new ConjureServiceError("Request host is required", 400);
  }
  return `${protocol}://${host}`;
}

function getReferenceImageUrl(
  request: FastifyRequest<{ Body: ConjureRequestBody }>,
): string | undefined {
  const filename = sanitizeUploadedImageFilename(
    request.body?.uploadedImageFilename,
  );
  if (!filename) return undefined;
  return `${getRequestOrigin(request)}/assets/world/${filename}`;
}

function isCompletedStatus(status: string): boolean {
  return ["completed", "complete", "succeeded", "success"].includes(
    status.toLowerCase(),
  );
}

function resolvePlaceableModelUrl(
  modelUrl: string | null,
  localPath: string | null,
) {
  if (modelUrl) return modelUrl;
  if (localPath?.startsWith("http://") || localPath?.startsWith("https://")) {
    return localPath;
  }
  return null;
}

export function registerConjureRoutes(
  fastify: FastifyInstance,
  world: World,
): void {
  const conjureService = new ConjureService();
  const placementService = new ConjurePlacementService(world);

  fastify.post<{ Body: ConjureRequestBody }>(
    "/api/conjure",
    { preHandler: requireConjureAuth },
    async (request, reply) => {
      try {
        const result = await conjureService.start({
          prompt: request.body?.prompt || "",
          speechTranscript: request.body?.speechTranscript,
          type: request.body?.type,
          subtype: request.body?.subtype,
          quality: request.body?.quality,
          referenceImageUrl: getReferenceImageUrl(request),
        });
        return reply.send(result);
      } catch (error) {
        request.log.error({ error }, "Conjure pipeline request failed");
        return sendConjureError(reply, error, "Conjure request failed");
      }
    },
  );

  fastify.get<{ Params: { conjureId: string } }>(
    "/api/conjure/:conjureId",
    { preHandler: requireConjureAuth },
    async (request, reply) => {
      try {
        const result = await conjureService.getStatus(request.params.conjureId);
        return reply.send(result);
      } catch (error) {
        request.log.error({ error }, "Conjure status request failed");
        return sendConjureError(reply, error, "Conjure status failed");
      }
    },
  );

  fastify.post<{
    Params: { conjureId: string };
    Body: ConjurePlacementRequestBody;
  }>(
    "/api/conjure/:conjureId/place",
    { preHandler: requireConjureAuth },
    async (request, reply) => {
      try {
        const status = await conjureService.getStatus(request.params.conjureId);
        if (!isCompletedStatus(status.status)) {
          return reply.code(409).send({
            error: `Conjure is not complete yet (${status.status})`,
          });
        }
        const modelUrl = resolvePlaceableModelUrl(
          status.modelUrl,
          status.localPath,
        );
        if (!modelUrl) {
          return reply.code(409).send({
            error: "Conjure completed without a model URL",
          });
        }

        const result = await placementService.place({
          conjureId: status.conjureId,
          assetId: request.body?.assetId,
          prompt: request.body?.prompt,
          modelUrl,
          position: parsePlacementPosition(request.body),
          modelScale: request.body?.modelScale,
        });
        return reply.send(result);
      } catch (error) {
        request.log.error({ error }, "Conjure placement request failed");
        return sendConjureError(reply, error, "Conjure placement failed");
      }
    },
  );
}

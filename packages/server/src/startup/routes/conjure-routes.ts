import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  ConjureService,
  ConjureServiceError,
} from "../../infrastructure/conjure/ConjureService.js";

type ConjureRequestBody = {
  prompt?: string;
  speechTranscript?: string;
  type?: string;
  subtype?: string;
  quality?: string;
};

function sendConjureError(
  reply: FastifyReply,
  error: unknown,
  fallbackMessage: string,
) {
  if (error instanceof ConjureServiceError) {
    return reply.code(error.statusCode).send({ error: error.message });
  }

  const message = error instanceof Error ? error.message : fallbackMessage;
  return reply.code(502).send({ error: message });
}

export function registerConjureRoutes(fastify: FastifyInstance): void {
  const conjureService = new ConjureService();

  fastify.post(
    "/api/conjure",
    async (
      request: FastifyRequest<{ Body: ConjureRequestBody }>,
      reply: FastifyReply,
    ) => {
      try {
        const result = await conjureService.start({
          prompt: request.body?.prompt || "",
          speechTranscript: request.body?.speechTranscript,
          type: request.body?.type,
          subtype: request.body?.subtype,
          quality: request.body?.quality,
        });
        return reply.send(result);
      } catch (error) {
        request.log.error({ error }, "Conjure pipeline request failed");
        return sendConjureError(reply, error, "Conjure request failed");
      }
    },
  );

  fastify.get(
    "/api/conjure/:conjureId",
    async (
      request: FastifyRequest<{ Params: { conjureId: string } }>,
      reply: FastifyReply,
    ) => {
      try {
        const result = await conjureService.getStatus(request.params.conjureId);
        return reply.send(result);
      } catch (error) {
        request.log.error({ error }, "Conjure status request failed");
        return sendConjureError(reply, error, "Conjure status failed");
      }
    },
  );
}

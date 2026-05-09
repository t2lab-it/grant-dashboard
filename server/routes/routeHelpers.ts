import type { FastifyReply } from "fastify";
import { z } from "zod";

const positiveIntParamSchema = z.coerce.number().int().positive();

function sendRouteError(
  reply: Pick<FastifyReply, "code" | "send">,
  statusCode: number,
  error: string,
) {
  reply.code(statusCode).send({ error });
}

export function parsePositiveIntParam(
  reply: Pick<FastifyReply, "code" | "send">,
  rawValue: unknown,
  error: string,
) {
  const parsed = positiveIntParamSchema.safeParse(rawValue);
  if (!parsed.success) {
    sendRouteError(reply, 400, error);
    return undefined;
  }

  return parsed.data;
}

export function sendNotFound(
  reply: Pick<FastifyReply, "code" | "send">,
  error: string,
) {
  sendRouteError(reply, 404, error);
}

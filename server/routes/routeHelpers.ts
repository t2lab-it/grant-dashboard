import type { FastifyReply } from "fastify";
import { z } from "zod";
import type { ApiErrorResponse } from "../../src/contracts/apiError";

const positiveIntParamSchema = z.coerce.number().int().positive();

export function sendApiError(
  reply: Pick<FastifyReply, "code" | "send">,
  statusCode: number,
  payload: ApiErrorResponse,
) {
  reply.code(statusCode).send(payload);
}

export function parsePositiveIntParam(
  reply: Pick<FastifyReply, "code" | "send">,
  rawValue: unknown,
  code: string,
  message: string,
) {
  const parsed = positiveIntParamSchema.safeParse(rawValue);
  if (!parsed.success) {
    sendApiError(reply, 400, { code, message });
    return undefined;
  }

  return parsed.data;
}

export function sendNotFound(
  reply: Pick<FastifyReply, "code" | "send">,
  code: string,
  message: string,
) {
  sendApiError(reply, 404, { code, message });
}

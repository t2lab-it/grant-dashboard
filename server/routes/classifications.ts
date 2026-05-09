import type { FastifyInstance, FastifyReply } from "fastify";
import { ZodError } from "zod";
import {
  CLASSIFICATION_NOT_FOUND_ERROR,
  createClassification,
  deleteClassification,
  listClassifications,
  updateClassification,
} from "../services/classifications";
import { classificationSchema, classificationUpdateSchema } from "../validation";
import { parsePositiveIntParam, sendNotFound } from "./routeHelpers";

function sendValidationError(reply: FastifyReply) {
  reply.code(400).send({
    code: "invalid_payload",
    error: "Invalid request payload",
    message: "入力内容を確認してください。",
  });
}

export function registerClassificationRoutes(app: FastifyInstance) {
  app.get("/api/classifications", () => listClassifications(app.db));

  app.post("/api/classifications", (request, reply) => {
    try {
      const input = classificationSchema.parse(request.body);
      reply.code(201).send(createClassification(app.db, input));
    } catch (error) {
      if (error instanceof ZodError) {
        sendValidationError(reply);
        return;
      }

      throw error;
    }
  });

  app.put("/api/classifications/:tagId", (request, reply) => {
    const tagId = parsePositiveIntParam(
      reply,
      (request.params as { tagId?: string }).tagId,
      "Invalid classification id",
    );
    if (tagId === undefined) {
      return;
    }

    try {
      const input = classificationUpdateSchema.parse(request.body);
      return updateClassification(app.db, tagId, input);
    } catch (error) {
      if (error instanceof ZodError) {
        sendValidationError(reply);
        return;
      }

      if (error instanceof Error && error.message === CLASSIFICATION_NOT_FOUND_ERROR) {
        sendNotFound(reply, CLASSIFICATION_NOT_FOUND_ERROR);
        return;
      }

      throw error;
    }
  });

  app.delete("/api/classifications/:tagId", (request, reply) => {
    const tagId = parsePositiveIntParam(
      reply,
      (request.params as { tagId?: string }).tagId,
      "Invalid classification id",
    );
    if (tagId === undefined) {
      return;
    }

    try {
      return deleteClassification(app.db, tagId);
    } catch (error) {
      if (error instanceof Error && error.message === CLASSIFICATION_NOT_FOUND_ERROR) {
        sendNotFound(reply, CLASSIFICATION_NOT_FOUND_ERROR);
        return;
      }

      throw error;
    }
  });
}

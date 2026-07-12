import type { FastifyInstance } from "fastify";
import { handleActualEntryRouteError } from "./formErrors";
import { parsePositiveIntParam } from "./routeHelpers";
import { applyActualEntry, cancelActualEntry, updateActualEntry } from "../services/ledger";
import { actualEntryEditSchema, actualEntrySchema } from "../validation";

export function registerActualEntryRoutes(app: FastifyInstance) {
  app.post("/api/actual-entries", (request, reply) => {
    try {
      const input = actualEntrySchema.parse(request.body);
      const result = applyActualEntry(app.db, input);
      reply.code(201).send(result);
    } catch (error) {
      if (handleActualEntryRouteError(reply, error)) {
        return;
      }

      throw error;
    }
  });

  app.put("/api/actual-entries/:actualEntryId", (request, reply) => {
    const actualEntryId = parsePositiveIntParam(
      reply,
      (request.params as { actualEntryId?: string }).actualEntryId,
      "invalid_actual_entry_id",
      "精算項目IDを確認してください。",
    );
    if (actualEntryId === undefined) {
      return;
    }

    try {
      const input = actualEntryEditSchema.parse(request.body);
      const result = updateActualEntry(app.db, actualEntryId, input);
      reply.code(200).send(result);
    } catch (error) {
      if (handleActualEntryRouteError(reply, error)) {
        return;
      }

      throw error;
    }
  });

  app.post("/api/actual-entries/:actualEntryId/cancel", (request, reply) => {
    const actualEntryId = parsePositiveIntParam(
      reply,
      (request.params as { actualEntryId?: string }).actualEntryId,
      "invalid_actual_entry_id",
      "精算項目IDを確認してください。",
    );
    if (actualEntryId === undefined) {
      return;
    }

    try {
      const result = cancelActualEntry(app.db, actualEntryId);
      reply.code(200).send(result);
    } catch (error) {
      if (handleActualEntryRouteError(reply, error)) {
        return;
      }

      throw error;
    }
  });
}

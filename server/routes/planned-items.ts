import type { FastifyInstance } from "fastify";
import { handlePlannedItemRouteError } from "./formErrors";
import { parsePositiveIntParam } from "./routeHelpers";
import {
  cancelPlannedItem,
  completePlannedItem,
  createPlannedItemsBulk,
  deletePlannedItem,
  restoreCancelledPlannedItem,
  updatePlannedItem,
  upsertPlannedItem,
} from "../services/ledger";
import { plannedItemEditSchema, plannedItemSchema, plannedItemsBulkSchema } from "../validation";

export function registerPlannedItemRoutes(app: FastifyInstance) {
  app.post("/api/planned-items", (request, reply) => {
    try {
      const input = plannedItemSchema.parse(request.body);
      const result = upsertPlannedItem(app.db, input);
      reply.code(201).send(result);
    } catch (error) {
      if (handlePlannedItemRouteError(reply, error)) {
        return;
      }

      throw error;
    }
  });

  app.post("/api/planned-items/bulk", (request, reply) => {
    try {
      const input = plannedItemsBulkSchema.parse(request.body);
      const result = createPlannedItemsBulk(app.db, input);
      reply.code(201).send(result);
    } catch (error) {
      if (handlePlannedItemRouteError(reply, error)) {
        return;
      }

      throw error;
    }
  });

  app.put("/api/planned-items/:plannedItemId", (request, reply) => {
    const plannedItemId = parsePositiveIntParam(
      reply,
      (request.params as { plannedItemId?: string }).plannedItemId,
      "invalid_planned_item_id",
      "計画項目IDを確認してください。",
    );
    if (plannedItemId === undefined) {
      return;
    }

    try {
      const input = plannedItemEditSchema.parse(request.body);
      const result = updatePlannedItem(app.db, plannedItemId, input);
      reply.code(200).send(result);
    } catch (error) {
      if (handlePlannedItemRouteError(reply, error)) {
        return;
      }

      throw error;
    }
  });

  app.post("/api/planned-items/:plannedItemId/cancel", (request, reply) => {
    const plannedItemId = parsePositiveIntParam(
      reply,
      (request.params as { plannedItemId?: string }).plannedItemId,
      "invalid_planned_item_id",
      "計画項目IDを確認してください。",
    );
    if (plannedItemId === undefined) {
      return;
    }

    try {
      const result = cancelPlannedItem(app.db, plannedItemId);
      reply.code(200).send(result);
    } catch (error) {
      if (handlePlannedItemRouteError(reply, error)) {
        return;
      }

      throw error;
    }
  });

  app.post("/api/planned-items/:plannedItemId/complete", (request, reply) => {
    const plannedItemId = parsePositiveIntParam(
      reply,
      (request.params as { plannedItemId?: string }).plannedItemId,
      "invalid_planned_item_id",
      "計画項目IDを確認してください。",
    );
    if (plannedItemId === undefined) {
      return;
    }

    try {
      const result = completePlannedItem(app.db, plannedItemId);
      reply.code(200).send(result);
    } catch (error) {
      if (handlePlannedItemRouteError(reply, error)) {
        return;
      }

      throw error;
    }
  });

  app.post("/api/planned-items/:plannedItemId/restore", (request, reply) => {
    const plannedItemId = parsePositiveIntParam(
      reply,
      (request.params as { plannedItemId?: string }).plannedItemId,
      "invalid_planned_item_id",
      "計画項目IDを確認してください。",
    );
    if (plannedItemId === undefined) {
      return;
    }

    try {
      const result = restoreCancelledPlannedItem(app.db, plannedItemId);
      reply.code(200).send(result);
    } catch (error) {
      if (handlePlannedItemRouteError(reply, error)) {
        return;
      }

      throw error;
    }
  });

  app.delete("/api/planned-items/:plannedItemId", (request, reply) => {
    const plannedItemId = parsePositiveIntParam(
      reply,
      (request.params as { plannedItemId?: string }).plannedItemId,
      "invalid_planned_item_id",
      "計画項目IDを確認してください。",
    );
    if (plannedItemId === undefined) {
      return;
    }

    try {
      const result = deletePlannedItem(app.db, plannedItemId);
      reply.code(200).send(result);
    } catch (error) {
      if (handlePlannedItemRouteError(reply, error)) {
        return;
      }

      throw error;
    }
  });
}

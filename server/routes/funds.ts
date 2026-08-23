import type { FastifyInstance } from "fastify";
import { handleFundRouteError } from "./formErrors";
import { parsePositiveIntParam, sendNotFound } from "./routeHelpers";
import { getFundSnapshot } from "../services/dashboard";
import { createFundWithBudget, deleteFund, updateFundWithBudget } from "../services/fundCreation";
import { fundCreationSchema, fundUpdateSchema } from "../validation";

export function registerFundRoutes(app: FastifyInstance) {
  app.post("/api/funds", (request, reply) => {
    try {
      const input = fundCreationSchema.parse(request.body);
      const result = createFundWithBudget(app.db, input);
      reply.code(201).send(result);
    } catch (error) {
      if (handleFundRouteError(reply, error)) {
        return;
      }

      throw error;
    }
  });

  app.put("/api/funds/:fundId", (request, reply) => {
    const fundId = parsePositiveIntParam(
      reply,
      (request.params as { fundId?: string }).fundId,
      "invalid_fund_id",
      "予算IDを確認してください。",
    );
    if (fundId === undefined) {
      return;
    }

    try {
      const input = fundUpdateSchema.parse(request.body);
      const result = updateFundWithBudget(app.db, fundId, input);
      reply.code(200).send(result);
    } catch (error) {
      if (handleFundRouteError(reply, error)) {
        return;
      }

      throw error;
    }
  });

  app.delete("/api/funds/:fundId", (request, reply) => {
    const fundId = parsePositiveIntParam(
      reply,
      (request.params as { fundId?: string }).fundId,
      "invalid_fund_id",
      "予算IDを確認してください。",
    );
    if (fundId === undefined) {
      return;
    }

    try {
      const result = deleteFund(app.db, fundId);
      reply.code(200).send(result);
    } catch (error) {
      if (handleFundRouteError(reply, error)) {
        return;
      }

      throw error;
    }
  });

  app.get("/api/funds/:fundId", (request, reply) => {
    const fundId = parsePositiveIntParam(
      reply,
      (request.params as { fundId?: string }).fundId,
      "invalid_fund_id",
      "予算IDを確認してください。",
    );
    if (fundId === undefined) {
      return;
    }

    const snapshot = getFundSnapshot(app.db, fundId);
    if (snapshot.fund === undefined) {
      sendNotFound(reply, "fund_not_found", "対象の予算が見つかりません。");
      return;
    }

    return snapshot;
  });
}

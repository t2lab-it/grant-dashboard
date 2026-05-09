import type { FastifyInstance } from "fastify";
import { getOverviewSnapshot } from "../services/dashboard";

function parseFiscalYear(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const fiscalYear = Number(value);
  return Number.isInteger(fiscalYear) && fiscalYear > 0 ? fiscalYear : undefined;
}

export function registerOverviewRoutes(app: FastifyInstance) {
  app.get("/api/overview", (request) => {
    const query = request.query as { year?: unknown };
    return getOverviewSnapshot(app.db, { fiscalYear: parseFiscalYear(query.year) });
  });
}

import type { FastifyInstance } from "fastify";
import { getHeaderAlertsSnapshot } from "../services/headerAlerts";

function parseFiscalYear(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const fiscalYear = Number(value);
  return Number.isInteger(fiscalYear) && fiscalYear > 0 ? fiscalYear : undefined;
}

export function registerHeaderAlertRoutes(app: FastifyInstance, { now }: { now: () => Date }) {
  app.get("/api/header-alerts", (request) => {
    const query = request.query as { year?: unknown };
    return getHeaderAlertsSnapshot(app.db, { fiscalYear: parseFiscalYear(query.year), today: now() });
  });
}

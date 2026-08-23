import type { FastifyInstance } from "fastify";
import { getFiscalYearComparisonSnapshot } from "../services/fiscalYearComparison";

export function registerFiscalYearComparisonRoutes(
  app: FastifyInstance,
  { now }: { now: () => Date },
) {
  app.get("/api/fiscal-year-comparison", () =>
    getFiscalYearComparisonSnapshot(app.db, { today: now() }),
  );
}

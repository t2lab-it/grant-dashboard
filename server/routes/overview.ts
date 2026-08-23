import type { FastifyInstance } from "fastify";
import { isFiscalYearMonth, isMonthKey } from "../../src/contracts/monthlySummary";
import { getMonthlySummarySnapshot, getOverviewSnapshot } from "../services/dashboard";
import { sendApiError } from "./routeHelpers";

function parseFiscalYear(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const fiscalYear = Number(value);
  return Number.isInteger(fiscalYear) && fiscalYear > 0 ? fiscalYear : undefined;
}

export function registerOverviewRoutes(app: FastifyInstance, { now }: { now: () => Date }) {
  app.get("/api/overview/monthly-summary", (request, reply) => {
    const query = request.query as { month?: unknown; year?: unknown };
    const fiscalYear = parseFiscalYear(query.year);
    if (fiscalYear === undefined) {
      sendApiError(reply, 400, {
        code: "invalid_fiscal_year",
        message: "年度を正の整数で指定してください。",
      });
      return;
    }

    if (typeof query.month !== "string" || !isMonthKey(query.month)) {
      sendApiError(reply, 400, {
        code: "invalid_month",
        message: "月を YYYY-MM 形式で指定してください。",
      });
      return;
    }

    if (!isFiscalYearMonth(fiscalYear, query.month)) {
      sendApiError(reply, 400, {
        code: "month_outside_fiscal_year",
        message: "指定した月は年度の範囲外です。",
      });
      return;
    }

    return getMonthlySummarySnapshot(app.db, { fiscalYear, month: query.month });
  });

  app.get("/api/overview", (request) => {
    const query = request.query as { year?: unknown };
    return getOverviewSnapshot(app.db, { fiscalYear: parseFiscalYear(query.year), today: now() });
  });
}

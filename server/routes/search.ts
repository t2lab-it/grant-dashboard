import type { FastifyInstance } from "fastify";
import {
  getCrossFundSearchSnapshot,
  type CrossFundEntryType,
  type CrossFundSearchTab,
} from "../services/crossFundSearch";

const SEARCH_TABS = new Set<CrossFundSearchTab>(["all", "overdue", "unsettled", "unlinked"]);
const ENTRY_TYPES = new Set<CrossFundEntryType>(["planned", "actual"]);
const MONTH_PATTERN = /^\d{4}-\d{2}$/;

function parsePositiveInt(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function parseFiscalYear(value: unknown) {
  return parsePositiveInt(value);
}

function parseTab(value: unknown) {
  return typeof value === "string" && SEARCH_TABS.has(value as CrossFundSearchTab)
    ? (value as CrossFundSearchTab)
    : undefined;
}

function parseEntryType(value: unknown) {
  return typeof value === "string" && ENTRY_TYPES.has(value as CrossFundEntryType)
    ? (value as CrossFundEntryType)
    : undefined;
}

function parseText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function parseMonth(value: unknown) {
  return typeof value === "string" && MONTH_PATTERN.test(value) ? value : undefined;
}

export function registerSearchRoutes(app: FastifyInstance, { now }: { now: () => Date }) {
  app.get("/api/search", (request) => {
    const query = request.query as {
      year?: unknown;
      tab?: unknown;
      keyword?: unknown;
      fundId?: unknown;
      categoryId?: unknown;
      auxiliaryLabelId?: unknown;
      entryType?: unknown;
      monthFrom?: unknown;
      monthTo?: unknown;
    };

    return getCrossFundSearchSnapshot(app.db, {
      fiscalYear: parseFiscalYear(query.year),
      tab: parseTab(query.tab),
      keyword: parseText(query.keyword),
      fundId: parsePositiveInt(query.fundId),
      categoryId: parsePositiveInt(query.categoryId),
      auxiliaryLabelId: parsePositiveInt(query.auxiliaryLabelId),
      entryType: parseEntryType(query.entryType),
      monthFrom: parseMonth(query.monthFrom),
      monthTo: parseMonth(query.monthTo),
      today: now(),
    });
  });
}

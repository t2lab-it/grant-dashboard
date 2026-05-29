import {
  cancelStaticActualEntry,
  cancelStaticPlannedItem,
  completeStaticPlannedItem,
  createStaticClassification,
  createStaticActualEntry,
  createStaticFund,
  createStaticPlannedItemsBulk,
  createStaticPlannedItem,
  deleteStaticPlannedItem,
  deleteStaticClassification,
  getStaticClassifications,
  getStaticFundSnapshot,
  getStaticHeaderAlertsSnapshot,
  getStaticImportDetail,
  getStaticImportHistory,
  getStaticOverviewSnapshot,
  getStaticSearchSnapshot,
  resetStaticDemoStore,
  restoreStaticCancelledPlannedItem,
  updateStaticClassification,
  updateStaticActualEntry,
  updateStaticFund,
  updateStaticPlannedItem,
  type ActualEntryEditInput,
  type ActualEntryInput,
  type BulkPlannedItemsInput,
  type FundInput,
  type PlannedItemEditInput,
  type PlannedItemInput,
} from "./staticDemoStore";

export { resetStaticDemoStore } from "./staticDemoStore";

type StaticDemoRequestInit = Pick<RequestInit, "body" | "headers" | "method">;

function jsonResponse(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
}

async function readJsonBody<T>(init: StaticDemoRequestInit) {
  if (typeof init.body !== "string") {
    return {} as T;
  }

  return JSON.parse(init.body) as T;
}

function parseId(path: string, pattern: RegExp) {
  const match = path.match(pattern);
  if (match === null) {
    return null;
  }

  const value = Number(match[1]);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function errorResponse(error: unknown, status = 400) {
  const message = error instanceof Error ? error.message : "Static demo request failed";
  return jsonResponse({ error: { message } }, { status });
}

function parseStaticDemoPath(path: string) {
  const url = new URL(path, "static-demo://budget-dashboard");
  return {
    pathname: url.pathname,
    searchParams: url.searchParams,
  };
}

function parseFiscalYear(value: string | null) {
  if (value === null) {
    return undefined;
  }

  const fiscalYear = Number(value);
  return Number.isInteger(fiscalYear) && fiscalYear > 0 ? fiscalYear : undefined;
}

function parsePositiveInt(value: string | null) {
  if (value === null) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function parseText(value: string | null) {
  return value !== null && value.trim().length > 0 ? value : undefined;
}

function parseMonth(value: string | null) {
  return value !== null && /^\d{4}-\d{2}$/.test(value) ? value : undefined;
}

function parseSearchTab(value: string | null) {
  return value === "all" || value === "overdue" || value === "unsettled" || value === "unlinked"
    ? value
    : undefined;
}

function parseEntryType(value: string | null) {
  return value === "planned" || value === "actual" ? value : undefined;
}

export async function handleStaticDemoRequest(path: string, init: StaticDemoRequestInit = {}) {
  const method = init.method ?? "GET";
  const { pathname, searchParams } = parseStaticDemoPath(path);

  try {
    if (method === "GET" && pathname === "/api/overview") {
      return jsonResponse(getStaticOverviewSnapshot(parseFiscalYear(searchParams.get("year"))));
    }

    if (method === "GET" && pathname === "/api/search") {
      return jsonResponse(
        getStaticSearchSnapshot({
          fiscalYear: parseFiscalYear(searchParams.get("year")),
          tab: parseSearchTab(searchParams.get("tab")),
          keyword: parseText(searchParams.get("keyword")),
          fundId: parsePositiveInt(searchParams.get("fundId")),
          categoryId: parsePositiveInt(searchParams.get("categoryId")),
          auxiliaryLabelId: parsePositiveInt(searchParams.get("auxiliaryLabelId")),
          entryType: parseEntryType(searchParams.get("entryType")),
          monthFrom: parseMonth(searchParams.get("monthFrom")),
          monthTo: parseMonth(searchParams.get("monthTo")),
        }),
      );
    }

    if (method === "GET" && pathname === "/api/header-alerts") {
      return jsonResponse(getStaticHeaderAlertsSnapshot(parseFiscalYear(searchParams.get("year"))));
    }

    if (method === "GET" && pathname === "/api/imports") {
      return jsonResponse(getStaticImportHistory());
    }

    if (method === "GET" && pathname === "/api/classifications") {
      return jsonResponse(getStaticClassifications());
    }

    if (method === "POST" && pathname === "/api/classifications") {
      return jsonResponse(
        createStaticClassification(await readJsonBody<{ kind: "project" | "auxiliary"; name: string; color: string }>(init)),
        { status: 201 },
      );
    }

    if (method === "PUT") {
      const classificationId = parseId(pathname, /^\/api\/classifications\/(\d+)$/);
      if (classificationId !== null) {
        return jsonResponse(
          updateStaticClassification(
            classificationId,
            await readJsonBody<{ name: string; color: string }>(init),
          ),
        );
      }
    }

    if (method === "DELETE") {
      const classificationId = parseId(pathname, /^\/api\/classifications\/(\d+)$/);
      if (classificationId !== null) {
        return jsonResponse(deleteStaticClassification(classificationId));
      }
    }

    if (method === "GET") {
      const importId = parseId(pathname, /^\/api\/imports\/(\d+)$/);
      if (importId !== null) {
        const detail = getStaticImportDetail(importId);
        if (detail === undefined) {
          return errorResponse(new Error("Import not found"), 404);
        }

        return jsonResponse(detail);
      }
    }

    if (method === "GET") {
      const fundId = parseId(pathname, /^\/api\/funds\/(\d+)$/);
      if (fundId !== null) {
        const snapshot = getStaticFundSnapshot(fundId);
        if (snapshot.fund === undefined) {
          return errorResponse(new Error("Fund not found"), 404);
        }

        return jsonResponse(snapshot);
      }
    }

    if (method === "POST" && pathname === "/api/funds") {
      return jsonResponse(createStaticFund(await readJsonBody<FundInput>(init)), { status: 201 });
    }

    if (method === "PUT") {
      const fundId = parseId(pathname, /^\/api\/funds\/(\d+)$/);
      if (fundId !== null) {
        return jsonResponse(updateStaticFund(fundId, await readJsonBody<FundInput>(init)));
      }
    }

    if (method === "POST" && pathname === "/api/planned-items") {
      return jsonResponse(createStaticPlannedItem(await readJsonBody<PlannedItemInput>(init)), { status: 201 });
    }

    if (method === "POST" && pathname === "/api/planned-items/bulk") {
      return jsonResponse(createStaticPlannedItemsBulk(await readJsonBody<BulkPlannedItemsInput>(init)), { status: 201 });
    }

    if (method === "PUT") {
      const plannedItemId = parseId(pathname, /^\/api\/planned-items\/(\d+)$/);
      if (plannedItemId !== null) {
        return jsonResponse(updateStaticPlannedItem(plannedItemId, await readJsonBody<PlannedItemEditInput>(init)));
      }
    }

    if (method === "DELETE") {
      const plannedItemId = parseId(pathname, /^\/api\/planned-items\/(\d+)$/);
      if (plannedItemId !== null) {
        return jsonResponse(deleteStaticPlannedItem(plannedItemId));
      }
    }

    if (method === "POST") {
      const plannedItemId = parseId(pathname, /^\/api\/planned-items\/(\d+)\/cancel$/);
      if (plannedItemId !== null) {
        return jsonResponse(cancelStaticPlannedItem(plannedItemId));
      }
    }

    if (method === "POST") {
      const plannedItemId = parseId(pathname, /^\/api\/planned-items\/(\d+)\/complete$/);
      if (plannedItemId !== null) {
        return jsonResponse(completeStaticPlannedItem(plannedItemId));
      }
    }

    if (method === "POST") {
      const plannedItemId = parseId(pathname, /^\/api\/planned-items\/(\d+)\/restore$/);
      if (plannedItemId !== null) {
        return jsonResponse(restoreStaticCancelledPlannedItem(plannedItemId));
      }
    }

    if (method === "POST" && pathname === "/api/actual-entries") {
      return jsonResponse(createStaticActualEntry(await readJsonBody<ActualEntryInput>(init)), { status: 201 });
    }

    if (method === "PUT") {
      const actualEntryId = parseId(pathname, /^\/api\/actual-entries\/(\d+)$/);
      if (actualEntryId !== null) {
        return jsonResponse(updateStaticActualEntry(actualEntryId, await readJsonBody<ActualEntryEditInput>(init)));
      }
    }

    if (method === "POST") {
      const actualEntryId = parseId(pathname, /^\/api\/actual-entries\/(\d+)\/cancel$/);
      if (actualEntryId !== null) {
        return jsonResponse(cancelStaticActualEntry(actualEntryId));
      }
    }

    return errorResponse(new Error(`Static demo route not found: ${method} ${path}`), 404);
  } catch (error) {
    return errorResponse(error);
  }
}

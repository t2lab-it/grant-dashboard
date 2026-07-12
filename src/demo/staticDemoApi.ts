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
  restoreStaticCancelledPlannedItem,
  updateStaticClassification,
  updateStaticActualEntry,
  updateStaticFund,
  updateStaticPlannedItem,
} from "./staticDemoMutations";
import {
  getStaticClassifications,
  getStaticFundSnapshot,
  getStaticHeaderAlertsSnapshot,
  getStaticImportDetail,
  getStaticImportHistory,
  getStaticOverviewSnapshot,
  getStaticSearchSnapshot,
} from "./staticDemoReadModels";
import type { ApiErrorResponse } from "../contracts/apiError";
import {
  actualEntryEditSchema,
  actualEntrySchema,
  classificationSchema,
  classificationUpdateSchema,
  fundCreationSchema,
  fundUpdateSchema,
  plannedItemEditSchema,
  plannedItemSchema,
  plannedItemsBulkSchema,
} from "../contracts/requestSchemas";
import type { z, ZodTypeAny } from "zod";

export { resetStaticDemoStore } from "./staticDemoState";

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

async function readJsonBody<TSchema extends ZodTypeAny>(
  init: StaticDemoRequestInit,
  schema: TSchema,
): Promise<z.output<TSchema>> {
  return schema.parse(typeof init.body === "string" ? JSON.parse(init.body) : {});
}

function parseId(path: string, pattern: RegExp) {
  const match = path.match(pattern);
  if (match === null) {
    return null;
  }

  const value = Number(match[1]);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function errorResponse(payload: ApiErrorResponse, status: number) {
  return jsonResponse(payload, { status });
}

function invalidRouteIdResponse(method: string, pathname: string) {
  const routes: Array<{
    methods: string[];
    pattern: RegExp;
    payload: ApiErrorResponse;
  }> = [
    {
      methods: ["GET", "PUT"],
      pattern: /^\/api\/funds\/[^/]+$/,
      payload: { code: "invalid_fund_id", message: "予算IDを確認してください。" },
    },
    {
      methods: ["GET"],
      pattern: /^\/api\/imports\/[^/]+$/,
      payload: { code: "invalid_import_id", message: "インポートIDを確認してください。" },
    },
    {
      methods: ["PUT", "DELETE"],
      pattern: /^\/api\/planned-items\/[^/]+$/,
      payload: { code: "invalid_planned_item_id", message: "計画項目IDを確認してください。" },
    },
    {
      methods: ["POST"],
      pattern: /^\/api\/planned-items\/[^/]+\/(cancel|complete|restore)$/,
      payload: { code: "invalid_planned_item_id", message: "計画項目IDを確認してください。" },
    },
    {
      methods: ["PUT"],
      pattern: /^\/api\/actual-entries\/[^/]+$/,
      payload: { code: "invalid_actual_entry_id", message: "精算項目IDを確認してください。" },
    },
    {
      methods: ["POST"],
      pattern: /^\/api\/actual-entries\/[^/]+\/cancel$/,
      payload: { code: "invalid_actual_entry_id", message: "精算項目IDを確認してください。" },
    },
    {
      methods: ["PUT", "DELETE"],
      pattern: /^\/api\/classifications\/[^/]+$/,
      payload: { code: "invalid_classification_id", message: "分類IDを確認してください。" },
    },
  ];
  const route = routes.find(({ methods, pattern }) => methods.includes(method) && pattern.test(pathname));
  return route === undefined ? undefined : errorResponse(route.payload, 400);
}

function domainErrorResponse(error: unknown, pathname: string, method: string) {
  const detail = error instanceof Error ? error.message : "";
  const mapped: Record<string, { payload: ApiErrorResponse; status: number }> = {
    "Invalid classification assignment": {
      status: 400,
      payload: { code: "invalid_classification_assignment", message: "タグまたは補助ラベルの選択内容を確認してください。" },
    },
    "Category has linked planned or actual entries": {
      status: 409,
      payload: { code: "category_has_entries", message: "計画項目または精算項目がある費目は削除できません。" },
    },
    "Planned item not found": {
      status: 404,
      payload: { code: "planned_item_not_found", message: "対象の計画項目が見つかりません。" },
    },
    "Planned item is not partially settled": {
      status: 409,
      payload: { code: "planned_item_complete_requires_actuals", message: "精算が紐づいている未精算の計画項目のみ完了にできます。" },
    },
    "Planned item has no remaining amount": {
      status: 409,
      payload: { code: "planned_item_complete_requires_remaining", message: "残予定額がある計画項目のみ完了にできます。" },
    },
    "Planned item is not deletable": {
      status: 409,
      payload: { code: "planned_item_not_deletable", message: "この計画項目は削除できません。" },
    },
    "Planned item is not restorable": {
      status: 409,
      payload: { code: "planned_item_not_cancelled_for_restore", message: "完了または取消済みの計画項目のみ計画に戻せます。" },
    },
    "Planned item does not match fund and category": {
      status: 400,
      payload: { code: "planned_item_mismatch", message: "予定項目IDが選択した資金または費目と一致していません。" },
    },
    "Actual entry not found": {
      status: 404,
      payload: { code: "actual_entry_not_found", message: "対象の精算項目が見つかりません。" },
    },
    "Classification not found": {
      status: 404,
      payload: { code: "classification_not_found", message: "対象の分類が見つかりません。" },
    },
  };

  if (detail === "Planned item has linked actual entries") {
    return method === "DELETE"
      ? errorResponse({ code: "planned_item_delete_has_actuals", message: "精算が紐づいている計画項目は削除できません。" }, 409)
      : errorResponse({ code: "planned_item_has_actuals", message: "精算が紐づいている計画項目は取り消せません。" }, 409);
  }

  if (detail === "Fund not found") {
    return pathname.startsWith("/api/funds/")
      ? errorResponse({ code: "fund_not_found", message: "対象の予算が見つかりません。" }, 404)
      : errorResponse({ code: "invalid_reference", message: "選択した資金IDまたは費目IDを確認してください。" }, 400);
  }

  if (detail === "Category not found" || detail === "Category does not belong to fund") {
    return pathname.startsWith("/api/funds/")
      ? errorResponse({ code: "invalid_category_reference", message: "編集対象の費目IDを確認してください。" }, 400)
      : errorResponse({ code: detail === "Category not found" ? "invalid_reference" : "category_fund_mismatch", message: detail === "Category not found" ? "選択した資金IDまたは費目IDを確認してください。" : "選択した費目が資金に紐づいていません。" }, 400);
  }

  const match = mapped[detail];
  return match === undefined
    ? errorResponse({ code: "invalid_payload", message: "入力内容を確認してください。" }, 400)
    : errorResponse(match.payload, match.status);
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
        createStaticClassification(await readJsonBody(init, classificationSchema)),
        { status: 201 },
      );
    }

    if (method === "PUT") {
      const classificationId = parseId(pathname, /^\/api\/classifications\/(\d+)$/);
      if (classificationId !== null) {
        return jsonResponse(
          updateStaticClassification(
            classificationId,
            await readJsonBody(init, classificationUpdateSchema),
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
          return errorResponse(
            { code: "import_not_found", message: "対象のインポート履歴が見つかりません。" },
            404,
          );
        }

        return jsonResponse(detail);
      }
    }

    if (method === "GET") {
      const fundId = parseId(pathname, /^\/api\/funds\/(\d+)$/);
      if (fundId !== null) {
        const snapshot = getStaticFundSnapshot(fundId);
        if (snapshot.fund === undefined) {
          return errorResponse({ code: "fund_not_found", message: "対象の予算が見つかりません。" }, 404);
        }

        return jsonResponse(snapshot);
      }
    }

    if (method === "POST" && pathname === "/api/funds") {
      return jsonResponse(createStaticFund(await readJsonBody(init, fundCreationSchema)), { status: 201 });
    }

    if (method === "PUT") {
      const fundId = parseId(pathname, /^\/api\/funds\/(\d+)$/);
      if (fundId !== null) {
        return jsonResponse(updateStaticFund(fundId, await readJsonBody(init, fundUpdateSchema)));
      }
    }

    if (method === "POST" && pathname === "/api/planned-items") {
      return jsonResponse(createStaticPlannedItem(await readJsonBody(init, plannedItemSchema)), { status: 201 });
    }

    if (method === "POST" && pathname === "/api/planned-items/bulk") {
      return jsonResponse(createStaticPlannedItemsBulk(await readJsonBody(init, plannedItemsBulkSchema)), { status: 201 });
    }

    if (method === "PUT") {
      const plannedItemId = parseId(pathname, /^\/api\/planned-items\/(\d+)$/);
      if (plannedItemId !== null) {
        return jsonResponse(updateStaticPlannedItem(plannedItemId, await readJsonBody(init, plannedItemEditSchema)));
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
      return jsonResponse(createStaticActualEntry(await readJsonBody(init, actualEntrySchema)), { status: 201 });
    }

    if (method === "PUT") {
      const actualEntryId = parseId(pathname, /^\/api\/actual-entries\/(\d+)$/);
      if (actualEntryId !== null) {
        return jsonResponse(updateStaticActualEntry(actualEntryId, await readJsonBody(init, actualEntryEditSchema)));
      }
    }

    if (method === "POST") {
      const actualEntryId = parseId(pathname, /^\/api\/actual-entries\/(\d+)\/cancel$/);
      if (actualEntryId !== null) {
        return jsonResponse(cancelStaticActualEntry(actualEntryId));
      }
    }

    return invalidRouteIdResponse(method, pathname)
      ?? errorResponse({ code: "api_not_found", message: "APIが見つかりません。" }, 404);
  } catch (error) {
    return domainErrorResponse(error, pathname, method);
  }
}

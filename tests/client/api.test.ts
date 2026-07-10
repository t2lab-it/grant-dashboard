import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiGet, apiMutateJson, apiPostFile, apiPostJson, parseApiError } from "../../src/lib/api";
import { resetStaticDemoStore } from "../../src/demo/staticDemoApi";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

describe("client api helpers", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    window.localStorage.clear();
    resetStaticDemoStore();
    Reflect.deleteProperty(globalThis, "__BUDGET_DASHBOARD_STATIC_DEMO__");
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns typed JSON data for successful POST requests", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ warnings: ["Category budget exceeded for 旅費"] }),
    });

    const result = await apiPostJson<
      { amount: number },
      { warnings: string[] }
    >("/api/planned-items", {
      amount: 50000,
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/planned-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: 50000 }),
    });
    expect(result).toEqual({
      ok: true,
      data: { warnings: ["Category budget exceeded for 旅費"] },
    });
  });

  it("sends PUT and DELETE mutations through the shared JSON helper", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ success: true }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ success: true }) });

    await apiMutateJson("/api/funds/1", "PUT", { name: "更新後" });
    await apiMutateJson("/api/planned-items/1", "DELETE");

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/funds/1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "更新後" }),
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/planned-items/1", {
      method: "DELETE",
    });
  });

  it("returns the parsed error payload for failed POST requests", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        code: "planned_item_mismatch",
        message: "予定項目IDが選択した資金または費目と一致していません。",
      }),
    });

    const result = await apiPostJson("/api/actual-entries", { amount: 50000 });

    expect(result).toEqual({
      ok: false,
      error: new ApiError(
        409,
        "planned_item_mismatch",
        "予定項目IDが選択した資金または費目と一致していません。",
      ),
    });
  });

  it("throws a typed API error for failed GET requests", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({
        code: "fund_not_found",
        message: "対象の予算が見つかりません。",
      }),
    });

    await expect(apiGet("/api/funds/999")).rejects.toEqual(
      new ApiError(404, "fund_not_found", "対象の予算が見つかりません。"),
    );
  });

  it.each([
    ["invalid JSON", async () => { throw new SyntaxError("invalid JSON"); }],
    ["an invalid payload", async () => ({ error: "legacy failure" })],
  ])("safely falls back when an error response contains %s", async (_label, json) => {
    const error = await parseApiError({ status: 502, json } as Response);

    expect(error).toEqual(new ApiError(502, "unknown_error", "Request failed: 502"));
  });

  it("uploads file payloads with the provided content type and filename headers", async () => {
    const workbook = new File(["workbook"], "budget2026.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        source_filename: "budget2026.xlsx",
        import_id: 7,
      }),
    });

    const result = await apiPostFile<{ source_filename: string; import_id: number }>(
      "/api/imports/workbook",
      workbook,
    );

    expect(fetchMock).toHaveBeenCalledWith("/api/imports/workbook", {
      method: "POST",
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "x-workbook-filename": "budget2026.xlsx",
      },
      body: workbook,
    });
    expect(result).toEqual({
      ok: true,
      data: {
        source_filename: "budget2026.xlsx",
        import_id: 7,
      },
    });
  });
});

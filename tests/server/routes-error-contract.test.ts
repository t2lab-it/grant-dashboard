import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRouteTestContext } from "./routeTestUtils";

describe("API error response contract", () => {
  let app: Awaited<ReturnType<typeof createRouteTestContext>>["app"];
  let cleanupContext: () => Promise<void>;

  beforeEach(async () => {
    const context = await createRouteTestContext("test-routes-error-contract.db");
    app = context.app;
    cleanupContext = context.cleanup;
  });

  afterEach(async () => {
    await cleanupContext();
  });

  it("returns only code and Japanese message for an invalid path id", async () => {
    const response = await app.inject({ method: "GET", url: "/api/funds/not-an-id" });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      code: "invalid_fund_id",
      message: "予算IDを確認してください。",
    });
  });

  it("returns only code and Japanese message for missing resources and API routes", async () => {
    const resourceResponse = await app.inject({ method: "GET", url: "/api/funds/999" });
    const routeResponse = await app.inject({ method: "GET", url: "/api/does-not-exist" });

    expect(resourceResponse.statusCode).toBe(404);
    expect(resourceResponse.json()).toEqual({
      code: "fund_not_found",
      message: "対象の予算が見つかりません。",
    });
    expect(routeResponse.statusCode).toBe(404);
    expect(routeResponse.json()).toEqual({
      code: "api_not_found",
      message: "APIが見つかりません。",
    });
  });

  it("sanitizes unexpected failures at the API root with a query string", async () => {
    app.get("/api", () => {
      throw new Error("sensitive API root detail");
    });

    const response = await app.inject({ method: "GET", url: "/api?source=test" });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      code: "internal_error",
      message: "サーバーでエラーが発生しました。",
    });
    expect(response.body).not.toContain("sensitive API root detail");
  });

  it("returns a non-sensitive internal error for unexpected API failures", async () => {
    app.get("/api/test-unexpected-error", () => {
      throw new Error("sensitive implementation detail");
    });

    const response = await app.inject({ method: "GET", url: "/api/test-unexpected-error" });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      code: "internal_error",
      message: "サーバーでエラーが発生しました。",
    });
    expect(response.body).not.toContain("sensitive implementation detail");
  });

  it("keeps non-API programming errors visible during tests", async () => {
    app.get("/test-unexpected-error", () => {
      throw new Error("visible programming error");
    });

    const response = await app.inject({ method: "GET", url: "/test-unexpected-error" });

    expect(response.statusCode).toBe(500);
    expect(response.body).toContain("visible programming error");
  });
});

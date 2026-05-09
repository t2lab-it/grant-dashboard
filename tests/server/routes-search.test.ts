import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRouteTestContext } from "./routeTestUtils";

describe("API search routes", () => {
  let app: Awaited<ReturnType<typeof createRouteTestContext>>["app"];
  let cleanupContext: () => Promise<void>;

  beforeEach(async () => {
    const context = await createRouteTestContext("test-routes-search.db");
    app = context.app;
    cleanupContext = context.cleanup;

    app.db.exec(`
      INSERT INTO actual_entries (id, fund_id, category_id, planned_item_id, actual_date, description, amount, notes) VALUES
        (2, 1, 1, NULL, '2026-11-01', '追加精算', 2000, '未連携メモ');
    `);
  });

  afterEach(async () => {
    await cleanupContext();
  });

  it("parses tab and filter query parameters", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/search?year=2026&tab=unlinked&keyword=未連携&fundId=1&categoryId=1&entryType=actual&monthFrom=2026-11&monthTo=2026-11",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().results).toEqual([
      expect.objectContaining({
        type: "actual",
        id: 2,
        description: "追加精算",
      }),
    ]);
  });
});

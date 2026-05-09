import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "../../server/app";
import { createRouteTestContext } from "./routeTestUtils";

describe("default classification initialization", () => {
  it("initializes default auxiliary labels without default project tags", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "budget-classifications-"));
    const dbPath = join(tempDir, "app.db");
    const defaultApp = await buildServer({ dbPath });

    try {
      const listResponse = await defaultApp.inject({ method: "GET", url: "/api/classifications" });

      expect(listResponse.statusCode).toBe(200);
      expect(listResponse.json()).toEqual({
        projectTags: [],
        auxiliaryLabels: [
          { id: 1, kind: "auxiliary", name: "学生支援", color: "#16a34a" },
          { id: 2, kind: "auxiliary", name: "出張", color: "#f59e0b" },
          { id: 3, kind: "auxiliary", name: "要確認", color: "#7c3aed" },
        ],
      });
    } finally {
      await defaultApp.close();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe("API classification routes", () => {
  let app: Awaited<ReturnType<typeof createRouteTestContext>>["app"];
  let cleanupContext: () => Promise<void>;

  beforeEach(async () => {
    const context = await createRouteTestContext("test-classifications.db");
    app = context.app;
    cleanupContext = context.cleanup;
  });

  afterEach(async () => {
    await cleanupContext();
  });

  it("creates, renames, recolors, lists, and deletes project tags and auxiliary labels", async () => {
    const projectResponse = await app.inject({
      method: "POST",
      url: "/api/classifications",
      payload: {
        kind: "project",
        name: "CREST 量子",
        color: "#2563eb",
      },
    });
    const auxiliaryResponse = await app.inject({
      method: "POST",
      url: "/api/classifications",
      payload: {
        kind: "auxiliary",
        name: "学生支援",
        color: "#16a34a",
      },
    });

    expect(projectResponse.statusCode).toBe(201);
    expect(auxiliaryResponse.statusCode).toBe(201);

    const projectId = projectResponse.json().id;
    const auxiliaryId = auxiliaryResponse.json().id;

    const updateResponse = await app.inject({
      method: "PUT",
      url: `/api/classifications/${auxiliaryId}`,
      payload: {
        name: "学生旅費",
        color: "#15803d",
      },
    });

    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json()).toEqual({ success: true });

    const listResponse = await app.inject({ method: "GET", url: "/api/classifications" });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toEqual({
      projectTags: [{ id: projectId, kind: "project", name: "CREST 量子", color: "#2563eb" }],
      auxiliaryLabels: [{ id: auxiliaryId, kind: "auxiliary", name: "学生旅費", color: "#15803d" }],
    });

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/api/classifications/${projectId}`,
    });

    expect(deleteResponse.statusCode).toBe(200);
    expect(deleteResponse.json()).toEqual({ success: true });
    expect(app.db.prepare("SELECT COUNT(*) AS count FROM classification_tags").get()).toEqual({
      count: 1,
    });
  });

  it("persists fund project tags and auxiliary labels while rejecting project tags on entries", async () => {
    app.db.exec(`
      INSERT INTO classification_tags (id, kind, name, color) VALUES
        (1, 'project', 'CREST 量子', '#2563eb'),
        (2, 'auxiliary', '学生旅費', '#16a34a');
    `);

    const createFundResponse = await app.inject({
      method: "POST",
      url: "/api/funds",
      payload: {
        name: "分類つき予算",
        fiscalYear: 2026,
        awardedAmount: 100000,
        notes: "",
        projectTagIds: [1],
        auxiliaryLabelIds: [2],
        categories: [{ name: "旅費", amount: 100000, crossAggregateCategory: "travel" }],
      },
    });

    expect(createFundResponse.statusCode).toBe(201);
    const fundId = createFundResponse.json().fundId;

    const detailResponse = await app.inject({ method: "GET", url: `/api/funds/${fundId}` });
    expect(detailResponse.statusCode).toBe(200);
    expect(detailResponse.json().fund).toMatchObject({
      projectTags: [{ id: 1, kind: "project", name: "CREST 量子", color: "#2563eb" }],
      auxiliaryLabels: [{ id: 2, kind: "auxiliary", name: "学生旅費", color: "#16a34a" }],
    });

    const categoryId = detailResponse.json().categories[0].id;
    const invalidPlannedResponse = await app.inject({
      method: "POST",
      url: "/api/planned-items",
      payload: {
        fundId,
        categoryId,
        plannedDate: "2026-05-01",
        scheduledMonth: "2026-05",
        description: "学会旅費",
        amount: 20000,
        notes: "",
        auxiliaryLabelIds: [2],
        projectTagIds: [1],
      },
    });

    expect(invalidPlannedResponse.statusCode).toBe(400);
    expect(invalidPlannedResponse.json()).toMatchObject({
      code: "invalid_payload",
      message: "入力内容を確認してください。",
    });
  });

  it("removes existing assignments when a tag or label is deleted", async () => {
    app.db.exec(`
      INSERT INTO classification_tags (id, kind, name, color) VALUES
        (1, 'project', 'CREST 量子', '#2563eb'),
        (2, 'auxiliary', '学生旅費', '#16a34a');
      INSERT INTO classification_assignments (tag_id, target_type, target_id) VALUES
        (1, 'fund', 1),
        (2, 'fund', 1),
        (2, 'planned_item', 1),
        (2, 'actual_entry', 1);
    `);

    const response = await app.inject({ method: "DELETE", url: "/api/classifications/2" });

    expect(response.statusCode).toBe(200);
    expect(
      app.db
        .prepare("SELECT tag_id, target_type, target_id FROM classification_assignments ORDER BY tag_id, target_type")
        .all(),
    ).toEqual([{ tag_id: 1, target_type: "fund", target_id: 1 }]);
  });
});

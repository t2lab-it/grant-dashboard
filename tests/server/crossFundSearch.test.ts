import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../../server/db/migrate";
import { getCrossFundSearchSnapshot } from "../../server/services/crossFundSearch";

describe("cross-fund search service", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db);

    db.exec(`
      INSERT INTO funds (id, name, fiscal_year, awarded_amount, notes, display_order) VALUES
        (1, '基盤研究費', 2026, 5080000, 'GPU 関連の予算', 1),
        (2, 'ACT-X', 2026, 2000000, '', 2),
        (3, '翌年度基金', 2027, 3000000, '', 3);

      INSERT INTO categories (id, fund_id, category_code, name, cross_aggregate_category, display_order) VALUES
        (1, 1, 'category-1', '物品費', 'equipment', 1),
        (2, 1, 'category-2', '旅費', 'travel', 2),
        (3, 2, 'category-3', '消耗品費', 'equipment', 1),
        (4, 3, 'category-4', '物品費', 'equipment', 1);

      INSERT INTO planned_items (
        id, fund_id, category_id, planned_date, scheduled_month, description, amount, status, notes
      ) VALUES
        (1, 1, 1, '2026-04-01', '2026-04', 'GPU サーバ購入', 200000, 'planned', '年度初めに確認'),
        (2, 1, 2, '2026-08-01', '2026-08', '国際会議旅費', 150000, 'planned', ''),
        (3, 2, 3, '2026-06-01', '2026-06', '実験ノート', 50000, 'cancelled', ''),
        (4, 3, 4, '2027-04-01', '2027-04', '翌年度 GPU', 300000, 'planned', ''),
        (5, 1, 1, '2026-05-01', '2026-05', '完了済み GPU 周辺機器', 50000, 'completed', '残額放棄済み');

      INSERT INTO actual_entries (
        id, fund_id, category_id, planned_item_id, actual_date, description, amount, notes
      ) VALUES
        (1, 1, 1, 1, '2026-04-15', 'GPU 着手金', 80000, ''),
        (5, 1, 1, 5, '2026-05-15', 'GPU 周辺機器', 30000, ''),
        (2, 1, 2, NULL, '2026-07-02', '学会参加費', 90000, '未連携の実績'),
        (3, 2, 3, NULL, '2026-05-10', 'ノート購入', 10000, ''),
        (4, 3, 4, NULL, '2027-04-10', '翌年度支払い', 120000, '');

      INSERT INTO classification_tags (id, kind, name, color) VALUES
        (1, 'auxiliary', '学生支援', '#16a34a'),
        (2, 'auxiliary', '装置更新', '#2563eb'),
        (3, 'project', 'CREST', '#7c3aed');

      INSERT INTO classification_assignments (tag_id, target_type, target_id) VALUES
        (1, 'fund', 1),
        (2, 'planned_item', 2),
        (2, 'actual_entry', 3),
        (3, 'fund', 1);
    `);
  });

  it("returns planned and actual rows for the selected fiscal year in one result list", () => {
    const snapshot = getCrossFundSearchSnapshot(db, {
      fiscalYear: 2026,
      today: new Date("2026-07-15T00:00:00+09:00"),
    });

    expect(snapshot.selectedFiscalYear).toBe(2026);
    expect(snapshot.availableFiscalYears).toEqual([2026, 2027]);
    expect(snapshot.results.map((result) => `${result.type}:${result.id}`)).toEqual([
      "planned:2",
      "actual:2",
      "actual:5",
      "actual:3",
      "planned:5",
      "actual:1",
      "planned:1",
    ]);
    expect(snapshot.results).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ fundName: "翌年度基金" })]),
    );
    expect(snapshot.results.find((result) => result.type === "planned" && result.id === 1)).toMatchObject({
      amount: 200000,
      remainingAmount: 120000,
      statusLabel: "未精算 120,000円",
      detailHref: "/funds/1?year=2026&focus=planned-1",
    });
    expect(snapshot.results.find((result) => result.type === "planned" && result.id === 5)).toMatchObject({
      amount: 50000,
      remainingAmount: 0,
      statusLabel: "完了",
      detailHref: "/funds/1?year=2026&focus=planned-5",
    });
    expect(snapshot.results.find((result) => result.type === "actual" && result.id === 2)).toMatchObject({
      remainingAmount: null,
      statusLabel: "未連携",
      detailHref: "/funds/1?year=2026&focus=actual-2",
    });
  });

  it("matches keyword across description, notes, fund name, and category name", () => {
    expect(
      getCrossFundSearchSnapshot(db, { fiscalYear: 2026, keyword: "年度初め" }).results.map((result) => result.id),
    ).toEqual([1]);
    expect(
      getCrossFundSearchSnapshot(db, { fiscalYear: 2026, keyword: "ACT-X" }).results.map((result) => result.id),
    ).toEqual([3]);
    expect(
      getCrossFundSearchSnapshot(db, { fiscalYear: 2026, keyword: "旅費" }).results.map(
        (result) => `${result.type}:${result.id}`,
      ),
    ).toEqual(["planned:2", "actual:2"]);
  });

  it("applies fund, category, entry type, and month range filters", () => {
    const snapshot = getCrossFundSearchSnapshot(db, {
      fiscalYear: 2026,
      fundId: 1,
      categoryId: 2,
      entryType: "actual",
      monthFrom: "2026-07",
      monthTo: "2026-07",
    });

    expect(snapshot.results).toEqual([
      expect.objectContaining({
        type: "actual",
        id: 2,
        fundName: "基盤研究費",
        categoryName: "旅費",
        month: "2026-07",
      }),
    ]);
  });

  it("filters by auxiliary labels assigned directly or inherited from the fund", () => {
    const inheritedSnapshot = getCrossFundSearchSnapshot(db, {
      fiscalYear: 2026,
      auxiliaryLabelId: 1,
    });

    expect(inheritedSnapshot.filters.auxiliaryLabels).toEqual([
      { id: 1, kind: "auxiliary", name: "学生支援", color: "#16a34a" },
      { id: 2, kind: "auxiliary", name: "装置更新", color: "#2563eb" },
    ]);
    expect(inheritedSnapshot.results.map((result) => `${result.type}:${result.id}`)).toEqual([
      "planned:2",
      "actual:2",
      "actual:5",
      "planned:5",
      "actual:1",
      "planned:1",
    ]);
    expect(inheritedSnapshot.results[0].auxiliaryLabels).toEqual([
      { id: 1, kind: "auxiliary", name: "学生支援", color: "#16a34a", inherited: true },
      { id: 2, kind: "auxiliary", name: "装置更新", color: "#2563eb", inherited: false },
    ]);

    const directSnapshot = getCrossFundSearchSnapshot(db, {
      fiscalYear: 2026,
      auxiliaryLabelId: 2,
    });

    expect(directSnapshot.results.map((result) => `${result.type}:${result.id}`)).toEqual([
      "planned:2",
      "actual:3",
    ]);
  });

  it("returns review-target tabs for overdue, unsettled, and unlinked items", () => {
    const common = {
      fiscalYear: 2026,
      today: new Date("2026-07-15T00:00:00+09:00"),
    };

    expect(getCrossFundSearchSnapshot(db, { ...common, tab: "overdue" }).results).toEqual([
      expect.objectContaining({ type: "planned", id: 1, remainingAmount: 120000 }),
    ]);
    expect(
      getCrossFundSearchSnapshot(db, { ...common, tab: "unsettled" }).results.map(
        (result) => `${result.type}:${result.id}`,
      ),
    ).toEqual(["planned:2", "planned:1"]);
    expect(
      getCrossFundSearchSnapshot(db, { ...common, tab: "unlinked" }).results.map(
        (result) => `${result.type}:${result.id}`,
      ),
    ).toEqual(["actual:2", "actual:3"]);
    expect(getCrossFundSearchSnapshot(db, common).counts).toEqual({
      all: 7,
      overdue: 1,
      unsettled: 2,
      unlinked: 2,
    });
  });

  it("limits the returned result list while preserving the matching count", () => {
    const insertActual = db.prepare(
      `
      INSERT INTO actual_entries (
        id, fund_id, category_id, planned_item_id, actual_date, description, amount, notes
      ) VALUES (?, 1, 1, NULL, ?, ?, 1000, '')
      `,
    );

    for (let index = 10; index < 260; index += 1) {
      insertActual.run([index, "2026-09-01", `追加実績 ${index}`]);
    }

    const snapshot = getCrossFundSearchSnapshot(db, { fiscalYear: 2026 });

    expect(snapshot.totalResultCount).toBe(257);
    expect(snapshot.resultLimit).toBe(200);
    expect(snapshot.results).toHaveLength(200);
  });
});

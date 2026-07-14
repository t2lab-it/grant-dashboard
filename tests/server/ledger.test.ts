import { beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../../server/db/migrate";
import { createDb } from "../../server/db/client";
import {
  EntryWorkflowDomainError,
  type EntryWorkflowErrorCode,
  isEntryWorkflowDomainError,
} from "../../server/services/entryWorkflowErrors";
import {
  applyActualEntry,
  cancelPlannedItem,
  completePlannedItem,
  restorePlannedItem,
  upsertPlannedItem,
} from "../../server/services/ledger";

function expectEntryWorkflowError(fn: () => unknown, code: EntryWorkflowErrorCode) {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(EntryWorkflowDomainError);
    expect(isEntryWorkflowDomainError(error)).toBe(true);
    if (isEntryWorkflowDomainError(error)) {
      expect(error.code).toBe(code);
    }
    return;
  }

  throw new Error(`Expected EntryWorkflowDomainError(${code})`);
}

describe("ledger rules", () => {
  let db: ReturnType<typeof createDb>;

  beforeEach(() => {
    db = createDb(":memory:");
    runMigrations(db);

    db.exec(`
      INSERT INTO funds (id, fund_code, name, fiscal_year, awarded_amount, display_order) VALUES
        (1, 'basic-research', '学内研究支援費', 2026, 643000, 1);
      INSERT INTO categories (id, fund_id, category_code, name, cross_aggregate_category, display_order) VALUES
        (1, 1, 'travel', '旅費', 'travel', 1);
      INSERT INTO budget_lines (id, fund_id, category_id, amount) VALUES
        (1, 1, 1, 120000),
        (2, 1, 1, 120000);
      INSERT INTO planned_items (id, fund_id, category_id, planned_date, scheduled_month, description, amount) VALUES
        (1, 1, 1, '2026-09-01', '2026-09', '物理学会@東京', 20000);
    `);
  });

  it("does not warn when combined budget lines cover planned spending", () => {
    const result = upsertPlannedItem(db, {
      fundId: 1,
      categoryId: 1,
      plannedDate: "2026-10-01",
      scheduledMonth: "2026-10",
      description: "追加出張",
      amount: 190000,
      notes: "",
    });

    expect(result.warnings).toEqual([]);
  });

  it("returns a category warning when planned spending exceeds the combined category budget", () => {
    const result = upsertPlannedItem(db, {
      fundId: 1,
      categoryId: 1,
      plannedDate: "2026-10-01",
      scheduledMonth: "2026-10",
      description: "追加出張",
      amount: 230000,
      notes: "",
    });

    expect(result.warnings).toContain("Category budget exceeded for 旅費");
  });

  it("updates an existing planned item without double-counting its current row", () => {
    const result = upsertPlannedItem(db, {
      id: 1,
      fundId: 1,
      categoryId: 1,
      plannedDate: "2026-09-01",
      scheduledMonth: "2026-09",
      description: "物理学会@東京",
      amount: 230000,
      notes: "",
    });

    expect(result.warnings).toEqual([]);

    const updated = db
      .prepare("SELECT amount FROM planned_items WHERE id = ?")
      .get(1) as { amount: number };

    expect(updated.amount).toBe(230000);
  });

  it("assigns a generated planned_ref when inserting a browser-created planned item", () => {
    upsertPlannedItem(db, {
      fundId: 1,
      categoryId: 1,
      plannedDate: "2026-10-01",
      scheduledMonth: "2026-10",
      description: "追加出張",
      amount: 190000,
      notes: "",
    });

    const inserted = db.prepare("SELECT planned_ref FROM planned_items WHERE id != 1").get() as {
      planned_ref: string;
    };
    expect(inserted.planned_ref).toMatch(/^basic-research-travel-20261001-\d{3}$/);
  });

  it("keeps the existing planned_ref when updating an existing planned item", () => {
    db.exec("UPDATE planned_items SET planned_ref = 'basic-research-travel-20260901-001' WHERE id = 1");

    upsertPlannedItem(db, {
      id: 1,
      fundId: 1,
      categoryId: 1,
      plannedDate: "2026-09-01",
      scheduledMonth: "2026-09",
      description: "物理学会@東京",
      amount: 230000,
      notes: "",
    });

    expect(db.prepare("SELECT planned_ref FROM planned_items WHERE id = 1").get()).toEqual({
      planned_ref: "basic-research-travel-20260901-001",
    });
  });

  it("skips over gaps when generating a new planned_ref for the same prefix", () => {
    db.exec(`
      UPDATE planned_items SET planned_ref = 'basic-research-travel-20260920-001' WHERE id = 1;
      INSERT INTO planned_items (
        id,
        fund_id,
        category_id,
        planned_ref,
        planned_date,
        scheduled_month,
        description,
        amount
      ) VALUES (
        2,
        1,
        1,
        'basic-research-travel-20260920-003',
        '2026-09-20',
        '2026-09',
        '出張予備',
        5000
      );
    `);

    upsertPlannedItem(db, {
      fundId: 1,
      categoryId: 1,
      plannedDate: "2026-09-20",
      scheduledMonth: "2026-09",
      description: "追加出張",
      amount: 190000,
      notes: "",
    });

    const inserted = db
      .prepare("SELECT planned_ref FROM planned_items WHERE id NOT IN (1, 2) ORDER BY id DESC LIMIT 1")
      .get() as { planned_ref: string };

    expect(inserted.planned_ref).toBe("basic-research-travel-20260920-004");
    expect(inserted.planned_ref).not.toBe("basic-research-travel-20260920-003");
  });

  it("keeps refs unique when an existing sibling already uses a four-digit suffix", () => {
    db.exec(`
      UPDATE planned_items SET planned_ref = 'basic-research-travel-20260921-0999' WHERE id = 1;
      INSERT INTO planned_items (
        id,
        fund_id,
        category_id,
        planned_ref,
        planned_date,
        scheduled_month,
        description,
        amount
      ) VALUES (
        2,
        1,
        1,
        'basic-research-travel-20260921-1000',
        '2026-09-21',
        '2026-09',
        '出張予備',
        5000
      );
    `);

    upsertPlannedItem(db, {
      fundId: 1,
      categoryId: 1,
      plannedDate: "2026-09-21",
      scheduledMonth: "2026-09",
      description: "追加出張",
      amount: 190000,
      notes: "",
    });

    const inserted = db
      .prepare("SELECT planned_ref FROM planned_items WHERE id NOT IN (1, 2) ORDER BY id DESC LIMIT 1")
      .get() as { planned_ref: string };

    expect(inserted.planned_ref).toBe("basic-research-travel-20260921-1001");
    expect(inserted.planned_ref).not.toBe("basic-research-travel-20260921-1000");
  });

  it("reduces remaining commitment when an actual entry is linked to a planned item", () => {
    const result = applyActualEntry(db, {
      fundId: 1,
      categoryId: 1,
      plannedItemId: 1,
      actualDate: "2026-09-12",
      description: "物理学会交通費",
      amount: 8000,
      notes: "",
    });

    expect(result.remainingPlannedAmount).toBe(12000);
  });

  it("auto-completes a linked planned item when positive remaining amount is not kept", () => {
    const result = applyActualEntry(db, {
      fundId: 1,
      categoryId: 1,
      plannedItemId: 1,
      actualDate: "2026-09-12",
      description: "物理学会交通費",
      amount: 8000,
      notes: "",
      keepRemainingPlanned: false,
    });

    expect(result.remainingPlannedAmount).toBe(12000);
    expect(
      db
        .prepare("SELECT amount, status FROM planned_items WHERE id = ?")
        .get(1),
    ).toEqual({ amount: 20000, status: "completed" });
  });

  it("does not auto-complete a linked planned item when no positive remaining amount is left", () => {
    const result = applyActualEntry(db, {
      fundId: 1,
      categoryId: 1,
      plannedItemId: 1,
      actualDate: "2026-09-12",
      description: "物理学会交通費",
      amount: 20000,
      notes: "",
      keepRemainingPlanned: false,
    });

    expect(result.remainingPlannedAmount).toBe(0);
    expect(
      db
        .prepare("SELECT status FROM planned_items WHERE id = ?")
        .get(1),
    ).toEqual({ status: "planned" });
  });

  it("marks an unlinked planned item as cancelled", () => {
    cancelPlannedItem(db, 1);

    const cancelled = db
      .prepare("SELECT status FROM planned_items WHERE id = ?")
      .get(1) as { status: string };

    expect(cancelled.status).toBe("cancelled");
  });

  it("rejects cancellation when an actual entry is already linked", () => {
    applyActualEntry(db, {
      fundId: 1,
      categoryId: 1,
      plannedItemId: 1,
      actualDate: "2026-09-12",
      description: "物理学会交通費",
      amount: 8000,
      notes: "",
    });

    expectEntryWorkflowError(() => cancelPlannedItem(db, 1), "planned_item_has_actuals");

    const unchanged = db
      .prepare("SELECT status FROM planned_items WHERE id = ?")
      .get(1) as { status: string };

    expect(unchanged.status).toBe("planned");
  });

  it("marks a partially settled planned item as completed without changing the original amount", () => {
    applyActualEntry(db, {
      fundId: 1,
      categoryId: 1,
      plannedItemId: 1,
      actualDate: "2026-09-12",
      description: "物理学会交通費",
      amount: 8000,
      notes: "",
    });

    completePlannedItem(db, 1);

    expect(
      db
        .prepare("SELECT amount, status FROM planned_items WHERE id = ?")
        .get(1),
    ).toEqual({ amount: 20000, status: "completed" });
  });

  it("rejects completing a planned item with no linked actual entries", () => {
    expectEntryWorkflowError(() => completePlannedItem(db, 1), "planned_item_complete_requires_actuals");

    expect(
      db
        .prepare("SELECT status FROM planned_items WHERE id = ?")
        .get(1),
    ).toEqual({ status: "planned" });
  });

  it("rejects completing a planned item when no positive amount remains", () => {
    applyActualEntry(db, {
      fundId: 1,
      categoryId: 1,
      plannedItemId: 1,
      actualDate: "2026-09-12",
      description: "物理学会交通費",
      amount: 20000,
      notes: "",
    });

    expectEntryWorkflowError(() => completePlannedItem(db, 1), "planned_item_complete_requires_remaining");

    expect(
      db
        .prepare("SELECT status FROM planned_items WHERE id = ?")
        .get(1),
    ).toEqual({ status: "planned" });
  });

  it("restores a completed planned item to planned status", () => {
    applyActualEntry(db, {
      fundId: 1,
      categoryId: 1,
      plannedItemId: 1,
      actualDate: "2026-09-12",
      description: "物理学会交通費",
      amount: 8000,
      notes: "",
    });
    completePlannedItem(db, 1);

    restorePlannedItem(db, 1);

    expect(
      db
        .prepare("SELECT status FROM planned_items WHERE id = ?")
        .get(1),
    ).toEqual({ status: "planned" });
  });

  it("rejects a linked actual entry when the planned item does not match the entry fund or category", () => {
    db.exec(`
      INSERT INTO funds (id, name, fiscal_year, awarded_amount, display_order) VALUES
        (2, '別基金', 2026, 100000, 2);
      INSERT INTO categories (id, fund_id, category_code, name, cross_aggregate_category, display_order) VALUES
        (2, 2, 'category-2', '消耗品費', 'equipment', 1);
      INSERT INTO planned_items (id, fund_id, category_id, planned_date, scheduled_month, description, amount) VALUES
        (2, 2, 2, '2026-09-15', '2026-09', '別の予定', 5000);
    `);

    expectEntryWorkflowError(() =>
      applyActualEntry(db, {
        fundId: 1,
        categoryId: 1,
        plannedItemId: 2,
        actualDate: "2026-09-16",
        description: "不一致の実績",
        amount: 1000,
        notes: "",
      }),
      "planned_item_mismatch");

    const count = db.prepare("SELECT COUNT(*) AS count FROM actual_entries").get() as { count: number };
    expect(count.count).toBe(0);
  });

  it("throws a typed invalid_reference error for missing planned-item references", () => {
    expectEntryWorkflowError(() =>
      upsertPlannedItem(db, {
        fundId: 999,
        categoryId: 999,
        plannedDate: "2026-10-01",
        scheduledMonth: "2026-10",
        description: "存在しない参照",
        amount: 50000,
        notes: "",
      }),
      "invalid_reference");
  });
});

import type Database from "better-sqlite3";
import type {
  CreateActualEntryRequest,
  CreateActualEntryResponse,
  CreateBulkPlannedItemsRequest,
  CreateBulkPlannedItemsResponse,
  CreatePlannedItemRequest,
  CreatePlannedItemResponse,
} from "../../src/contracts/entries";
import { setAuxiliaryLabelAssignments } from "./classifications";
import { throwEntryWorkflowError } from "./entryWorkflowErrors";

type PlannedItemInput = CreatePlannedItemRequest & {
  id?: number;
};

type PlannedItemEditInput = {
  fundId: number;
  categoryId: number;
  plannedDate: string;
  scheduledMonth: string;
  description: string;
  amount: number;
  notes: string;
  auxiliaryLabelIds?: number[];
};

type PlannedItemRow = {
  fund_id: number;
  category_id: number;
  amount: number;
};

type ActualEntryInput = CreateActualEntryRequest;

type ActualEntryEditInput = {
  fundId: number;
  categoryId: number;
  actualDate: string;
  description: string;
  amount: number;
  notes: string;
  auxiliaryLabelIds?: number[];
};

function buildPlannedRefPrefix(fundCode: string, categoryCode: string, plannedDate: string) {
  return `${fundCode}-${categoryCode}-${plannedDate.replaceAll("-", "")}`;
}

function insertAndReadId(db: Database.Database) {
  const row = db.prepare("SELECT last_insert_rowid() AS id").get() as { id: number };
  return Number(row.id);
}

function getPlannedRefIdentity(
  db: Database.Database,
  fundId: number,
  categoryId: number,
) {
  const identity = db
    .prepare(
      `
      SELECT funds.fund_code AS fund_code, categories.category_code AS category_code
      FROM categories
      JOIN funds ON funds.id = categories.fund_id
      WHERE funds.id = @fundId AND categories.id = @categoryId
      `,
    )
    .get({ fundId, categoryId }) as { fund_code: string | null; category_code: string | null } | undefined;

  const fundCode = identity?.fund_code?.trim();
  const categoryCode = identity?.category_code?.trim();
  if (!fundCode || !categoryCode) {
    throwEntryWorkflowError("invalid_reference");
  }

  return { fund_code: fundCode, category_code: categoryCode };
}

function nextPlannedRef(
  db: Database.Database,
  fundId: number,
  categoryId: number,
  plannedDate: string,
) {
  const identity = getPlannedRefIdentity(db, fundId, categoryId);

  const prefix = buildPlannedRefPrefix(identity.fund_code, identity.category_code, plannedDate);
  const siblings = db
    .prepare("SELECT planned_ref FROM planned_items WHERE planned_ref LIKE ?")
    .all(`${prefix}-%`) as Array<{ planned_ref: string }>;
  const sequence = siblings.reduce((maxSequence, sibling) => {
    const match = sibling.planned_ref.match(/-(\d+)$/);
    if (match === null) {
      return maxSequence;
    }

    const parsedSequence = Number.parseInt(match[1], 10);
    return Number.isNaN(parsedSequence) ? maxSequence : Math.max(maxSequence, parsedSequence);
  }, 0);

  return `${prefix}-${(sequence + 1).toString().padStart(3, "0")}`;
}

function moveLinkedActualEntries(
  db: Database.Database,
  plannedItemId: number,
  fundId: number,
  categoryId: number,
) {
  db.prepare(
    `
    UPDATE actual_entries
    SET fund_id = @fundId,
        category_id = @categoryId
    WHERE planned_item_id = @plannedItemId
    `,
  ).run({ plannedItemId, fundId, categoryId });
}

function assertCategoryBelongsToFund(
  db: Database.Database,
  fundId: number,
  categoryId: number,
) {
  const fund = db.prepare("SELECT 1 AS found FROM funds WHERE id = ?").get(fundId) as
    | { found: number }
    | undefined;
  const category = db.prepare("SELECT fund_id FROM categories WHERE id = ?").get(categoryId) as
    | { fund_id: number }
    | undefined;

  if (fund === undefined || category === undefined) {
    throwEntryWorkflowError("invalid_reference");
  }

  if (category.fund_id !== fundId) {
    throwEntryWorkflowError("category_fund_mismatch");
  }
}

export function upsertPlannedItem(
  db: Database.Database,
  input: PlannedItemInput,
): CreatePlannedItemResponse {
  assertCategoryBelongsToFund(db, input.fundId, input.categoryId);

  if (input.id !== undefined) {
    db.prepare(
      `
      UPDATE planned_items
      SET fund_id = @fundId,
          category_id = @categoryId,
          planned_date = @plannedDate,
          scheduled_month = @scheduledMonth,
          description = @description,
          amount = @amount,
          notes = @notes
      WHERE id = @id
      `,
    ).run(input);
    setAuxiliaryLabelAssignments(db, "planned_item", input.id, input.auxiliaryLabelIds ?? []);
  } else {
    db.prepare(
      `
      INSERT INTO planned_items (
        fund_id,
        category_id,
        planned_ref,
        planned_date,
        scheduled_month,
        description,
        amount,
        notes
      )
      VALUES (
        @fundId,
        @categoryId,
        @plannedRef,
        @plannedDate,
        @scheduledMonth,
        @description,
        @amount,
        @notes
      )
      `,
    ).run({
      ...input,
      plannedRef: nextPlannedRef(db, input.fundId, input.categoryId, input.plannedDate),
    });
    setAuxiliaryLabelAssignments(db, "planned_item", insertAndReadId(db), input.auxiliaryLabelIds ?? []);
  }

  const category = db
    .prepare("SELECT name FROM categories WHERE id = ?")
    .get(input.categoryId) as { name: string };

  const budget = db
    .prepare("SELECT COALESCE(SUM(COALESCE(amount, 0)), 0) AS amount FROM budget_lines WHERE category_id = ?")
    .get(input.categoryId) as { amount: number | null } | undefined;

  const plannedTotal = db
    .prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM planned_items WHERE category_id = ? AND status = 'planned'")
    .get(input.categoryId) as { total: number };

  const warnings: string[] = [];
  if (budget?.amount !== null && budget?.amount !== undefined && plannedTotal.total > budget.amount) {
    warnings.push(`Category budget exceeded for ${category.name}`);
  }

  return { warnings };
}

export function createPlannedItemsBulk(
  db: Database.Database,
  input: CreateBulkPlannedItemsRequest,
): CreateBulkPlannedItemsResponse {
  const createItems = db.transaction(() => {
    const warnings = new Set<string>();

    for (const item of input.items) {
      const result = upsertPlannedItem(db, {
        fundId: input.fundId,
        categoryId: input.categoryId,
        plannedDate: input.plannedDate,
        scheduledMonth: item.scheduledMonth,
        description: item.description,
        amount: item.amount,
        notes: input.notes,
        auxiliaryLabelIds: input.auxiliaryLabelIds ?? [],
      });

      for (const warning of result.warnings) {
        warnings.add(warning);
      }
    }

    return {
      createdCount: input.items.length,
      warnings: Array.from(warnings),
    };
  }) as () => CreateBulkPlannedItemsResponse;

  return createItems();
}

export function applyActualEntry(
  db: Database.Database,
  input: ActualEntryInput,
): CreateActualEntryResponse {
  const createActualEntry = db.transaction((): CreateActualEntryResponse => {
    assertCategoryBelongsToFund(db, input.fundId, input.categoryId);

    if (input.plannedItemId !== undefined) {
      const planned = db
        .prepare("SELECT fund_id, category_id, amount FROM planned_items WHERE id = ?")
        .get(input.plannedItemId) as PlannedItemRow | undefined;

      if (
        planned === undefined ||
        planned.fund_id !== input.fundId ||
        planned.category_id !== input.categoryId
      ) {
        throwEntryWorkflowError("planned_item_mismatch");
      }
    }

    db.prepare(
      `
      INSERT INTO actual_entries (fund_id, category_id, planned_item_id, actual_date, description, amount, notes)
      VALUES (@fundId, @categoryId, @plannedItemId, @actualDate, @description, @amount, @notes)
      `,
    ).run({ plannedItemId: null, ...input });
    const actualEntryId = insertAndReadId(db);
    setAuxiliaryLabelAssignments(db, "actual_entry", actualEntryId, input.auxiliaryLabelIds ?? []);

    let remainingPlannedAmount: number | null = null;

    if (input.plannedItemId) {
      const planned = db
        .prepare("SELECT amount FROM planned_items WHERE id = ?")
        .get(input.plannedItemId) as { amount: number };

      const actualTotal = db
        .prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM actual_entries WHERE planned_item_id = ?")
        .get(input.plannedItemId) as { total: number };

      remainingPlannedAmount = planned.amount - actualTotal.total;

      if (remainingPlannedAmount > 0 && input.keepRemainingPlanned === false) {
        db.prepare("UPDATE planned_items SET status = 'completed' WHERE id = ?").run(input.plannedItemId);
      }
    }

    return { remainingPlannedAmount };
  }) as () => CreateActualEntryResponse;

  return createActualEntry();
}

export function cancelPlannedItem(db: Database.Database, plannedItemId: number) {
  const plannedItem = db
    .prepare("SELECT id FROM planned_items WHERE id = ?")
    .get(plannedItemId) as { id: number } | undefined;

  if (plannedItem === undefined) {
    throwEntryWorkflowError("planned_item_not_found");
  }

  const linkedActualEntry = db
    .prepare("SELECT 1 AS found FROM actual_entries WHERE planned_item_id = ? LIMIT 1")
    .get(plannedItemId) as { found: number } | undefined;

  if (linkedActualEntry !== undefined) {
    throwEntryWorkflowError("planned_item_has_actuals");
  }

  db.prepare("UPDATE planned_items SET status = 'cancelled' WHERE id = ?").run(plannedItemId);

  return { success: true };
}

export function deletePlannedItem(db: Database.Database, plannedItemId: number) {
  const plannedItem = db
    .prepare("SELECT id, status FROM planned_items WHERE id = ?")
    .get(plannedItemId) as { id: number; status: string } | undefined;

  if (plannedItem === undefined) {
    throwEntryWorkflowError("planned_item_not_found");
  }

  if (plannedItem.status !== "planned" && plannedItem.status !== "cancelled") {
    throwEntryWorkflowError("planned_item_not_deletable");
  }

  const linkedActualEntry = db
    .prepare("SELECT 1 AS found FROM actual_entries WHERE planned_item_id = ? LIMIT 1")
    .get(plannedItemId) as { found: number } | undefined;

  if (linkedActualEntry !== undefined) {
    throwEntryWorkflowError("planned_item_delete_has_actuals");
  }

  return db.transaction(() => {
    db.prepare(
      `
      DELETE FROM classification_assignments
      WHERE target_type = 'planned_item'
        AND target_id = ?
      `,
    ).run(plannedItemId);
    db.prepare("DELETE FROM planned_items WHERE id = ?").run(plannedItemId);

    return { success: true };
  })();
}

export function completePlannedItem(db: Database.Database, plannedItemId: number) {
  const plannedItem = db
    .prepare(
      `
      SELECT
        p.id,
        p.status,
        p.amount,
        COALESCE(SUM(ae.amount), 0) AS linkedAmount,
        COUNT(ae.id) AS linkedCount
      FROM planned_items p
      LEFT JOIN actual_entries ae ON ae.planned_item_id = p.id
      WHERE p.id = ?
      GROUP BY p.id
      `,
    )
    .get(plannedItemId) as
    | { id: number; status: string; amount: number; linkedAmount: number; linkedCount: number }
    | undefined;

  if (plannedItem === undefined) {
    throwEntryWorkflowError("planned_item_not_found");
  }

  if (plannedItem.status !== "planned" || plannedItem.linkedCount === 0) {
    throwEntryWorkflowError("planned_item_complete_requires_actuals");
  }

  if (plannedItem.amount - plannedItem.linkedAmount <= 0) {
    throwEntryWorkflowError("planned_item_complete_requires_remaining");
  }

  db.prepare("UPDATE planned_items SET status = 'completed' WHERE id = ?").run(plannedItemId);

  return { success: true };
}

export function restorePlannedItem(db: Database.Database, plannedItemId: number) {
  const plannedItem = db
    .prepare("SELECT id, status FROM planned_items WHERE id = ?")
    .get(plannedItemId) as { id: number; status: string } | undefined;

  if (plannedItem === undefined) {
    throwEntryWorkflowError("planned_item_not_found");
  }

  if (plannedItem.status !== "cancelled" && plannedItem.status !== "completed") {
    throwEntryWorkflowError("planned_item_not_cancelled_for_restore");
  }

  db.prepare("UPDATE planned_items SET status = 'planned' WHERE id = ?").run(plannedItemId);

  return { success: true };
}

export function updateActualEntry(
  db: Database.Database,
  actualEntryId: number,
  input: ActualEntryEditInput,
) {
  assertCategoryBelongsToFund(db, input.fundId, input.categoryId);

  return db.transaction(() => {
    const current = db
      .prepare(
        `
        SELECT id, planned_item_id
        FROM actual_entries
        WHERE id = ?
        `,
      )
      .get(actualEntryId) as { id: number; planned_item_id: number | null } | undefined;

    if (current === undefined) {
      throwEntryWorkflowError("actual_entry_not_found");
    }

    if (current.planned_item_id !== null) {
      const plannedItem = db
        .prepare("SELECT id FROM planned_items WHERE id = ?")
        .get(current.planned_item_id) as { id: number } | undefined;

      if (plannedItem === undefined) {
        throwEntryWorkflowError("planned_item_not_found");
      }

      db.prepare(
        `
        UPDATE planned_items
        SET fund_id = @fundId,
            category_id = @categoryId
        WHERE id = @plannedItemId
        `,
      ).run({
        plannedItemId: current.planned_item_id,
        fundId: input.fundId,
        categoryId: input.categoryId,
      });
      moveLinkedActualEntries(db, current.planned_item_id, input.fundId, input.categoryId);
    }

    db.prepare(
      `
      UPDATE actual_entries
      SET fund_id = @fundId,
          category_id = @categoryId,
          actual_date = @actualDate,
          description = @description,
          amount = @amount,
          notes = @notes
      WHERE id = @id
      `,
    ).run({
      id: actualEntryId,
      fundId: input.fundId,
      categoryId: input.categoryId,
      actualDate: input.actualDate,
      description: input.description,
      amount: input.amount,
      notes: input.notes,
    });
    setAuxiliaryLabelAssignments(db, "actual_entry", actualEntryId, input.auxiliaryLabelIds ?? []);

    return { success: true };
  })();
}

export function cancelActualEntry(db: Database.Database, actualEntryId: number) {
  const current = db
    .prepare("SELECT id FROM actual_entries WHERE id = ?")
    .get(actualEntryId) as { id: number } | undefined;

  if (current === undefined) {
    throwEntryWorkflowError("actual_entry_not_found");
  }

  return db.transaction(() => {
    db.prepare(
      `
      DELETE FROM classification_assignments
      WHERE target_type = 'actual_entry'
        AND target_id = ?
      `,
    ).run(actualEntryId);
    db.prepare("DELETE FROM actual_entries WHERE id = ?").run(actualEntryId);

    return { success: true };
  })();
}

export function updatePlannedItem(db: Database.Database, plannedItemId: number, input: PlannedItemEditInput) {
  assertCategoryBelongsToFund(db, input.fundId, input.categoryId);

  return db.transaction(() => {
    const current = db
      .prepare(
        `
        SELECT id
        FROM planned_items
        WHERE id = ?
        `,
      )
      .get(plannedItemId) as
      | { id: number }
      | undefined;

    if (current === undefined) {
      throwEntryWorkflowError("planned_item_not_found");
    }

    const result = upsertPlannedItem(db, {
      id: plannedItemId,
      fundId: input.fundId,
      categoryId: input.categoryId,
      plannedDate: input.plannedDate,
      scheduledMonth: input.scheduledMonth,
      description: input.description,
      amount: input.amount,
      notes: input.notes,
      auxiliaryLabelIds: input.auxiliaryLabelIds ?? [],
    });

    moveLinkedActualEntries(db, plannedItemId, input.fundId, input.categoryId);

    return result;
  })();
}

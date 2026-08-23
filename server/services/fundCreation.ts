import type Database from "better-sqlite3";
import { setFundClassifications } from "./classifications";
import type { ParsedUpdateFundRequest } from "../../src/contracts/requestSchemas";

export type CreateFundInput = ParsedUpdateFundRequest;

type ExistingCategoryRow = {
  id: number;
};

type CategoryUsageRow = {
  plannedCount: number;
  actualCount: number;
};

export const FUND_NOT_FOUND_ERROR = "Fund not found";
export const INVALID_CATEGORY_UPDATE_ERROR = "Category does not belong to fund";
export const CATEGORY_HAS_LINKED_ENTRIES_ERROR = "Category has linked planned or actual entries";

function insertAndReadId(db: Database.Database) {
  const row = db.prepare("SELECT last_insert_rowid() AS id").get() as { id: number };
  return Number(row.id);
}

function defaultFundCode(fundId: number) {
  return `fund-${fundId}`;
}

function defaultCategoryCode(categoryId: number) {
  return `category-${categoryId}`;
}

function getNextCategoryId(db: Database.Database) {
  const row = db.prepare("SELECT COALESCE(MAX(id), 0) + 1 AS id FROM categories").get() as { id: number };
  return row.id;
}

function getNextFundDisplayOrder(db: Database.Database) {
  const row = db.prepare("SELECT COALESCE(MAX(display_order), 0) + 1 AS display_order FROM funds").get() as {
    display_order: number;
  };
  return row.display_order;
}

export function createFundWithBudget(db: Database.Database, input: CreateFundInput) {
  const createFund = db.transaction(() => {
    const fundStmt = db.prepare(`
      INSERT INTO funds (name, fiscal_year, awarded_amount, notes, display_order)
      VALUES (@name, @fiscal_year, @awarded_amount, @notes, @display_order)
    `);
    const categoryStmt = db.prepare(`
      INSERT INTO categories (id, fund_id, category_code, name, cross_aggregate_category, display_order)
      VALUES (@id, @fund_id, @category_code, @name, @cross_aggregate_category, @display_order)
    `);
    const budgetLineStmt = db.prepare(`
      INSERT INTO budget_lines (fund_id, category_id, amount, notes)
      VALUES (@fund_id, @category_id, @amount, @notes)
    `);

    fundStmt.run({
      name: input.name,
      fiscal_year: input.fiscalYear,
      awarded_amount: input.awardedAmount,
      notes: input.notes,
      display_order: getNextFundDisplayOrder(db),
    });

    const fundId = insertAndReadId(db);
    db.prepare("UPDATE funds SET fund_code = @fundCode WHERE id = @fundId").run({
      fundCode: defaultFundCode(fundId),
      fundId,
    });
    setFundClassifications(db, fundId, {
      projectTagIds: input.projectTagIds ?? [],
      auxiliaryLabelIds: input.auxiliaryLabelIds ?? [],
    });

    for (const [index, category] of input.categories.entries()) {
      const categoryId = getNextCategoryId(db);
      categoryStmt.run({
        id: categoryId,
        fund_id: fundId,
        category_code: defaultCategoryCode(categoryId),
        name: category.name,
        cross_aggregate_category: category.crossAggregateCategory,
        display_order: index + 1,
      });

      budgetLineStmt.run({
        fund_id: fundId,
        category_id: categoryId,
        amount: category.amount,
        notes: "",
      });
    }

    return { fundId };
  });

  return createFund();
}

export function updateFundWithBudget(db: Database.Database, fundId: number, input: CreateFundInput) {
  const updateFund = db.transaction(() => {
    const fundRow = db.prepare("SELECT id FROM funds WHERE id = ?").get(fundId) as { id: number } | undefined;
    if (fundRow === undefined) {
      throw new Error(FUND_NOT_FOUND_ERROR);
    }

    const existingCategories = db
      .prepare(
        `
        SELECT id
        FROM categories
        WHERE fund_id = ?
        ORDER BY display_order, id
        `,
      )
      .all(fundId) as ExistingCategoryRow[];
    const existingCategoryIds = new Set(existingCategories.map((category) => category.id));
    const requestedCategoryIds = new Set<number>();

    for (const category of input.categories) {
      if (category.id === undefined) {
        continue;
      }

      if (!existingCategoryIds.has(category.id)) {
        throw new Error(INVALID_CATEGORY_UPDATE_ERROR);
      }

      requestedCategoryIds.add(category.id);
    }

    const removedCategories = existingCategories.filter((category) => !requestedCategoryIds.has(category.id));
    const usageStmt = db.prepare(
      `
      SELECT
        (SELECT COUNT(*) FROM planned_items WHERE category_id = @categoryId) AS plannedCount,
        (SELECT COUNT(*) FROM actual_entries WHERE category_id = @categoryId) AS actualCount
      `,
    );

    for (const category of removedCategories) {
      const usage = usageStmt.get({ categoryId: category.id }) as CategoryUsageRow;
      if (usage.plannedCount > 0 || usage.actualCount > 0) {
        throw new Error(CATEGORY_HAS_LINKED_ENTRIES_ERROR);
      }
    }

    db.prepare(
      `
      UPDATE funds
      SET name = @name,
          fiscal_year = @fiscal_year,
          awarded_amount = @awarded_amount,
          notes = @notes
      WHERE id = @id
      `,
    ).run({
      id: fundId,
      name: input.name,
      fiscal_year: input.fiscalYear,
      awarded_amount: input.awardedAmount,
      notes: input.notes,
    });
    setFundClassifications(db, fundId, {
      projectTagIds: input.projectTagIds ?? [],
      auxiliaryLabelIds: input.auxiliaryLabelIds ?? [],
    });

    const updateCategoryStmt = db.prepare(
      `
      UPDATE categories
      SET name = @name,
          cross_aggregate_category = @cross_aggregate_category,
          display_order = @display_order
      WHERE id = @id AND fund_id = @fund_id
      `,
    );
    const insertCategoryStmt = db.prepare(
      `
      INSERT INTO categories (id, fund_id, category_code, name, cross_aggregate_category, display_order)
      VALUES (@id, @fund_id, @category_code, @name, @cross_aggregate_category, @display_order)
      `,
    );
    const updateBudgetLineStmt = db.prepare(
      `
      UPDATE budget_lines
      SET amount = @amount
      WHERE fund_id = @fund_id AND category_id = @category_id
      `,
    );
    const insertBudgetLineStmt = db.prepare(
      `
      INSERT INTO budget_lines (fund_id, category_id, amount, notes)
      VALUES (@fund_id, @category_id, @amount, @notes)
      `,
    );
    const deleteBudgetLinesStmt = db.prepare(
      "DELETE FROM budget_lines WHERE fund_id = @fund_id AND category_id = @category_id",
    );
    const deleteCategoryStmt = db.prepare(
      "DELETE FROM categories WHERE fund_id = @fund_id AND id = @id",
    );

    for (const [index, category] of input.categories.entries()) {
      const displayOrder = index + 1;
      let categoryId = category.id;

      if (categoryId === undefined) {
        categoryId = getNextCategoryId(db);
        insertCategoryStmt.run({
          id: categoryId,
          fund_id: fundId,
          category_code: defaultCategoryCode(categoryId),
          name: category.name,
          cross_aggregate_category: category.crossAggregateCategory,
          display_order: displayOrder,
        });
      } else {
        updateCategoryStmt.run({
          id: categoryId,
          fund_id: fundId,
          name: category.name,
          cross_aggregate_category: category.crossAggregateCategory,
          display_order: displayOrder,
        });
      }

      const budgetLineResult = updateBudgetLineStmt.run({
        fund_id: fundId,
        category_id: categoryId,
        amount: category.amount,
      }) as { changes: number };

      if (budgetLineResult.changes === 0) {
        insertBudgetLineStmt.run({
          fund_id: fundId,
          category_id: categoryId,
          amount: category.amount,
          notes: "",
        });
      }
    }

    for (const category of removedCategories) {
      deleteBudgetLinesStmt.run({ fund_id: fundId, category_id: category.id });
      deleteCategoryStmt.run({ fund_id: fundId, id: category.id });
    }

    return { success: true };
  });

  return updateFund();
}

export function deleteFund(db: Database.Database, fundId: number) {
  const deleteFundTransaction = db.transaction(() => {
    const fundRow = db.prepare("SELECT id FROM funds WHERE id = ?").get(fundId) as
      | { id: number }
      | undefined;
    if (fundRow === undefined) {
      throw new Error(FUND_NOT_FOUND_ERROR);
    }

    db.prepare(
      `
      DELETE FROM classification_assignments
      WHERE (target_type = 'fund' AND target_id = @fundId)
         OR (
           target_type = 'planned_item'
           AND target_id IN (SELECT id FROM planned_items WHERE fund_id = @fundId)
         )
         OR (
           target_type = 'actual_entry'
           AND target_id IN (SELECT id FROM actual_entries WHERE fund_id = @fundId)
         )
      `,
    ).run({ fundId });

    db.prepare("DELETE FROM funds WHERE id = ?").run(fundId);

    return { success: true };
  });

  return deleteFundTransaction();
}

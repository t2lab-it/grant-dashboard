import type { StaticDemoActualEntry, StaticDemoPlannedItem, StaticDemoState } from "./staticDemoData";
import type {
  ParsedCreateActualEntryRequest,
  ParsedCreateBulkPlannedItemsRequest,
  ParsedCreateClassificationRequest,
  ParsedCreateFundRequest,
  ParsedCreatePlannedItemRequest,
  ParsedUpdateActualEntryRequest,
  ParsedUpdateClassificationRequest,
  ParsedUpdateFundRequest,
  ParsedUpdatePlannedItemRequest,
} from "../contracts/requestSchemas";
import { mutateStaticDemoState } from "./staticDemoState";
import { getLinkedActuals, nextId, replaceStaticAssignments, requireCategoryForFund, requireCrossAggregateCategory, requireFund, sumBudgetLines } from "./staticDemoDomain";
function categoryBudgetExceededWarnings(state: StaticDemoState, categoryId: number) {
  const category = state.categories.find((row) => row.id === categoryId);
  const budget = sumBudgetLines(state.budget_lines.filter((row) => row.category_id === categoryId));
  if (category === undefined || budget === null) {
    return [];
  }

  const plannedTotal = state.planned_items
    .filter((item) => item.category_id === categoryId && item.status === "planned")
    .reduce((sum, item) => sum + item.amount, 0);

  return plannedTotal > budget ? [`Category budget exceeded for ${category.name}`] : [];
}

export function createStaticFund(input: ParsedCreateFundRequest) {
  return mutateStaticDemoState((state) => {
    const fundId = nextId(state.funds);
    const displayOrder = state.funds.reduce((max, fund) => Math.max(max, fund.display_order), 0) + 1;
    state.funds.push({
      id: fundId,
      fund_code: null,
      name: input.name,
      fiscal_year: input.fiscalYear,
      awarded_amount: input.awardedAmount,
      notes: input.notes,
      display_order: displayOrder,
    });
    replaceStaticAssignments(state, "fund", fundId, "project", input.projectTagIds);
    replaceStaticAssignments(state, "fund", fundId, "auxiliary", input.auxiliaryLabelIds);

    for (const [index, category] of input.categories.entries()) {
      const categoryId = nextId(state.categories);
      state.categories.push({
        id: categoryId,
        fund_id: fundId,
        category_code: `category-${categoryId}`,
        name: category.name,
        cross_aggregate_category: requireCrossAggregateCategory(category.crossAggregateCategory),
        display_order: index + 1,
      });
      state.budget_lines.push({
        id: nextId(state.budget_lines),
        fund_id: fundId,
        category_id: categoryId,
        amount: category.amount,
        notes: "",
      });
    }

    return { fundId };
  });
}

export function updateStaticFund(fundId: number, input: ParsedUpdateFundRequest) {
  return mutateStaticDemoState((state) => {
    const fund = requireFund(state, fundId);
    fund.name = input.name;
    fund.fiscal_year = input.fiscalYear;
    fund.awarded_amount = input.awardedAmount;
    fund.notes = input.notes;
    replaceStaticAssignments(state, "fund", fundId, "project", input.projectTagIds);
    replaceStaticAssignments(state, "fund", fundId, "auxiliary", input.auxiliaryLabelIds);

    const requestedIds = new Set(input.categories.flatMap((category) => (category.id === undefined ? [] : [category.id])));
    for (const category of state.categories.filter((row) => row.fund_id === fundId)) {
      if (requestedIds.has(category.id)) {
        continue;
      }

      const hasEntries =
        state.planned_items.some((item) => item.category_id === category.id) ||
        state.actual_entries.some((entry) => entry.category_id === category.id);
      if (hasEntries) {
        throw new Error("Category has linked planned or actual entries");
      }
    }

    state.categories = state.categories.filter((category) => category.fund_id !== fundId || requestedIds.has(category.id));
    state.budget_lines = state.budget_lines.filter((line) => line.fund_id !== fundId || requestedIds.has(line.category_id));

    for (const [index, categoryInput] of input.categories.entries()) {
      let category = categoryInput.id === undefined
        ? undefined
        : state.categories.find((row) => row.id === categoryInput.id && row.fund_id === fundId);

      if (categoryInput.id !== undefined && category === undefined) {
        throw new Error("Category does not belong to fund");
      }

      if (category === undefined) {
        const categoryId = nextId(state.categories);
        category = {
          id: categoryId,
          fund_id: fundId,
          category_code: `category-${categoryId}`,
          name: categoryInput.name,
          cross_aggregate_category: requireCrossAggregateCategory(categoryInput.crossAggregateCategory),
          display_order: index + 1,
        };
        state.categories.push(category);
      }

      category.name = categoryInput.name;
      category.cross_aggregate_category = requireCrossAggregateCategory(categoryInput.crossAggregateCategory);
      category.display_order = index + 1;

      let budgetLine = state.budget_lines.find((line) => line.fund_id === fundId && line.category_id === category.id);
      if (budgetLine === undefined) {
        budgetLine = {
          id: nextId(state.budget_lines),
          fund_id: fundId,
          category_id: category.id,
          amount: categoryInput.amount,
          notes: "",
        };
        state.budget_lines.push(budgetLine);
      }
      budgetLine.amount = categoryInput.amount;
    }

    return { success: true };
  });
}

export function createStaticPlannedItem(input: ParsedCreatePlannedItemRequest) {
  return mutateStaticDemoState((state) => {
    requireCategoryForFund(state, input.fundId, input.categoryId);
    const plannedItem: StaticDemoPlannedItem = {
      id: nextId(state.planned_items),
      fund_id: input.fundId,
      category_id: input.categoryId,
      planned_ref: null,
      planned_date: input.plannedDate,
      scheduled_month: input.scheduledMonth,
      description: input.description,
      amount: input.amount,
      status: "planned",
      notes: input.notes,
    };
    state.planned_items.push(plannedItem);
    replaceStaticAssignments(state, "planned_item", plannedItem.id, "auxiliary", input.auxiliaryLabelIds);

    return { warnings: categoryBudgetExceededWarnings(state, input.categoryId) };
  });
}

export function createStaticPlannedItemsBulk(input: ParsedCreateBulkPlannedItemsRequest) {
  return mutateStaticDemoState((state) => {
    requireCategoryForFund(state, input.fundId, input.categoryId);

    for (const item of input.items) {
      const plannedItem: StaticDemoPlannedItem = {
        id: nextId(state.planned_items),
        fund_id: input.fundId,
        category_id: input.categoryId,
        planned_ref: null,
        planned_date: input.plannedDate,
        scheduled_month: item.scheduledMonth,
        description: item.description,
        amount: item.amount,
        status: "planned",
        notes: input.notes,
      };
      state.planned_items.push(plannedItem);
      replaceStaticAssignments(state, "planned_item", plannedItem.id, "auxiliary", input.auxiliaryLabelIds);
    }

    return {
      createdCount: input.items.length,
      warnings: Array.from(new Set(categoryBudgetExceededWarnings(state, input.categoryId))),
    };
  });
}

export function updateStaticPlannedItem(plannedItemId: number, input: ParsedUpdatePlannedItemRequest) {
  return mutateStaticDemoState((state) => {
    requireCategoryForFund(state, input.fundId, input.categoryId);
    const plannedItem = state.planned_items.find((item) => item.id === plannedItemId);
    if (plannedItem === undefined) {
      throw new Error("Planned item not found");
    }

    plannedItem.fund_id = input.fundId;
    plannedItem.category_id = input.categoryId;
    plannedItem.scheduled_month = input.scheduledMonth;
    plannedItem.description = input.description;
    plannedItem.amount = input.amount;
    plannedItem.notes = input.notes;
    replaceStaticAssignments(state, "planned_item", plannedItem.id, "auxiliary", input.auxiliaryLabelIds);

    for (const entry of state.actual_entries.filter((row) => row.planned_item_id === plannedItemId)) {
      entry.fund_id = input.fundId;
      entry.category_id = input.categoryId;
    }

    return { warnings: categoryBudgetExceededWarnings(state, input.categoryId) };
  });
}

export function cancelStaticPlannedItem(plannedItemId: number) {
  return mutateStaticDemoState((state) => {
    const plannedItem = state.planned_items.find((item) => item.id === plannedItemId);
    if (plannedItem === undefined) {
      throw new Error("Planned item not found");
    }

    if (getLinkedActuals(state, plannedItemId).length > 0) {
      throw new Error("Planned item has linked actual entries");
    }

    plannedItem.status = "cancelled";
    return { success: true };
  });
}

export function completeStaticPlannedItem(plannedItemId: number) {
  return mutateStaticDemoState((state) => {
    const plannedItem = state.planned_items.find((item) => item.id === plannedItemId);
    if (plannedItem === undefined) {
      throw new Error("Planned item not found");
    }

    const linkedActuals = getLinkedActuals(state, plannedItemId);
    if (plannedItem.status !== "planned" || linkedActuals.length === 0) {
      throw new Error("Planned item is not partially settled");
    }

    if (plannedItem.amount - linkedActuals.reduce((sum, row) => sum + row.amount, 0) <= 0) {
      throw new Error("Planned item has no remaining amount");
    }

    plannedItem.status = "completed";
    return { success: true };
  });
}

export function deleteStaticPlannedItem(plannedItemId: number) {
  return mutateStaticDemoState((state) => {
    const plannedItem = state.planned_items.find((item) => item.id === plannedItemId);
    if (plannedItem === undefined) {
      throw new Error("Planned item not found");
    }

    if (plannedItem.status !== "planned" && plannedItem.status !== "cancelled") {
      throw new Error("Planned item is not deletable");
    }

    if (getLinkedActuals(state, plannedItemId).length > 0) {
      throw new Error("Planned item has linked actual entries");
    }

    state.planned_items = state.planned_items.filter((item) => item.id !== plannedItemId);
    state.classification_assignments = state.classification_assignments.filter(
      (assignment) => assignment.target_type !== "planned_item" || assignment.target_id !== plannedItemId,
    );
    return { success: true };
  });
}

export function restoreStaticCancelledPlannedItem(plannedItemId: number) {
  return mutateStaticDemoState((state) => {
    const plannedItem = state.planned_items.find((item) => item.id === plannedItemId);
    if (plannedItem === undefined) {
      throw new Error("Planned item not found");
    }

    if (plannedItem.status !== "cancelled" && plannedItem.status !== "completed") {
      throw new Error("Planned item is not restorable");
    }

    plannedItem.status = "planned";
    return { success: true };
  });
}

export function createStaticActualEntry(input: ParsedCreateActualEntryRequest) {
  return mutateStaticDemoState((state) => {
    requireCategoryForFund(state, input.fundId, input.categoryId);

    if (input.plannedItemId !== undefined) {
      const plannedItem = state.planned_items.find((item) => item.id === input.plannedItemId);
      if (
        plannedItem === undefined ||
        plannedItem.fund_id !== input.fundId ||
        plannedItem.category_id !== input.categoryId
      ) {
        throw new Error("Planned item does not match fund and category");
      }
    }

    const entry: StaticDemoActualEntry = {
      id: nextId(state.actual_entries),
      fund_id: input.fundId,
      category_id: input.categoryId,
      planned_item_id: input.plannedItemId ?? null,
      actual_date: input.actualDate,
      description: input.description,
      amount: input.amount,
      notes: input.notes,
    };
    state.actual_entries.push(entry);
    replaceStaticAssignments(state, "actual_entry", entry.id, "auxiliary", input.auxiliaryLabelIds);

    const plannedItem = input.plannedItemId === undefined
      ? undefined
      : state.planned_items.find((item) => item.id === input.plannedItemId);
    const remainingPlannedAmount = plannedItem === undefined
      ? null
      : plannedItem.amount - getLinkedActuals(state, plannedItem.id).reduce((sum, row) => sum + row.amount, 0);

    if (plannedItem !== undefined && remainingPlannedAmount !== null && remainingPlannedAmount > 0 && input.keepRemainingPlanned === false) {
      plannedItem.status = "completed";
    }

    return { remainingPlannedAmount };
  });
}

export function updateStaticActualEntry(actualEntryId: number, input: ParsedUpdateActualEntryRequest) {
  return mutateStaticDemoState((state) => {
    requireCategoryForFund(state, input.fundId, input.categoryId);
    const entry = state.actual_entries.find((row) => row.id === actualEntryId);
    if (entry === undefined) {
      throw new Error("Actual entry not found");
    }

    entry.fund_id = input.fundId;
    entry.category_id = input.categoryId;
    entry.actual_date = input.actualDate;
    entry.description = input.description;
    entry.amount = input.amount;
    entry.notes = input.notes;
    replaceStaticAssignments(state, "actual_entry", entry.id, "auxiliary", input.auxiliaryLabelIds);

    if (entry.planned_item_id !== null) {
      const plannedItem = state.planned_items.find((item) => item.id === entry.planned_item_id);
      if (plannedItem !== undefined) {
        plannedItem.fund_id = input.fundId;
        plannedItem.category_id = input.categoryId;
      }
    }

    return { success: true };
  });
}

export function cancelStaticActualEntry(actualEntryId: number) {
  return mutateStaticDemoState((state) => {
    const originalLength = state.actual_entries.length;
    state.actual_entries = state.actual_entries.filter((entry) => entry.id !== actualEntryId);

    if (state.actual_entries.length === originalLength) {
      throw new Error("Actual entry not found");
    }

    state.classification_assignments = state.classification_assignments.filter(
      (assignment) => assignment.target_type !== "actual_entry" || assignment.target_id !== actualEntryId,
    );

    return { success: true };
  });
}

export function createStaticClassification(input: ParsedCreateClassificationRequest) {
  return mutateStaticDemoState((state) => {
    const id = nextId(state.classification_tags);
    state.classification_tags.push({ id, ...input });
    return { id };
  });
}

export function updateStaticClassification(
  tagId: number,
  input: ParsedUpdateClassificationRequest,
) {
  return mutateStaticDemoState((state) => {
    const tag = state.classification_tags.find((row) => row.id === tagId);
    if (tag === undefined) {
      throw new Error("Classification not found");
    }

    tag.name = input.name;
    tag.color = input.color;
    return { success: true };
  });
}

export function deleteStaticClassification(tagId: number) {
  return mutateStaticDemoState((state) => {
    const originalLength = state.classification_tags.length;
    state.classification_tags = state.classification_tags.filter((tag) => tag.id !== tagId);
    if (state.classification_tags.length === originalLength) {
      throw new Error("Classification not found");
    }

    state.classification_assignments = state.classification_assignments.filter(
      (assignment) => assignment.tag_id !== tagId,
    );
    return { success: true };
  });
}

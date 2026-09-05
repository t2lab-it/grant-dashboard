import type { CrossAggregateCategory } from "../../src/contracts/crossAggregateCategory";

export type FundSeed = {
  id: number;
  fund_code: string;
  name: string;
  fiscal_year: number;
  awarded_amount: number;
  notes: string;
  display_order: number;
};

export type CategorySeed = {
  id: number;
  fund_id: number;
  category_code: string;
  name: string;
  cross_aggregate_category: CrossAggregateCategory;
  display_order: number;
};

export type BudgetLineSeed = {
  id: number;
  fund_id: number;
  category_id: number;
  amount: number | null;
  notes: string;
};

export type PlannedItemSeed = {
  id: number;
  fund_id: number;
  category_id: number;
  planned_ref: string;
  planned_date: string;
  scheduled_month: string;
  description: string;
  amount: number;
  status: string;
  notes: string;
};

export type ActualEntrySeed = {
  id: number;
  fund_id: number;
  category_id: number;
  planned_item_id: number | null;
  actual_date: string;
  description: string;
  amount: number;
  notes: string;
};

export type ClassificationTagSeed = {
  id: number;
  kind: "project" | "auxiliary";
  name: string;
  color: string;
};

export type ClassificationAssignmentSeed = {
  tag_id: number;
  target_type: "fund" | "planned_item" | "actual_entry";
  target_id: number;
};

export type SeedProfileData = {
  funds: FundSeed[];
  categories: CategorySeed[];
  budget_lines: BudgetLineSeed[];
  planned_items: PlannedItemSeed[];
  actual_entries: ActualEntrySeed[];
  classification_tags: ClassificationTagSeed[];
  classification_assignments: ClassificationAssignmentSeed[];
};

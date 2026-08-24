import type { CrossAggregateCategory } from "../../contracts/crossAggregateCategory";

export type FundDetailAmountDisplayMode = "grouped-yen" | "plain-yen" | "thousand-yen";

export type FundDetailResponse = {
  fund: {
    id: number;
    name: string;
    fiscalYear: number;
    awarded_amount: number;
    notes: string;
    projectTags: Array<{ id: number; kind: "project"; name: string; color: string }>;
    auxiliaryLabels: Array<{ id: number; kind: "auxiliary"; name: string; color: string }>;
  };
  categories: Array<{
    id: number;
    categoryCode: string;
    categoryName: string;
    crossAggregateCategory: CrossAggregateCategory;
    budgetAmount: number | null;
    plannedAmount: number;
    actualAmount: number;
  }>;
  crossAggregateCategories: Array<{
    crossAggregateCategory: CrossAggregateCategory;
    budgetAmount: number | null;
    plannedAmount: number;
    actualAmount: number;
  }>;
  monthlyStatus: Array<{
    month: string;
    plannedAmount: number;
    actualAmount: number;
    totalAmount: number;
  }>;
  actualEntries: Array<{
    id: number;
    actualDate: string;
    categoryId: number;
    categoryCode: string;
    categoryName: string;
    description: string;
    amount: number;
    remainingAmount: number;
    status: "completed" | "cancelled";
    notes: string;
    auxiliaryLabels: Array<{ id: number; kind: "auxiliary"; name: string; color: string }>;
  }>;
  plannedItems: Array<{
    id: number;
    plannedDate: string;
    scheduledMonth: string;
    categoryId: number;
    categoryCode: string;
    categoryName: string;
    description: string;
    amount: number;
    notes: string;
    auxiliaryLabels: Array<{ id: number; kind: "auxiliary"; name: string; color: string }>;
  }>;
  plannedItemHistory: Array<{
    id: number;
    plannedDate: string;
    scheduledMonth: string;
    categoryId: number;
    categoryCode: string;
    categoryName: string;
    description: string;
    amount: number;
    remainingAmount: number;
    status: "completed" | "cancelled";
    notes: string;
    auxiliaryLabels: Array<{ id: number; kind: "auxiliary"; name: string; color: string }>;
  }>;
};

export type PlannedItem = FundDetailResponse["plannedItems"][number];
export type PlannedItemHistory = FundDetailResponse["plannedItemHistory"][number];
export type ActualEntry = FundDetailResponse["actualEntries"][number];

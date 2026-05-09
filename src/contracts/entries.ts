export type OverviewFundOption = {
  id: number;
  name: string;
};

export type OverviewFundOptionsResponse = {
  funds: OverviewFundOption[];
};

export type FundCategoryOption = {
  id: number;
  categoryName: string;
};

export type PlannedItemOption = {
  id: number;
  categoryId: number;
  description: string;
};

export type FundEntryOptionsResponse = {
  fund?: OverviewFundOption;
  categories: FundCategoryOption[];
  plannedItems: PlannedItemOption[];
};

export type CreatePlannedItemRequest = {
  fundId: number;
  categoryId: number;
  plannedDate: string;
  scheduledMonth: string;
  description: string;
  amount: number;
  notes: string;
  auxiliaryLabelIds?: number[];
};

export type CreatePlannedItemResponse = {
  warnings: string[];
};

export type CreateBulkPlannedItemsRequest = {
  fundId: number;
  categoryId: number;
  plannedDate: string;
  notes: string;
  auxiliaryLabelIds?: number[];
  items: Array<{
    scheduledMonth: string;
    description: string;
    amount: number;
  }>;
};

export type CreateBulkPlannedItemsResponse = {
  createdCount: number;
  warnings: string[];
};

export type CreateActualEntryRequest = {
  fundId: number;
  categoryId: number;
  plannedItemId?: number;
  actualDate: string;
  description: string;
  amount: number;
  notes: string;
  auxiliaryLabelIds?: number[];
};

export type CreateActualEntryResponse = {
  remainingPlannedAmount: number | null;
};

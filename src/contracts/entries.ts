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

export type { CreateActualEntryRequest, CreateBulkPlannedItemsRequest, CreatePlannedItemRequest } from "./requestSchemas";

export type CreatePlannedItemResponse = {
  warnings: string[];
};

export type CreateBulkPlannedItemsResponse = {
  createdCount: number;
  warnings: string[];
};

export type CreateActualEntryResponse = {
  remainingPlannedAmount: number | null;
};

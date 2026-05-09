export const fundDetailSectionKeys = [
  "categories",
  "timeline",
  "actualEntries",
  "plannedItems",
] as const;

export type FundDetailSectionKey = (typeof fundDetailSectionKeys)[number];

export const defaultFundDetailSectionOrder: FundDetailSectionKey[] = [...fundDetailSectionKeys];

export const fundDetailSectionLabels: Record<FundDetailSectionKey, string> = {
  categories: "費目別の状況",
  timeline: "月別の状況",
  actualEntries: "精算項目一覧",
  plannedItems: "計画項目一覧",
};

export function moveFundDetailSection(
  order: FundDetailSectionKey[],
  sectionKey: FundDetailSectionKey,
  direction: "up" | "down",
) {
  const currentIndex = order.indexOf(sectionKey);

  if (currentIndex < 0) {
    return order;
  }

  const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (nextIndex < 0 || nextIndex >= order.length) {
    return order;
  }

  const nextOrder = [...order];
  [nextOrder[currentIndex], nextOrder[nextIndex]] = [nextOrder[nextIndex], nextOrder[currentIndex]];
  return nextOrder;
}

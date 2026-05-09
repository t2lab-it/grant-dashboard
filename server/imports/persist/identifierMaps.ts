function categoryKey(fundCode: string, categoryCode: string) {
  return `${fundCode}\u0000${categoryCode}`;
}

export function createDraftIdentifierMaps() {
  return {
    fundIdByCode: new Map<string, number>(),
    categoryIdByCode: new Map<string, number>(),
    plannedItemIdByRef: new Map<string, number>(),
  };
}

export function setCategoryId(
  categoryIdByCode: Map<string, number>,
  fundCode: string,
  categoryCode: string,
  categoryId: number,
) {
  categoryIdByCode.set(categoryKey(fundCode, categoryCode), categoryId);
}

export function resolveFundId(fundIdByCode: Map<string, number>, fundCode: string, label: string) {
  const fundId = fundIdByCode.get(fundCode);
  if (!fundId) {
    throw new Error(`Unable to resolve fund mapping for ${label} ${fundCode}`);
  }

  return fundId;
}

export function resolveCategoryId(
  categoryIdByCode: Map<string, number>,
  fundCode: string,
  categoryCode: string,
  label: string,
) {
  const categoryId = categoryIdByCode.get(categoryKey(fundCode, categoryCode));
  if (!categoryId) {
    throw new Error(`Unable to resolve category mapping for ${label} ${fundCode}/${categoryCode}`);
  }

  return categoryId;
}

export function resolvePlannedItemId(
  plannedItemIdByRef: Map<string, number>,
  plannedRef: string,
) {
  const plannedItemId = plannedItemIdByRef.get(plannedRef) ?? null;
  if (plannedItemId === null) {
    throw new Error(`Unable to resolve planned_ref mapping for actual entry ${plannedRef}`);
  }

  return plannedItemId;
}

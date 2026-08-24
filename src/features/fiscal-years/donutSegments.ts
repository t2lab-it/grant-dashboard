export type DonutSegment<T> = {
  item: T;
  offsetPercentage: number;
  percentage: number;
};

export function buildDonutSegments<T>(
  items: T[],
  getPercentage: (item: T) => number | null,
): DonutSegment<T>[] {
  const segments: DonutSegment<T>[] = [];
  let offsetPercentage = 0;

  for (const item of items) {
    const sourcePercentage = getPercentage(item) ?? 0;
    const percentage = Math.min(Math.max(sourcePercentage, 0), Math.max(100 - offsetPercentage, 0));
    if (percentage <= 0) continue;

    segments.push({ item, offsetPercentage, percentage });
    offsetPercentage += percentage;
  }

  return segments;
}

import { describe, expect, it } from "vitest";
import { buildDonutSegments } from "../../src/features/fiscal-years/donutSegments";

type Item = {
  id: number;
  percentage: number | null;
};

describe("donut segments", () => {
  it("omits non-positive values from drawable chart segments", () => {
    const items: Item[] = [
      { id: 1, percentage: 60 },
      { id: 2, percentage: 0 },
      { id: 3, percentage: -20 },
      { id: 4, percentage: null },
    ];

    expect(buildDonutSegments(items, (item) => item.percentage)).toEqual([
      { item: items[0], offsetPercentage: 0, percentage: 60 },
    ]);
  });

  it("caps accumulated geometry at one full circle", () => {
    const items: Item[] = [
      { id: 1, percentage: 70 },
      { id: 2, percentage: 50 },
      { id: 3, percentage: 10 },
    ];

    expect(buildDonutSegments(items, (item) => item.percentage)).toEqual([
      { item: items[0], offsetPercentage: 0, percentage: 70 },
      { item: items[1], offsetPercentage: 70, percentage: 30 },
    ]);
  });
});

import { describe, expect, it } from "vitest";
import {
  actualEntrySchema,
  classificationSchema,
  fundCreationSchema,
  plannedItemSchema,
  plannedItemsBulkSchema,
} from "../../src/contracts/requestSchemas";

const plannedItem = {
  fundId: 1,
  categoryId: 2,
  plannedDate: "2026-07-12",
  scheduledMonth: "2026-08",
  description: "消耗品",
  amount: 1000,
  notes: "",
};

describe("shared request schemas", () => {
  it("applies optional classification and settlement defaults", () => {
    expect(plannedItemSchema.parse(plannedItem).auxiliaryLabelIds).toEqual([]);
    expect(actualEntrySchema.parse({
      fundId: 1,
      categoryId: 2,
      actualDate: "2026-07-12",
      description: "消耗品",
      amount: 1000,
      notes: "",
    })).toMatchObject({ auxiliaryLabelIds: [], keepRemainingPlanned: true });
  });

  it("rejects invalid calendar values and unsafe amounts", () => {
    expect(plannedItemSchema.safeParse({ ...plannedItem, plannedDate: "2026-02-30" }).success).toBe(false);
    expect(plannedItemSchema.safeParse({ ...plannedItem, scheduledMonth: "2026-13" }).success).toBe(false);
    expect(plannedItemSchema.safeParse({ ...plannedItem, amount: Number.MAX_SAFE_INTEGER + 1 }).success).toBe(false);
  });

  it("rejects extra entry fields and empty bulk requests", () => {
    expect(plannedItemSchema.safeParse({ ...plannedItem, unexpected: true }).success).toBe(false);
    expect(plannedItemsBulkSchema.safeParse({
      fundId: 1, categoryId: 2, plannedDate: "2026-07-12", notes: "", items: [],
    }).success).toBe(false);
  });

  it("validates classification colors and fund category codes", () => {
    expect(classificationSchema.safeParse({ kind: "project", name: "研究", color: "red" }).success).toBe(false);
    expect(fundCreationSchema.safeParse({
      name: "科研費", fiscalYear: 2026, awardedAmount: 1000, notes: "",
      categories: [{ name: "物品費", amount: 1000, crossAggregateCategory: "invalid" }],
    }).success).toBe(false);
  });
});

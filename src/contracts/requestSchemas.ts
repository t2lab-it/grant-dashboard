import { z } from "zod";
import { CROSS_AGGREGATE_CATEGORY_CODES } from "./crossAggregateCategory";

function createIsoDateSchema(label: string) {
  return z.string().superRefine((value, ctx) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label}は YYYY-MM-DD 形式で入力してください。`, params: { friendlyMessage: true } });
      return;
    }
    const [yearText, monthText, dayText] = value.split("-");
    const [year, month, day] = [Number(yearText), Number(monthText), Number(dayText)];
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() + 1 !== month || parsed.getUTCDate() !== day) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label}は実在する日付で入力してください。`, params: { friendlyMessage: true } });
    }
  });
}

function createYearMonthSchema(label: string) {
  return z.string().superRefine((value, ctx) => {
    if (!/^\d{4}-\d{2}$/.test(value)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label}は YYYY-MM 形式で入力してください。`, params: { friendlyMessage: true } });
      return;
    }
    const month = Number(value.split("-")[1]);
    if (month < 1 || month > 12) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label}は YYYY-MM 形式で入力してください。`, params: { friendlyMessage: true } });
    }
  });
}

const plannedDateSchema = createIsoDateSchema("立案日");
const actualDateSchema = createIsoDateSchema("実績日");
const scheduledMonthSchema = createYearMonthSchema("予定月");
const classificationIdListSchema = z.array(z.number().int().positive()).default([]);
const positiveAmountSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const fundCategoryBaseSchema = z.object({
  name: z.string().trim().min(1),
  amount: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  crossAggregateCategory: z.enum(CROSS_AGGREGATE_CATEGORY_CODES),
});

export const classificationKindSchema = z.enum(["project", "auxiliary"]);
export const classificationSchema = z.object({
  kind: classificationKindSchema,
  name: z.string().trim().min(1),
  color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/),
}).strict();
export const classificationUpdateSchema = classificationSchema.omit({ kind: true });

export const plannedItemSchema = z.object({
  fundId: z.number().int(), categoryId: z.number().int(), plannedDate: plannedDateSchema,
  scheduledMonth: scheduledMonthSchema, description: z.string().min(1), amount: positiveAmountSchema,
  notes: z.string(), auxiliaryLabelIds: classificationIdListSchema,
}).strict();
export const plannedItemsBulkSchema = z.object({
  fundId: z.number().int(), categoryId: z.number().int(), plannedDate: plannedDateSchema,
  notes: z.string(), auxiliaryLabelIds: classificationIdListSchema,
  items: z.array(plannedItemSchema.pick({ scheduledMonth: true, description: true, amount: true })).min(1),
}).strict();
export const plannedItemEditSchema = plannedItemSchema.omit({ plannedDate: true });

export const actualEntrySchema = z.object({
  fundId: z.number().int(), categoryId: z.number().int(), plannedItemId: z.number().int().optional(),
  actualDate: actualDateSchema, description: z.string().min(1), amount: positiveAmountSchema,
  notes: z.string(), auxiliaryLabelIds: classificationIdListSchema, keepRemainingPlanned: z.boolean().default(true),
}).strict();
export const actualEntryEditSchema = actualEntrySchema.omit({ plannedItemId: true, keepRemainingPlanned: true });

export const fundCreationSchema = z.object({
  name: z.string().trim().min(1), fiscalYear: z.number().int().positive(), awardedAmount: positiveAmountSchema,
  notes: z.string(), projectTagIds: classificationIdListSchema, auxiliaryLabelIds: classificationIdListSchema,
  categories: z.array(fundCategoryBaseSchema).min(1),
});
export const fundUpdateSchema = fundCreationSchema.extend({
  categories: z.array(fundCategoryBaseSchema.extend({ id: z.number().int().positive().optional() })).min(1),
});

export type CreateClassificationRequest = z.input<typeof classificationSchema>;
export type UpdateClassificationRequest = z.input<typeof classificationUpdateSchema>;
export type CreatePlannedItemRequest = z.input<typeof plannedItemSchema>;
export type CreateBulkPlannedItemsRequest = z.input<typeof plannedItemsBulkSchema>;
export type UpdatePlannedItemRequest = z.input<typeof plannedItemEditSchema>;
export type CreateActualEntryRequest = z.input<typeof actualEntrySchema>;
export type UpdateActualEntryRequest = z.input<typeof actualEntryEditSchema>;
export type CreateFundRequest = z.input<typeof fundCreationSchema>;
export type UpdateFundRequest = z.input<typeof fundUpdateSchema>;
export type ParsedCreateClassificationRequest = z.output<typeof classificationSchema>;
export type ParsedUpdateClassificationRequest = z.output<typeof classificationUpdateSchema>;
export type ParsedCreatePlannedItemRequest = z.output<typeof plannedItemSchema>;
export type ParsedCreateBulkPlannedItemsRequest = z.output<typeof plannedItemsBulkSchema>;
export type ParsedUpdatePlannedItemRequest = z.output<typeof plannedItemEditSchema>;
export type ParsedCreateActualEntryRequest = z.output<typeof actualEntrySchema>;
export type ParsedUpdateActualEntryRequest = z.output<typeof actualEntryEditSchema>;
export type ParsedCreateFundRequest = z.output<typeof fundCreationSchema>;
export type ParsedUpdateFundRequest = z.output<typeof fundUpdateSchema>;

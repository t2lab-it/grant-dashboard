import { z } from "zod";
import { CROSS_AGGREGATE_CATEGORY_CODES } from "../src/contracts/crossAggregateCategory";

function createIsoDateSchema(label: string) {
  return z.string().superRefine((value, ctx) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${label}は YYYY-MM-DD 形式で入力してください。`,
        params: { friendlyMessage: true },
      });
      return;
    }

    const [yearText, monthText, dayText] = value.split("-");
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const parsed = new Date(Date.UTC(year, month - 1, day));

    if (
      parsed.getUTCFullYear() !== year ||
      parsed.getUTCMonth() + 1 !== month ||
      parsed.getUTCDate() !== day
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${label}は実在する日付で入力してください。`,
        params: { friendlyMessage: true },
      });
    }
  });
}

function createYearMonthSchema(label: string) {
  return z.string().superRefine((value, ctx) => {
    if (!/^\d{4}-\d{2}$/.test(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${label}は YYYY-MM 形式で入力してください。`,
        params: { friendlyMessage: true },
      });
      return;
    }

    const [, monthText] = value.split("-");
    const month = Number(monthText);
    if (month < 1 || month > 12) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${label}は YYYY-MM 形式で入力してください。`,
        params: { friendlyMessage: true },
      });
    }
  });
}

const plannedDateSchema = createIsoDateSchema("立案日");
const actualDateSchema = createIsoDateSchema("実績日");
const scheduledMonthSchema = createYearMonthSchema("予定月");
const classificationIdListSchema = z.array(z.number().int().positive()).default([]);
const crossAggregateCategorySchema = z.enum(CROSS_AGGREGATE_CATEGORY_CODES);
const positiveAmountSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const nonnegativeAmountSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const fundCategoryBaseSchema = z.object({
  name: z.string().trim().min(1),
  amount: nonnegativeAmountSchema,
  crossAggregateCategory: crossAggregateCategorySchema,
});

export const classificationKindSchema = z.enum(["project", "auxiliary"]);
export const classificationSchema = z
  .object({
    kind: classificationKindSchema,
    name: z.string().trim().min(1),
    color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/),
  })
  .strict();

export const classificationUpdateSchema = z
  .object({
    name: z.string().trim().min(1),
    color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/),
  })
  .strict();

export const plannedItemSchema = z
  .object({
    fundId: z.number().int(),
    categoryId: z.number().int(),
    plannedDate: plannedDateSchema,
    scheduledMonth: scheduledMonthSchema,
    description: z.string().min(1),
    amount: positiveAmountSchema,
    notes: z.string(),
    auxiliaryLabelIds: classificationIdListSchema,
  })
  .strict();

export const plannedItemsBulkSchema = z
  .object({
    fundId: z.number().int(),
    categoryId: z.number().int(),
    plannedDate: plannedDateSchema,
    notes: z.string(),
    auxiliaryLabelIds: classificationIdListSchema,
    items: z
      .array(
        z
          .object({
            scheduledMonth: scheduledMonthSchema,
            description: z.string().min(1),
            amount: positiveAmountSchema,
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

export const plannedItemEditSchema = z
  .object({
    fundId: z.number().int(),
    categoryId: z.number().int(),
    scheduledMonth: scheduledMonthSchema,
    description: z.string().min(1),
    amount: positiveAmountSchema,
    notes: z.string(),
    auxiliaryLabelIds: classificationIdListSchema,
  })
  .strict();

export const actualEntrySchema = z
  .object({
    fundId: z.number().int(),
    categoryId: z.number().int(),
    plannedItemId: z.number().int().optional(),
    actualDate: actualDateSchema,
    description: z.string().min(1),
    amount: positiveAmountSchema,
    notes: z.string(),
    auxiliaryLabelIds: classificationIdListSchema,
  })
  .strict();

export const actualEntryEditSchema = z
  .object({
    fundId: z.number().int(),
    categoryId: z.number().int(),
    actualDate: actualDateSchema,
    description: z.string().min(1),
    amount: positiveAmountSchema,
    notes: z.string(),
    auxiliaryLabelIds: classificationIdListSchema,
  })
  .strict();

export const fundCreationSchema = z.object({
  name: z.string().trim().min(1),
  fiscalYear: z.number().int().positive(),
  awardedAmount: positiveAmountSchema,
  notes: z.string(),
  projectTagIds: classificationIdListSchema,
  auxiliaryLabelIds: classificationIdListSchema,
  categories: z
    .array(fundCategoryBaseSchema)
    .min(1),
});

export const fundUpdateSchema = z.object({
  name: z.string().trim().min(1),
  fiscalYear: z.number().int().positive(),
  awardedAmount: positiveAmountSchema,
  notes: z.string(),
  projectTagIds: classificationIdListSchema,
  auxiliaryLabelIds: classificationIdListSchema,
  categories: z
    .array(fundCategoryBaseSchema.extend({ id: z.number().int().positive().optional() }))
    .min(1),
});

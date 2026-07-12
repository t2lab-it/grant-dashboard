export const TOKYO_TIME_ZONE = "Asia/Tokyo";

export type CalendarDateParts = {
  year: number;
  month: number;
  day: number;
};

const tokyoDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TOKYO_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function getTokyoCalendarDate(date: Date): CalendarDateParts {
  const parts = Object.fromEntries(
    tokyoDateFormatter
      .formatToParts(date)
      .filter((part) => part.type === "year" || part.type === "month" || part.type === "day")
      .map((part) => [part.type, Number(part.value)]),
  ) as Record<keyof CalendarDateParts, number>;

  return { year: parts.year, month: parts.month, day: parts.day };
}

export function formatTokyoMonthKey(date: Date) {
  const { year, month } = getTokyoCalendarDate(date);
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function formatTokyoDateKey(date: Date) {
  const { day } = getTokyoCalendarDate(date);
  return `${formatTokyoMonthKey(date)}-${String(day).padStart(2, "0")}`;
}

export function inferJapaneseFiscalYear(date: Date) {
  const { year, month } = getTokyoCalendarDate(date);
  return month >= 4 ? year : year - 1;
}

export function listFiscalYearMonths(fiscalYear: number) {
  return Array.from({ length: 12 }, (_, index) => {
    const fiscalMonth = index + 4;
    const year = fiscalMonth <= 12 ? fiscalYear : fiscalYear + 1;
    const month = fiscalMonth <= 12 ? fiscalMonth : fiscalMonth - 12;
    return `${year}-${String(month).padStart(2, "0")}`;
  });
}

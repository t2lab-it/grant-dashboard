export type AmountDisplayMode = "grouped-yen" | "plain-yen" | "thousand-yen";

export function formatAmount(value: number, mode: AmountDisplayMode) {
  if (mode === "plain-yen") {
    return `${value}円`;
  }

  if (mode === "thousand-yen") {
    return `${Math.round(value / 1000)}千円`;
  }

  return `${new Intl.NumberFormat("ja-JP").format(value)}円`;
}

export function formatYen(value: number) {
  return formatAmount(value, "grouped-yen");
}

export function formatLocalDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

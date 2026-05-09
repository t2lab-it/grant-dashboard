const CODE_PATTERN = /^[A-Za-z0-9_-]+$/;

export function normalizeCell(value: unknown) {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value).trim();
}

export function assertCode(value: string, label: string, sheetName: string, rowNumber: number) {
  if (!value) {
    throw new Error(`Missing required value for ${label} at ${sheetName}:${rowNumber}`);
  }

  if (!CODE_PATTERN.test(value)) {
    throw new Error(`Invalid ${label} at ${sheetName}:${rowNumber}: ${value}`);
  }

  return value;
}

export function assertRequiredText(
  value: string,
  label: string,
  sheetName: string,
  rowNumber: number,
) {
  if (!value) {
    throw new Error(`Missing required value for ${label} at ${sheetName}:${rowNumber}`);
  }

  return value;
}

export function parseInteger(
  value: string,
  label: string,
  sheetName: string,
  rowNumber: number,
) {
  if (!/^-?\d+$/.test(value)) {
    throw new Error(`Invalid integer for ${label} at ${sheetName}:${rowNumber}: ${value}`);
  }

  return Number.parseInt(value, 10);
}

export function parseDate(value: string, label: string, sheetName: string, rowNumber: number) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid date for ${label} at ${sheetName}:${rowNumber}: ${value}`);
  }

  const [year, month, day] = value.split("-").map((part) => Number.parseInt(part, 10));
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`Invalid date for ${label} at ${sheetName}:${rowNumber}: ${value}`);
  }

  return value;
}

export function parseMonth(value: string, label: string, sheetName: string, rowNumber: number) {
  if (!/^\d{4}-\d{2}$/.test(value)) {
    throw new Error(`Invalid month for ${label} at ${sheetName}:${rowNumber}: ${value}`);
  }

  const [year, month] = value.split("-").map((part) => Number.parseInt(part, 10));
  if (month < 1 || month > 12) {
    throw new Error(`Invalid month for ${label} at ${sheetName}:${rowNumber}: ${value}`);
  }

  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}`;
}

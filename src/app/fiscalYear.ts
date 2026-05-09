export type FiscalYearOverviewFields = {
  availableFiscalYears: number[];
  selectedFiscalYear: number | null;
};

export function parseFiscalYearParam(value: string | null) {
  if (value === null) {
    return undefined;
  }

  const fiscalYear = Number(value);
  return Number.isInteger(fiscalYear) && fiscalYear > 0 ? fiscalYear : undefined;
}

export function getFiscalYearFromSearch(search: string) {
  return parseFiscalYearParam(new URLSearchParams(search).get("year"));
}

export function buildOverviewApiPath(fiscalYear: number | undefined) {
  return fiscalYear === undefined ? "/api/overview" : `/api/overview?year=${fiscalYear}`;
}

export function setFiscalYearInSearch(search: string, fiscalYear: number) {
  const params = new URLSearchParams(search);
  params.set("year", String(fiscalYear));
  const nextSearch = params.toString();
  return nextSearch ? `?${nextSearch}` : "";
}

export function buildPathWithFiscalYear(pathname: string, search: string, fiscalYear: number) {
  return `${pathname}${setFiscalYearInSearch(search, fiscalYear)}`;
}

export function isListLikeFiscalYearPath(pathname: string) {
  return (
    pathname === "/" ||
    pathname === "/imports" ||
    pathname.startsWith("/imports/") ||
    pathname === "/search" ||
    pathname === "/settings"
  );
}

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { HeaderAlertCategory, HeaderAlertDetail, HeaderAlertsResponse } from "../contracts/headerAlerts";
import { apiGet } from "../lib/api";
import { formatRatePercentage } from "../lib/executionRate";
import { formatAmount } from "../lib/format";

function getHeaderAlertSummary(categories: HeaderAlertCategory[]) {
  return categories.length === 0
    ? "問題なし"
    : categories.map((category) => `${category.label} ${category.count}`).join(" / ");
}

function getHeaderAlertTone(categories: HeaderAlertCategory[]) {
  if (categories.some((category) => category.severity === "danger")) return "danger";
  return categories.length > 0 ? "warning" : "clear";
}

function getHeaderAlertDetails(item: HeaderAlertCategory["items"][number]): HeaderAlertDetail[] {
  if (item.details !== undefined) return item.details;
  return item.yearEndRisks?.map((risk) => ({
    id: risk.kind,
    label: risk.label,
    labelTone: risk.kind,
    amount: risk.amount,
    ...(risk.rate === undefined ? {} : { rate: risk.rate }),
  })) ?? [];
}

function HeaderAlertGroupedDetails({ details }: { details: HeaderAlertDetail[] }) {
  const hasTitle = details.some((detail) => detail.title !== undefined);
  return (
    <span className={`app-alert-grouped-details${hasTitle ? " app-alert-grouped-details-with-title" : ""}`}>
      {details.map((detail) => (
        <span key={detail.id} className="app-alert-grouped-detail">
          <span className={`app-alert-grouped-badge ${detail.labelTone ?? "default"}`}>{detail.label}</span>
          {hasTitle ? <span className="app-alert-grouped-title">{detail.title ?? ""}</span> : null}
          <span className="app-alert-grouped-value">{formatAmount(detail.amount, "grouped-yen")}</span>
          <span className="app-alert-grouped-rate">
            {detail.rate === undefined ? null : `(${formatRatePercentage(detail.rate)})`}
          </span>
        </span>
      ))}
    </span>
  );
}

function HeaderAlertCategorySection({ category }: { category: HeaderAlertCategory }) {
  return (
    <section className="app-alert-panel-section">
      <h3>{`${category.label} ${category.count}`}</h3>
      {category.description === undefined ? null : <p className="app-alert-category-description">{category.description}</p>}
      <ul className="app-alert-detail-list">
        {category.items.map((item) => {
          const details = getHeaderAlertDetails(item);
          return (
            <li key={item.id}>
              <Link to={item.href} aria-label={item.title}>
                <span className="app-alert-detail-main">
                  <strong>{item.title}</strong>
                  {item.description === undefined ? null : <span>{item.description}</span>}
                  {details.length === 0 ? null : <HeaderAlertGroupedDetails details={details} />}
                </span>
                {item.amount === undefined ? null : <span className="app-alert-detail-amount">{formatAmount(item.amount, "grouped-yen")}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function HeaderAlerts({ selectedFiscalYear }: { selectedFiscalYear: number | null }) {
  const [isOpen, setIsOpen] = useState(false);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const { data } = useQuery({
    queryKey: ["header-alerts", selectedFiscalYear],
    queryFn: () => apiGet<HeaderAlertsResponse>(`/api/header-alerts?year=${selectedFiscalYear ?? 0}`),
    enabled: selectedFiscalYear !== null,
  });
  const primary = data?.primary ?? [];
  const supporting = data?.supporting ?? [];
  const isLoaded = data !== undefined;
  const panelId = "app-header-alert-panel";

  useEffect(() => setIsOpen(false), [selectedFiscalYear]);
  useEffect(() => {
    if (!isOpen) return;
    function handlePointerDown(event: PointerEvent) {
      const strip = stripRef.current;
      if (strip !== null && event.target instanceof Node && !strip.contains(event.target)) setIsOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isOpen]);

  if (selectedFiscalYear === null) return null;
  return (
    <div className="app-alert-strip" ref={stripRef}>
      <button type="button" className={`app-alert-bar app-alert-bar-${isLoaded ? getHeaderAlertTone(primary) : "clear"}`} aria-controls={panelId} aria-expanded={isOpen} disabled={!isLoaded} onClick={() => setIsOpen((current) => !current)}>
        {isLoaded ? getHeaderAlertSummary(primary) : "確認中"}
      </button>
      {isOpen ? (
        <div id={panelId} className="app-alert-panel" role="region" aria-label="アラート詳細">
          {primary.length === 0 ? <p className="app-alert-empty">現在の年度で確認が必要な主要アラートはありません。</p> : primary.map((category) => <HeaderAlertCategorySection key={category.key} category={category} />)}
          {supporting.length > 0 ? (
            <section className="app-alert-panel-supporting">
              <h3>補助項目</h3>
              {supporting.map((category) => <HeaderAlertCategorySection key={category.key} category={category} />)}
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

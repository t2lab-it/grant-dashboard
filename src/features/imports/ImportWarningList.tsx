import type { ImportWarning } from "../../contracts/imports";

const warningLabels: Record<string, string> = {
  unlinked_actual_entry: "予定と未連携の実績",
  negative_planned_adjustment: "予定額の負の調整",
  null_budget_amount: "予算額が未設定",
};

export function ImportWarningList({ warnings }: { warnings: ImportWarning[] }) {
  return <ul className="import-warning-list">{warnings.map((warning, index) => (
    <li key={`${warning.sheet_name}:${warning.row_number}:${warning.code}:${index}`}>
      <span className="import-warning-location">{warning.sheet_name} · {warning.row_number}行目</span>
      <strong>{warningLabels[warning.code] ?? warning.message}</strong>
      <details><summary>診断の詳細</summary><code>{warning.code}</code><p>{warning.message}</p></details>
    </li>
  ))}</ul>;
}

import { useEffect, useState } from "react";
import { ModalShell } from "../../app/ModalShell";
import { apiGet, apiMutateJson } from "../../lib/api";
import { useWorkbookExportStatus } from "./WorkbookExportStatus";

type WorkbookChangeRow = {
  action: "added" | "updated" | "removed";
  key: string;
  label: string;
  fields: string[];
};

type WorkbookSheetDiff = {
  added: number;
  updated: number;
  removed: number;
  rows: WorkbookChangeRow[];
  more_count: number;
};

type WorkbookSheetName =
  | "funds"
  | "categories"
  | "budget_lines"
  | "planned_items"
  | "actual_entries";

type WorkbookExportPreview = {
  available: boolean;
  workbook_path: string;
  source_filename: string;
  imported_at: string;
  exported_at?: string;
  reason?: string;
  message?: string;
  changes: Record<WorkbookSheetName, WorkbookSheetDiff>;
};

const SHEET_LABELS: Record<WorkbookSheetName, string> = {
  funds: "予算",
  categories: "費目",
  budget_lines: "予算行",
  planned_items: "予定",
  actual_entries: "実績",
};

const CHANGE_ACTION_LABELS: Record<WorkbookChangeRow["action"], string> = {
  added: "追加",
  updated: "更新",
  removed: "削除",
};

const CHANGE_FIELD_LABELS: Record<string, string> = {
  fund_code: "予算コード",
  category_code: "費目コード",
  name: "名称",
  fiscal_year: "年度",
  awarded_amount: "交付額",
  amount: "金額",
  planned_ref: "予定参照",
  planned_date: "立案日",
  scheduled_month: "執行予定月",
  actual_date: "実績日",
  description: "内容",
  status: "状態",
  notes: "メモ",
  project_tags: "研究プロジェクトタグ",
  auxiliary_labels: "補助ラベル",
  display_order: "表示順",
  cross_aggregate_category: "横断集計カテゴリ",
};

function formatChangedFields(fields: string[]) {
  return fields.map((field) => CHANGE_FIELD_LABELS[field] ?? field).join(", ");
}

export function WorkbookExportControl() {
  const { setStatus } = useWorkbookExportStatus();
  const [previewAttempt, setPreviewAttempt] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [preview, setPreview] = useState<WorkbookExportPreview | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [dialogError, setDialogError] = useState("");

  useEffect(() => {
    function openFromTutorial() {
      setStatus(null);
      setIsOpen(true);
    }

    function closeFromTutorial() {
      setIsOpen(false);
    }

    window.addEventListener("budget-dashboard:open-workbook-export", openFromTutorial);
    window.addEventListener("budget-dashboard:close-workbook-export", closeFromTutorial);
    return () => {
      window.removeEventListener("budget-dashboard:open-workbook-export", openFromTutorial);
      window.removeEventListener("budget-dashboard:close-workbook-export", closeFromTutorial);
    };
  }, [setStatus]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let cancelled = false;
    setPreview(null);
    setDialogError("");
    setIsPreviewLoading(true);

    void (async () => {
      try {
        const payload = await apiGet<WorkbookExportPreview>("/api/exports/workbook/preview");

        if (!cancelled) {
          setPreview(payload);
        }
      } catch (error) {
        if (!cancelled) {
          setDialogError(error instanceof Error ? error.message : "workbook プレビューを取得できませんでした。");
        }
      } finally {
        if (!cancelled) {
          setIsPreviewLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, previewAttempt]);

  async function handleSave() {
    setDialogError("");
    setIsSaving(true);

    try {
      const result = await apiMutateJson<WorkbookExportPreview>("/api/exports/workbook", "POST");

      if (!result.ok) {
        setDialogError(result.error.message);
        return;
      }

      setStatus({
        workbookPath: result.data.workbook_path,
        exportedAt: result.data.exported_at ?? "",
      });
      setIsOpen(false);
      setPreview(result.data);
    } catch {
      setDialogError("workbook を保存できませんでした。");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="app-header-action-button"
        data-tour-id="workbook-export"
        onClick={() => {
          setStatus(null);
          setIsOpen(true);
        }}
      >
        エクスポート
      </button>
      {isOpen ? (
        <ModalShell
          ariaLabelledBy="workbook-export-dialog-title"
          canClose={!isSaving}
          onRequestClose={() => setIsOpen(false)}
          usePortal
        >
          <div className="budget-modal-header">
            <div>
              <h3 id="workbook-export-dialog-title">取込済みExcelを上書き保存</h3>
              <p className="budget-modal-description">
                保存先と差分を確認してください。
              </p>
            </div>
          </div>

          {isPreviewLoading ? <p className="budget-modal-copy">差分を確認中...</p> : null}
          {dialogError ? <p className="budget-form-status budget-form-status-error" role="alert">{dialogError} 保存先を確認して再試行してください。</p> : null}
          {preview ? (
            <>
              <div className="workbook-export-meta">
                <p className="budget-modal-copy">{preview.source_filename}</p>
                <details><summary>保存先のパス</summary><p className="workbook-path">{preview.workbook_path}</p></details>
                <p className="budget-modal-copy">最終インポート: {preview.imported_at || "不明"}</p>
                {preview.reason ? (
                  <p className="budget-form-status budget-form-status-error">{preview.message ?? preview.reason}</p>
                ) : null}
              </div>

              <div className="comparison-scroll" tabIndex={0} role="region" aria-label="Excel差分の横スクロール">
                <table className="comparison-table" aria-label="Excel差分">
                  <thead><tr>
                    <th scope="col">シート</th><th scope="col">追加</th>
                    <th scope="col">更新</th><th scope="col">削除</th>
                  </tr></thead>
                  <tbody>
                    {(Object.keys(preview.changes) as WorkbookSheetName[]).map((name) => {
                      const change = preview.changes[name];
                      return (
                        <tr key={name}>
                          <th scope="row">{SHEET_LABELS[name]}</th>
                          <td>{change.added}</td><td>{change.updated}</td><td>{change.removed}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {(Object.keys(preview.changes) as WorkbookSheetName[])
                .filter((name) => preview.changes[name].rows.length || preview.changes[name].more_count)
                .map((name) => (
                  <details className="workbook-export-sheet" key={name}>
                    <summary>{SHEET_LABELS[name]}の変更内容</summary>
                    <ul className="workbook-export-change-list">
                      {preview.changes[name].rows.map((row) => (
                        <li key={`${row.action}:${row.key}`}>
                          {CHANGE_ACTION_LABELS[row.action]} {row.label || row.key}
                          {row.fields.length ? ` (${formatChangedFields(row.fields)})` : ""}
                        </li>
                      ))}
                    </ul>
                    {preview.changes[name].more_count > 0 ? <p>他 {preview.changes[name].more_count} 件</p> : null}
                  </details>
                ))}
            </>
          ) : null}

          {dialogError && !preview ? <button type="button" className="budget-modal-secondary" disabled={isPreviewLoading} onClick={() => setPreviewAttempt((attempt) => attempt + 1)}>再試行</button> : null}
          <p className="budget-modal-copy">現在の登録内容で取込済みExcelを上書きします。ファイル内の以前の内容は失われます。</p>
          <div className="budget-modal-actions">
            <button
              type="button"
              className="budget-modal-secondary"
              disabled={isSaving}
              onClick={() => setIsOpen(false)}
            >
              キャンセル
            </button>
            <button
              type="button"
              className="budget-entry-submit"
              disabled={isPreviewLoading || isSaving || !preview?.available}
              onClick={() => void handleSave()}
            >
              {isSaving ? "保存中..." : "上書き保存"}
            </button>
          </div>
        </ModalShell>
      ) : null}
    </>
  );
}

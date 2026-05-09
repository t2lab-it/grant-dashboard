import { useEffect, useState } from "react";
import { ModalShell } from "../../app/ModalShell";
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
  funds: "資金",
  categories: "費目",
  budget_lines: "予算行",
  planned_items: "計画項目",
  actual_entries: "実績項目",
};

function readApiMessage(payload: unknown, fallback: string) {
  if (typeof payload === "object" && payload !== null) {
    if (typeof (payload as { message?: unknown }).message === "string") {
      return (payload as { message: string }).message;
    }

    if (typeof (payload as { reason?: unknown }).reason === "string") {
      return (payload as { reason: string }).reason;
    }
  }

  return fallback;
}

export function WorkbookExportControl() {
  const { setStatus } = useWorkbookExportStatus();
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
        const response = await fetch("/api/exports/workbook/preview");
        const payload = (await response.json()) as WorkbookExportPreview;

        if (!cancelled) {
          if (!response.ok) {
            setDialogError(readApiMessage(payload, "workbook プレビューを取得できませんでした。"));
            return;
          }

          setPreview(payload);
        }
      } catch {
        if (!cancelled) {
          setDialogError("workbook プレビューを取得できませんでした。");
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
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isSaving) {
        setIsOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isSaving]);

  async function handleSave() {
    setDialogError("");
    setIsSaving(true);

    try {
      const response = await fetch("/api/exports/workbook", {
        method: "POST",
      });
      const payload = (await response.json()) as WorkbookExportPreview;

      if (!response.ok) {
        setDialogError(readApiMessage(payload, "workbook を保存できませんでした。"));
        setPreview(payload);
        return;
      }

      setStatus({
        workbookPath: payload.workbook_path,
        exportedAt: payload.exported_at ?? "",
      });
      setIsOpen(false);
      setPreview(payload);
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
          canCloseOnBackdrop={!isSaving}
          onRequestClose={() => setIsOpen(false)}
          usePortal
        >
          <div className="budget-modal-header">
            <div>
              <h3 id="workbook-export-dialog-title">workbook をエクスポート</h3>
              <p className="budget-modal-description">
                現在の DB 内容で、最後に import した workbook を上書きします。
              </p>
            </div>
          </div>

          {isPreviewLoading ? <p className="budget-modal-copy">差分を確認中...</p> : null}
          {dialogError ? <p className="budget-form-status budget-form-status-error">{dialogError}</p> : null}
          {preview ? (
            <>
              <div className="workbook-export-meta">
                <p className="budget-modal-copy">{preview.workbook_path}</p>
                <p className="budget-modal-copy">最終インポート: {preview.imported_at || "不明"}</p>
                {preview.reason ? (
                  <p className="budget-form-status budget-form-status-error">{preview.reason}</p>
                ) : null}
              </div>

              <div className="workbook-export-sheet-list">
                {(Object.keys(preview.changes) as WorkbookSheetName[]).map((sheetName) => {
                  const change = preview.changes[sheetName];

                  return (
                    <section className="workbook-export-sheet" key={sheetName}>
                      <div className="workbook-export-sheet-header">
                        <strong>{SHEET_LABELS[sheetName]}</strong>
                        <span>
                          追加 {change.added} / 更新 {change.updated} / 削除 {change.removed}
                        </span>
                      </div>
                      {change.rows.length > 0 ? (
                        <ul className="workbook-export-change-list">
                          {change.rows.map((row) => (
                            <li key={`${sheetName}:${row.action}:${row.key}`}>
                              {row.action} {row.label || row.key}
                              {row.fields.length > 0 ? ` (${row.fields.join(", ")})` : ""}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="workbook-export-empty">変更サンプルなし</p>
                      )}
                      {change.more_count > 0 ? (
                        <p className="workbook-export-empty">他 {change.more_count} 件</p>
                      ) : null}
                    </section>
                  );
                })}
              </div>
            </>
          ) : null}

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

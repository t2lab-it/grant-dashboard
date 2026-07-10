import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ModalShell } from "../../app/ModalShell";
import type { WorkbookImportPreview, WorkbookImportResult } from "../../contracts/imports";
import { apiPostFile } from "../../lib/api";

export function WorkbookImportControl() {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<WorkbookImportPreview | null>(null);
  const [dialogError, setDialogError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isPreviewLoading && !isImporting) {
        setIsOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isImporting, isOpen, isPreviewLoading]);

  async function uploadWorkbook(endpoint: string) {
    if (!selectedFile) {
      throw new Error("`.xlsx` ファイルを選択してください。");
    }

    const result = await apiPostFile<WorkbookImportPreview | WorkbookImportResult>(endpoint, selectedFile);

    if (!result.ok) {
      throw result.error;
    }

    return result.data;
  }

  async function handlePreview() {
    setDialogError("");
    setIsPreviewLoading(true);

    try {
      const payload = (await uploadWorkbook("/api/imports/workbook/preview")) as WorkbookImportPreview;
      setPreview(payload);
    } catch (error) {
      setPreview(null);
      setDialogError(error instanceof Error ? error.message : "workbook をプレビューできませんでした。");
    } finally {
      setIsPreviewLoading(false);
    }
  }

  async function handleImport() {
    setDialogError("");
    setIsImporting(true);

    try {
      const payload = (await uploadWorkbook("/api/imports/workbook")) as WorkbookImportResult;
      setStatusMessage(`workbook を取り込みました: ${payload.source_filename}`);
      setIsOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["overview"] });
      await queryClient.invalidateQueries({ queryKey: ["imports"] });
    } catch (error) {
      setDialogError(error instanceof Error ? error.message : "workbook を取り込めませんでした。");
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="app-header-action-button"
        onClick={() => {
          setStatusMessage("");
          setDialogError("");
          setPreview(null);
          setSelectedFile(null);
          setIsOpen(true);
        }}
      >
        インポート
      </button>
      {statusMessage ? (
        <p className="app-header-status" role="status">
          {statusMessage}
        </p>
      ) : null}
      {isOpen ? (
        <ModalShell
          ariaLabelledBy="workbook-import-dialog-title"
          canCloseOnBackdrop={!isPreviewLoading && !isImporting}
          onRequestClose={() => setIsOpen(false)}
          usePortal
        >
          <div className="budget-modal-header">
            <div>
              <h3 id="workbook-import-dialog-title">workbook をインポート</h3>
              <p className="budget-modal-description">
                `.xlsx` を選び、件数と警告を確認してから既存データを置き換えます。
              </p>
            </div>
          </div>

          <label className="budget-form-field">
            <span>.xlsx ファイル</span>
            <input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              aria-label=".xlsx ファイル"
              onChange={(event) => {
                setDialogError("");
                setPreview(null);
                setSelectedFile(event.target.files?.[0] ?? null);
              }}
            />
          </label>

          <p className="budget-modal-copy">この workbook で既存データを置き換えます。</p>
          {isPreviewLoading ? <p className="budget-modal-copy">取り込み内容を確認中...</p> : null}
          {dialogError ? <p className="budget-form-status budget-form-status-error">{dialogError}</p> : null}
          {preview ? (
            <>
              <div className="workbook-export-meta">
                <p className="budget-modal-copy">{preview.source_filename}</p>
                <p className="budget-modal-copy">
                  資金 {preview.counts.funds} / 費目 {preview.counts.categories} / 予算行{" "}
                  {preview.counts.budget_lines} / 予定 {preview.counts.planned_items} / 実績{" "}
                  {preview.counts.actual_entries}
                </p>
                <p className="budget-modal-copy">警告 {preview.counts.warnings}件</p>
              </div>

              {preview.warnings.length > 0 ? (
                <ul className="workbook-export-change-list">
                  {preview.warnings.map((warning) => (
                    <li key={`${warning.sheet_name}:${warning.row_number}:${warning.code}`}>
                      {warning.sheet_name} {warning.row_number}行目: {warning.message}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="workbook-export-empty">警告はありません</p>
              )}
            </>
          ) : null}

          <div className="budget-modal-actions">
            <button
              type="button"
              className="budget-modal-secondary"
              disabled={isPreviewLoading || isImporting}
              onClick={() => setIsOpen(false)}
            >
              キャンセル
            </button>
            <button
              type="button"
              className="budget-modal-secondary"
              disabled={!selectedFile || isPreviewLoading || isImporting}
              onClick={() => void handlePreview()}
            >
              {isPreviewLoading ? "確認中..." : "プレビュー"}
            </button>
            <button
              type="button"
              className="budget-entry-submit"
              disabled={!preview || isPreviewLoading || isImporting}
              onClick={() => void handleImport()}
            >
              {isImporting ? "取込中..." : "取り込む"}
            </button>
          </div>
        </ModalShell>
      ) : null}
    </>
  );
}

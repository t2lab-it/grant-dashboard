import { useEffect, useId, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateClassificationRequest,
  UpdateClassificationRequest,
} from "../../contracts/requestSchemas";
import { apiGet, apiMutateJson, apiPostJson } from "../../lib/api";
import { queryKeys } from "../../lib/queryKeys";
import type { ClassificationKind, ClassificationResponse, ClassificationTag } from "../classifications/classificationTypes";
import { normalizeClassifications } from "../classifications/classificationTypes";

function SettingsHelp({ description, label }: { description: string; label: string }) {
  const helpId = useId();

  return (
    <span className="overview-context-help settings-inline-help">
      <button
        type="button"
        className="overview-context-help-trigger"
        aria-label={label}
        aria-describedby={helpId}
      >
        ?
      </button>
      <span id={helpId} role="tooltip" className="overview-context-help-tooltip settings-inline-help-tooltip">
        {description}
      </span>
    </span>
  );
}

function ClassificationCreateForm({
  kind,
  label,
  defaultColor,
  onCreated,
}: {
  kind: ClassificationKind;
  label: string;
  defaultColor: string;
  onCreated: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(defaultColor);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleCreate() {
    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await apiPostJson<CreateClassificationRequest, { id: number }>(
        "/api/classifications",
        { kind, name: trimmedName, color },
      );
      if (result.ok) {
        setName("");
        setColor(defaultColor);
        await onCreated();
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="classification-create-row">
      <label className="budget-entry-field">
        <input
          aria-label={`${label}名`}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label className="budget-entry-field classification-color-field">
        <input
          aria-label={`${label}色`}
          type="color"
          value={color}
          onChange={(event) => setColor(event.target.value)}
        />
      </label>
      <button
        type="button"
        className="detail-action-button"
        disabled={isSubmitting || name.trim().length === 0}
        onClick={handleCreate}
      >
        {label}を追加
      </button>
    </div>
  );
}

function ClassificationEditRow({
  label,
  tag,
  onChanged,
}: {
  label: string;
  tag: ClassificationTag;
  onChanged: () => Promise<void>;
}) {
  const [name, setName] = useState(tag.name);
  const [color, setColor] = useState(tag.color);
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setName(tag.name);
    setColor(tag.color);
  }, [tag.color, tag.name]);

  async function handleSave() {
    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await apiMutateJson<unknown, UpdateClassificationRequest>(`/api/classifications/${tag.id}`, "PUT", {
        name: trimmedName,
        color,
      });
      if (result.ok) {
        await onChanged();
        setIsEditing(false);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete() {
    setIsSubmitting(true);
    try {
      const result = await apiMutateJson(`/api/classifications/${tag.id}`, "DELETE");
      if (result.ok) {
        await onChanged();
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleCancel() {
    setName(tag.name);
    setColor(tag.color);
    setIsEditing(false);
  }

  if (!isEditing) {
    return (
      <div className="classification-saved-row">
        <span className="classification-saved-label">
          <span
            className="classification-color-swatch"
            aria-label={`${label}色: ${tag.color}`}
            role="img"
            style={{ backgroundColor: tag.color }}
          />
          <span>{tag.name}</span>
          <span className="classification-saved-color-code">{tag.color}</span>
        </span>
        <button
          type="button"
          className="detail-action-button"
          aria-label={`${label}を編集: ${tag.name}`}
          disabled={isSubmitting}
          onClick={() => setIsEditing(true)}
        >
          編集
        </button>
        <button
          type="button"
          className="detail-action-button detail-action-button-danger"
          aria-label={`${label}を削除: ${tag.name}`}
          disabled={isSubmitting}
          onClick={handleDelete}
        >
          削除
        </button>
      </div>
    );
  }

  return (
    <div className="classification-edit-row">
      <label className="budget-entry-field">
        <input
          aria-label={`${label}名: ${tag.name}`}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label className="budget-entry-field classification-color-field">
        <input
          aria-label={`${label}色: ${name}`}
          type="color"
          value={color}
          onChange={(event) => setColor(event.target.value)}
        />
      </label>
      <button
        type="button"
        className="detail-action-button"
        disabled={isSubmitting || name.trim().length === 0}
        onClick={handleSave}
      >
        保存
      </button>
      <button
        type="button"
        className="detail-action-button"
        disabled={isSubmitting}
        onClick={handleCancel}
      >
        キャンセル
      </button>
      <button
        type="button"
        className="detail-action-button detail-action-button-danger"
        disabled={isSubmitting}
        onClick={handleDelete}
      >
        削除
      </button>
    </div>
  );
}

export function ClassificationSettingsSection() {
  const queryClient = useQueryClient();
  const { data: rawClassificationData } = useQuery({
    queryKey: queryKeys.classifications.all,
    queryFn: () => apiGet<ClassificationResponse>("/api/classifications"),
  });
  const classificationData = normalizeClassifications(rawClassificationData);
  const refreshClassifications = () => queryClient.invalidateQueries({ queryKey: queryKeys.classifications.all });

  return (
        <section className="settings-section">
          <h3>分類</h3>
          <div className="classification-settings-grid">
            <section className="classification-settings-panel" aria-label="研究プロジェクトタグ">
              <div className="classification-settings-heading">
                <h4>研究プロジェクトタグ</h4>
                <SettingsHelp
                  label="研究プロジェクトタグの使い分け"
                  description="研究プロジェクトタグは、同じ研究テーマや事業に紐づく複数の予算を束ねる分類です。例: 量子制御基盤、次世代通信、学内共同研究。"
                />
              </div>
              <ClassificationCreateForm
                kind="project"
                label="研究プロジェクトタグ"
                defaultColor="#2563eb"
                onCreated={refreshClassifications}
              />
              <div className="classification-edit-list">
                {classificationData.projectTags.map((tag) => (
                  <ClassificationEditRow
                    key={tag.id}
                    label="研究プロジェクトタグ"
                    tag={tag}
                    onChanged={refreshClassifications}
                  />
                ))}
              </div>
            </section>
            <section className="classification-settings-panel" aria-label="補助ラベル">
              <div className="classification-settings-heading">
                <h4>補助ラベル</h4>
                <SettingsHelp
                  label="補助ラベルの使い分け"
                  description="費目は予算額・残高・消化率を管理する会計上の分類です。補助ラベルは、予算や費目をまたいで後から探したい印です。例: 学生支援、出張、要確認。"
                />
              </div>
              <ClassificationCreateForm
                kind="auxiliary"
                label="補助ラベル"
                defaultColor="#16a34a"
                onCreated={refreshClassifications}
              />
              <div className="classification-edit-list">
                {classificationData.auxiliaryLabels.map((tag) => (
                  <ClassificationEditRow
                    key={tag.id}
                    label="補助ラベル"
                    tag={tag}
                    onChanged={refreshClassifications}
                  />
                ))}
              </div>
            </section>
          </div>
        </section>
  );
}

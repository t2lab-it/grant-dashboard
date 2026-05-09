import type { ClassificationTag } from "./classificationTypes";

type ClassificationCheckboxGroupProps = {
  title: string;
  options: ClassificationTag[];
  selectedIds: number[];
  onChange: (selectedIds: number[]) => void;
};

export function ClassificationCheckboxGroup({
  title,
  options,
  selectedIds,
  onChange,
}: ClassificationCheckboxGroupProps) {
  const selectedIdSet = new Set(selectedIds);

  function toggleTag(tagId: number) {
    if (selectedIdSet.has(tagId)) {
      onChange(selectedIds.filter((selectedId) => selectedId !== tagId));
      return;
    }

    onChange([...selectedIds, tagId]);
  }

  if (options.length === 0) {
    return null;
  }

  return (
    <fieldset className="classification-checkbox-group">
      <legend>{title}</legend>
      <div className="classification-chip-list">
        {options.map((option) => (
          <label key={option.id} className="classification-checkbox-chip">
            <input
              type="checkbox"
              checked={selectedIdSet.has(option.id)}
              onChange={() => toggleTag(option.id)}
            />
            <span
              className="classification-color-swatch"
              aria-hidden="true"
              style={{ backgroundColor: option.color }}
            />
            <span>{option.name}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

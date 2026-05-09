import {
  toggleSortState,
  type FundDetailSortField,
  type FundDetailSortState,
} from "./fundDetailSort";

type FundSortButtonsProps<K extends string> = {
  fields: FundDetailSortField<K>[];
  sortState: FundDetailSortState<K>;
  onSortChange: (next: FundDetailSortState<K>) => void;
};

export function FundSortButtons<K extends string>({
  fields,
  sortState,
  onSortChange,
}: FundSortButtonsProps<K>) {
  return (
    <>
      {fields.map((field) => {
        const isActive = sortState.key === field.key;
        const alignClassName = field.align === "end" ? "detail-sort-button-end" : "detail-sort-button-start";

        return (
          <button
            key={field.key}
            type="button"
            className={`detail-sort-button ${alignClassName}${isActive ? " detail-sort-button-active" : ""}${field.className ? ` ${field.className}` : ""}`}
            aria-pressed={isActive}
            onClick={() => onSortChange(toggleSortState(sortState, fields, field.key))}
          >
            <span>{field.label}</span>
            {isActive ? (
              <span className="detail-sort-indicator" aria-hidden="true">
                {sortState.direction === "asc" ? "▲" : "▼"}
              </span>
            ) : null}
          </button>
        );
      })}
    </>
  );
}

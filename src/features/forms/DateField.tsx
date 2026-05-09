import { useRef } from "react";

export function formatDateForDisplay(value: string) {
  return value.replaceAll("-", "/");
}

export function normalizeDateForApi(value: string) {
  return value.trim().replaceAll("/", "-");
}

export function normalizeDateForPicker(value: string) {
  const normalizedValue = normalizeDateForApi(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalizedValue) ? normalizedValue : "";
}

type DateFieldProps = {
  buttonAriaLabel?: string;
  calendarAriaLabel: string;
  label: string;
  name: string;
  onChange: (value: string) => void;
  placeholder?: string;
  textAriaLabel: string;
  value: string;
};

export function DateField({
  buttonAriaLabel,
  calendarAriaLabel,
  label,
  name,
  onChange,
  placeholder = "YYYY/MM/DD",
  textAriaLabel,
  value,
}: DateFieldProps) {
  const calendarInputRef = useRef<HTMLInputElement>(null);

  function openCalendar() {
    const calendarInput = calendarInputRef.current as
      | (HTMLInputElement & { showPicker?: () => void })
      | null;

    if (!calendarInput) {
      return;
    }

    if (typeof calendarInput.showPicker === "function") {
      calendarInput.showPicker();
      return;
    }

    calendarInput.focus();
    calendarInput.click();
  }

  return (
    <label className="budget-entry-field">
      <span>{label}</span>
      <div className="budget-entry-date-row">
        <input
          aria-label={textAriaLabel}
          inputMode="numeric"
          name={name}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          type="text"
          value={value}
        />
        <button
          aria-label={buttonAriaLabel ?? `${label}カレンダーを開く`}
          className="budget-entry-calendar-button"
          onClick={openCalendar}
          type="button"
        >
          <svg
            aria-hidden="true"
            fill="none"
            height="18"
            viewBox="0 0 24 24"
            width="18"
          >
            <rect
              height="14"
              rx="2"
              stroke="currentColor"
              strokeWidth="1.8"
              width="18"
              x="3"
              y="5"
            />
            <path
              d="M7 3v4M17 3v4M3 9h18"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="1.8"
            />
          </svg>
        </button>
        <input
          aria-label={calendarAriaLabel}
          className="budget-entry-calendar-input"
          onChange={(event) => onChange(formatDateForDisplay(event.target.value))}
          ref={calendarInputRef}
          tabIndex={-1}
          type="date"
          value={normalizeDateForPicker(value)}
        />
      </div>
    </label>
  );
}

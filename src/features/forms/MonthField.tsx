import { useEffect, useId, useRef, useState } from "react";

const MONTH_NUMBERS = Array.from({ length: 12 }, (_, index) => index + 1);

export function formatMonthForDisplay(value: string) {
  return value.replaceAll("-", "/");
}

export function normalizeMonthForApi(value: string) {
  return value.trim().replaceAll("/", "-");
}

function getMonthYear(value: string) {
  const match = normalizeMonthForApi(value).match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  return match === null ? null : Number(match[1]);
}

function formatMonthValue(year: number, month: number) {
  return `${year}-${month.toString().padStart(2, "0")}`;
}

type MonthFieldProps = {
  buttonAriaLabel?: string;
  calendarAriaLabel: string;
  label: string;
  name: string;
  onChange: (value: string) => void;
  placeholder?: string;
  textAriaLabel: string;
  value: string;
};

export function MonthField({
  buttonAriaLabel,
  calendarAriaLabel,
  label,
  name,
  onChange,
  placeholder = "YYYY/MM",
  textAriaLabel,
  value,
}: MonthFieldProps) {
  const calendarId = useId();
  const calendarButtonRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [visibleYear, setVisibleYear] = useState(
    () => getMonthYear(value) ?? new Date().getFullYear(),
  );
  const normalizedValue = normalizeMonthForApi(value);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleDocumentMouseDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleDocumentKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
        calendarButtonRef.current?.focus();
      }
    }

    document.addEventListener("mousedown", handleDocumentMouseDown);
    document.addEventListener("keydown", handleDocumentKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleDocumentMouseDown);
      document.removeEventListener("keydown", handleDocumentKeyDown);
    };
  }, [isOpen]);

  function toggleCalendar() {
    setIsOpen((currentIsOpen) => {
      const nextIsOpen = !currentIsOpen;
      if (nextIsOpen) {
        setVisibleYear(getMonthYear(value) ?? new Date().getFullYear());
      }
      return nextIsOpen;
    });
  }

  function selectMonth(month: number) {
    onChange(formatMonthValue(visibleYear, month));
    setIsOpen(false);
    calendarButtonRef.current?.focus();
  }

  return (
    <label className="budget-entry-field">
      <span>{label}</span>
      <div className="budget-entry-month-field" ref={containerRef}>
        <div className="budget-entry-date-row">
          <input
            aria-label={textAriaLabel}
            inputMode="numeric"
            name={name}
            onChange={(event) => onChange(normalizeMonthForApi(event.target.value))}
            placeholder={placeholder}
            type="text"
            value={formatMonthForDisplay(value)}
          />
          <button
            aria-controls={calendarId}
            aria-expanded={isOpen}
            aria-label={buttonAriaLabel ?? `${label}カレンダーを開く`}
            className="budget-entry-calendar-button"
            onClick={toggleCalendar}
            ref={calendarButtonRef}
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
        </div>
        {isOpen ? (
          <div
            aria-label={calendarAriaLabel}
            className="budget-entry-month-calendar"
            id={calendarId}
            role="dialog"
          >
            <div className="budget-entry-month-calendar-header">
              <button
                aria-label="前年へ"
                className="budget-entry-month-calendar-nav"
                onClick={() => setVisibleYear((year) => year - 1)}
                type="button"
              >
                <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 24 24" width="18">
                  <path
                    d="m14 6-6 6 6 6"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                  />
                </svg>
              </button>
              <strong className="budget-entry-month-calendar-year">{visibleYear}</strong>
              <button
                aria-label="次年へ"
                className="budget-entry-month-calendar-nav"
                onClick={() => setVisibleYear((year) => year + 1)}
                type="button"
              >
                <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 24 24" width="18">
                  <path
                    d="m10 6 6 6-6 6"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                  />
                </svg>
              </button>
            </div>
            <div className="budget-entry-month-calendar-grid">
              {MONTH_NUMBERS.map((month) => {
                const monthValue = formatMonthValue(visibleYear, month);
                return (
                  <button
                    aria-pressed={monthValue === normalizedValue}
                    className="budget-entry-month-calendar-option"
                    key={monthValue}
                    onClick={() => selectMonth(month)}
                    type="button"
                  >
                    {formatMonthForDisplay(monthValue)}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </label>
  );
}

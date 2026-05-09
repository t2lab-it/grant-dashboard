type FormFeedbackProps = {
  blockingMessage: string;
  infoMessage: string;
  warnings: string[];
};

export function FormFeedback({ blockingMessage, infoMessage, warnings }: FormFeedbackProps) {
  return (
    <div className="budget-form-feedback">
      {blockingMessage ? (
        <p className="budget-form-status budget-form-status-error" role="alert">
          {blockingMessage}
        </p>
      ) : null}
      {infoMessage ? (
        <p className="budget-form-status budget-form-status-info" aria-live="polite">
          {infoMessage}
        </p>
      ) : null}
      {warnings.length > 0 ? (
        <ul className="budget-form-messages budget-form-messages-warning" aria-live="polite">
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

# Page Status Message Design Note

Page-level loading and fetch-error placeholders use the shared
`PageStatusMessage` component. It is intentionally small: callers choose
`kind="loading"` or `kind="error"` and pass the user-visible Japanese message.

Loading states use `role="status"` with `aria-live="polite"` so screen readers
can announce non-blocking progress. Error states use `role="alert"` because the
page cannot show its requested content.

This component is for full-page route/query placeholders, including lazy route
fallbacks. Inline form errors, modal progress text, invalid route IDs, and empty
states keep their local components or copy unless their UX is redesigned
separately.

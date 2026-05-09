# Issue 82 App Dark Mode Design Note

Updated: 2026-04-23

## Purpose

Add app-wide dark mode with system-sync and manual override while keeping chart palette presets independent from application surface theming.

## Durable Decisions

- Store app-wide theme preference in `AppSettings` as a separate field from chart palette selection.
- Use `appThemeMode: "system" | "light" | "dark"` with `"system"` as the default.
- Continue storing settings in the existing `budget-dashboard:settings` localStorage entry.
- Resolve the effective theme at the app shell level:
  - `"light"` always applies light theme
  - `"dark"` always applies dark theme
  - `"system"` follows `matchMedia("(prefers-color-scheme: dark)")`
- Apply the effective theme through app-level CSS variables and `data-theme`, not through per-component theme logic.
- Keep `themePreset` limited to chart color selection for overview and fund-detail charts.
- Expose the app theme selector from the settings page, not as a new persistent header control.

## First Slice Boundaries

- Theme coverage in this issue targets:
  - `AppShell`
  - `OverviewPage`
  - `FundDetailPage`
  - `SettingsPage`
  - shared controls and modal surfaces used by those screens
- `imports/*` pages are outside this first slice unless they inherit usable colors from shared shell styles without dedicated work.
- Chart preset previews and chart rendering continue using the existing preset logic.

## Behavior

- On first load with no saved preference, the app follows the operating system theme.
- Changing the app theme in settings updates localStorage immediately.
- While `appThemeMode` is `"system"`, operating-system theme changes update the effective app theme without requiring a reload.
- While `appThemeMode` is `"light"` or `"dark"`, operating-system theme changes do not override the chosen mode.

## Verification

- Add client tests for settings storage and fallback behavior with `appThemeMode`.
- Add client tests for the settings UI to verify `system`, `light`, and `dark` selection and persistence.
- Add client tests for shell-level theme resolution with mocked `matchMedia`.
- Run `npm test`.
- Run `npm run build`.
- Manually verify major screens in light, dark, and system-follow modes.

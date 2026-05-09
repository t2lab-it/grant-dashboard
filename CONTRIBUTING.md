# Contributing

Thank you for considering a contribution to Budget Dashboard.

## Data Safety

Do not include real budget data, personal information, credentials, unpublished vulnerability details, or internal file paths in issues, pull requests, discussions, screenshots, workbooks, databases, logs, or exports.

Use synthetic data or the public demo seed for examples. If you are unsure whether a detail is safe to share, remove it before posting.

## Development Setup

Install dependencies:

```bash
npm ci
```

Run the application locally:

```bash
npm run dev
```

Run the main checks before opening a pull request:

```bash
npm test
npm run build
```

For static demo changes, also run:

```bash
npm run build:demo
```

## Issues

Use the issue template that best matches the request:

- Bug report
- Feature request
- Question
- Data safety or security consultation

Keep reports focused on one topic. Include sanitized reproduction steps, expected behavior, and actual behavior when relevant.

## Pull Requests

Before opening a pull request:

- Keep the change narrow and related to one issue or workflow.
- Add or update tests for behavior changes.
- Update README or related documentation when contributor-facing behavior changes.
- Confirm that `npm test` and `npm run build` pass.
- Do not commit runtime databases, local workbooks, uploads, backups, or other private operational files.

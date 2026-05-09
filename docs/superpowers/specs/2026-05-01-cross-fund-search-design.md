# Cross-Fund Search Design Note

Updated: 2026-05-01

`/search` is the fiscal-year-scoped entry point for finding planned items and actual entries across funds. The canonical read model lives server-side behind `GET /api/search`; static demo mode mirrors the same contract in the browser-local store.

The selected fiscal year uses the existing `year` query and is filtered by `funds.fiscal_year`. The search API accepts `tab`, `keyword`, `fundId`, `categoryId`, `entryType`, `monthFrom`, and `monthTo`. Keyword search covers description, notes, fund name, and category name.

Results normalize planned items and actual entries into one list with `type`, fund/category metadata, month/date, description, amount, status label, and `detailHref`. Planned results use the existing remaining-amount rule: `max(planned amount - linked actual amount, 0)`.

Review tabs are URL-addressable:

- `tab=overdue`: planned items before the current month with remaining amount.
- `tab=unsettled`: planned items with remaining amount.
- `tab=unlinked`: actual entries without `planned_item_id`.

Result links use `/funds/:fundId?year=YYYY&focus=planned-:id` or `focus=actual-:id`; fund detail highlights the matching row when it is visible. The search view is read-only. Editing, settlement, completion, and cancellation stay in fund detail or entry-specific workflows.

#131 can extend the query with auxiliary-label filters without changing the result shape. #132 can link alert details directly to the review tabs above.

# Classification Tags Design

This note records the durable classification choices from issues #131 and #136.

`classification_tags` stores both research project tags and auxiliary labels via
`kind = project | auxiliary`. `classification_assignments` stores assignments to
`fund`, `planned_item`, or `actual_entry`; deleting a tag cascades to its
assignments.

Target rules live in services rather than schema checks: project tags attach
only to funds, while auxiliary labels attach to funds, planned items, and actual
entries.

Cross-fund search filters only auxiliary labels. A planned or actual row matches
when the label is assigned directly or inherited from its fund.

Overview uses only research project tags for fund-card display and filtering.
The filter options are built from the selected-fiscal-year funds: the dropdown
shows funds assigned to the selected project tag, and `未設定` shows funds
without a project tag. Workbook import/export tag columns remain outside this
design note.

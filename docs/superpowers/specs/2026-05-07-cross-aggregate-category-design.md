# Cross Aggregate Category Design Note

`費目` remains the official reporting category. `cross_aggregate_category` is a
required, fixed-code analysis axis for comparing categories across funds without
renaming their official labels.

| Code | UI label |
| --- | --- |
| `equipment` | `物品系` |
| `travel` | `旅費系` |
| `personnel` | `人件費・謝金系` |
| `other` | `その他` |
| `unset` | `未設定` |

The DB stores `categories.cross_aggregate_category TEXT NOT NULL`. API and
workbook inputs must provide a nonblank valid code; missing, blank, and invalid
values are rejected. `unset` is still a deliberate user-visible value, but it is
not used as an automatic compatibility default.

The UI exposes the value as `横断集計カテゴリ`, warns about deliberate `未設定`
rows without blocking save, and uses the field for fund-detail and overview
`大費目別内訳` summaries. The category list is intentionally not configurable.

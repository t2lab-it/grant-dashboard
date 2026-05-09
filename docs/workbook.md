# Workbook 運用

研究予算ダッシュボードは workbook を運用入力として扱い、import 後の SQLite を runtime の source of truth とします。ダッシュボードと API は SQLite 上の正規化データを見ます。`exports/current.json` もレビュー用の派生物であり、正本ではありません。

## 全体フロー

1. 必要なら `npm run seed:demo` で demo seed を投入し、架空データで画面を試す
2. 自分のデータで使う場合は blank workbook template を作る
3. workbook を編集する
4. `npm run simple:import:dry -- /path/to/workbook.xlsx` で dry-run する
5. warning と件数を確認する
6. `npm run simple:import -- /path/to/workbook.xlsx` で SQLite に取り込む
7. 既存 import を置き換える場合は `--replace` を付ける
8. 必要に応じて `npm run export:json` でレビュー用 JSON を更新する
9. ダッシュボードまたは API で結果を確認する

ローカル起動後、空 DB または import 未実行状態の Overview には初回利用カードが表示されます。カードから blank template をブラウザでダウンロードでき、ヘッダーの `インポート` で `.xlsx` を preview/import できます。

GitHub Pages の静的デモでは、実ファイルの import/export と SQLite は使えません。静的デモは画面確認用として使い、実 workbook の dry-run/import はローカル起動後に実行してください。

## Workbook の形式

simple workbook は次の 5 シートで構成されます。

| Sheet | Purpose |
| --- | --- |
| `funds` | 研究費や予算枠の基本情報 |
| `categories` | 各 fund に属する費目 |
| `budget_lines` | 費目ごとの予算額 |
| `planned_items` | 執行予定項目 |
| `actual_entries` | 実績計上項目 |

各シートのヘッダは固定です。

```text
funds: fund_code, name, fiscal_year, awarded_amount, notes, project_tags, auxiliary_labels, display_order
categories: fund_code, category_code, name, cross_aggregate_category, display_order
budget_lines: fund_code, category_code, amount, notes
planned_items: planned_ref, fund_code, category_code, planned_date, scheduled_month, description, amount, notes, auxiliary_labels
actual_entries: fund_code, category_code, actual_date, description, amount, planned_ref, notes, auxiliary_labels
```

`cross_aggregate_category` は、制度ごとに異なる費目を横断比較するための補助分類です。workbook では日本語ラベルではなく、次のコード値を使います。この列は必須です。

| code | 表示 |
| --- | --- |
| `equipment` | 物品系 |
| `travel` | 旅費系 |
| `personnel` | 人件費・謝金系 |
| `other` | その他 |
| `unset` | 未設定 |

新しい workbook をゼロから作るときは template 生成を使います。

```bash
npm run simple:template -- /path/to/simple-budget.xlsx
```

ローカル UI からは Overview の初回利用カードで `template.xlsx をダウンロード` を押すと、同じ形式の blank workbook を取得できます。endpoint は次です。

```text
GET /api/imports/workbook/template.xlsx
```

## Dry-Run Import

workbook の妥当性を確認し、正規化後の件数と warning を確認するには次を使います。

```bash
npm run simple:import:dry -- /path/to/workbook.xlsx
```

- SQLite には書き込みません
- workbook 契約違反や warning の確認に使います
- 本番相当の import 前に毎回実行する前提です

## Workbook Import

workbook を SQLite に取り込むには次を使います。

```bash
npm run simple:import -- /path/to/workbook.xlsx
```

この command は、workbook を正規化したうえで transaction 内で `funds`, `categories`, `budget_lines`, `planned_items`, `actual_entries`, `imports` に保存します。

既に import 済みの内容を置き換える場合は、明示的に `--replace` を付けてください。

```bash
npm run simple:import -- /path/to/workbook.xlsx --replace
```

別の DB ファイルを対象にしたい場合は `BUDGET_DB_PATH` を使います。

```bash
BUDGET_DB_PATH=/tmp/budget-review.db npm run simple:import -- /path/to/workbook.xlsx --replace
```

## JSON Export

Git diff やレビュー用に deterministic な snapshot を `exports/current.json` へ出力できます。

```bash
npm run export:json
```

この command は `funds`, `categories`, `budget_lines`, `planned_items`, `actual_entries` を `id` 順で書き出し、`db_path`, `output_path`, `record_counts` を JSON で標準出力します。

API から取得する場合は次の endpoint も使えます。

```text
GET /api/exports/json
```

## 収支簿 Excel Export

年度末レビュー、報告前確認、共有用には、人間向けの汎用収支簿 Excel を出力できます。これは運用入力 workbook への書き戻しではなく、import 後の SQLite 内容から作る確認用 workbook です。

Overview の `収支簿Excel出力` は選択中年度全体を出力します。Fund Detail の `収支簿Excel出力` は表示中の単一 fund だけを出力します。

```text
GET /api/exports/ledger.xlsx?year=2026
GET /api/exports/ledger.xlsx?year=2026&fundId=1
```

出力 workbook には `概要`, `予算別サマリ`, `費目別サマリ`, `月別推移`, `計画明細`, `実績明細` が含まれます。`費目別サマリ`, `計画明細`, `実績明細` には横断集計カテゴリを補助列として含めます。`計画明細` は `planned / completed / cancelled` を含む全ステータスを出し、`計画金額` と `残予定額` を分けます。

## Workbook Round-Trip Export

最後に `simple:import` した workbook に、現在の SQLite 内容を書き戻す UI を追加しています。

- `fund_code`, `category_code`, `planned_ref`, `workbook_path` を import 時に保持します
- ナビゲーションの `エクスポート` から workbook export preview を開けます
- preview では保存先 path、最終 import 時刻、シートごとの `追加 / 更新 / 削除` 件数、変更サンプルを確認できます
- `上書き保存` を押すと、最後に import した workbook path へ atomically 上書きします

使う endpoint は次の 2 つです。

```text
GET /api/exports/workbook/preview
POST /api/exports/workbook
```

export は、最新 import に `workbook_path` があり、元ファイルが存在して読み書きできる場合だけ利用できます。最新 import がない、元 workbook が移動されている、または workbook 契約に合わない場合は、preview ダイアログ内に理由を表示して `上書き保存` を無効化します。

## Backup と Restore

SQLite が正本なので、破壊的な import や検証前には backup を取る運用が安全です。

```bash
npm run backup
npm run restore -- ./backups/app-YYYYMMDD-HHMMSS.db --yes
```

- backup は対象 DB の隣の `backups/` に保存されます
- `--yes` がないと restore は実行されません
- restore 前に、現在の DB を同じ `backups/` 配下へ退避 backup してから置き換えます
- 別の DB パスを対象にする場合は `BUDGET_DB_PATH` を指定します

## Workbook の置き方の例

このリポジトリでは workbook の配置場所は固定されていません。ローカル運用では、たとえば `imports/` ディレクトリを作って、その中に年度ごとの workbook を置く形が分かりやすいです。

```bash
mkdir -p imports
npm run simple:import:dry -- imports/budget2026.xlsx
npm run simple:import -- imports/budget2026.xlsx --replace
npm run export:json
```

`budget2026.xlsx` というファイル名は説明用の例です。実際には任意の workbook パスを指定できます。必要なら import 前に backup を取ってください。

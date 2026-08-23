# 公開デモとサンプルデータ

## GitHub Pages 静的デモ

GitHub Pages で demo seed を使った静的デモを公開します。

- URL: <https://t2lab-it.github.io/grant-dashboard/>
- デモ上の編集内容は同じブラウザ内に保存されます
- ヘッダーの `デモを初期状態に戻す` で初期 demo seed に戻せます
- サーバー API / SQLite は使いません
- workbook import/export の実ファイル読み書きは静的デモでは行いません

静的デモは初回確認用です。実データを扱う場合はローカルで起動し、workbook を dry-run してから import してください。

## Demo Seed

バージョン管理された demo seed は `seeds/demo/` にあります。内容は公開デモ用の架空データです。実予算データ、個人情報、認証情報は含めない前提です。

| Path | Purpose |
| --- | --- |
| `seeds/demo/funds.json` | デモ用 fund |
| `seeds/demo/categories.json` | 費目 |
| `seeds/demo/budget_lines.json` | 予算額 |
| `seeds/demo/planned_items.json` | 執行予定 |
| `seeds/demo/actual_entries.json` | 実績 |
| `seeds/demo/demo-budget.xlsx` | 公開用 fixture workbook |

ローカルで demo seed を投入するには次を使います。

```bash
npm run seed:demo
```

- `seed:demo` は `seeds/demo/` を `app.db` に投入します
- 書き込み可能な workbook copy と import 履歴も作成します
- `seed:demo` の直後は export preview / 上書き保存がすぐ使える状態になります
- `BUDGET_DB_PATH` を指定すれば出力先を上書きできます

`seeds/demo/demo-budget.xlsx` を seed JSON から再生成したい場合は、次を使います。

```bash
npm run generate:demo-workbook
```

repo に置かれた `seeds/demo/demo-budget.xlsx` を直接上書きすることはありません。`seed:demo` 実行時に、アプリが触る workbook は書き込み可能な runtime copy として別場所に用意されます。

## Demo の見どころ

`seed:demo` は、初回確認や画面デモのために「いま実装されている機能をひととおり触れる状態」を 1 command で作る用途を想定しています。

- overview で複数 fund の状態差を確認できます
- 2025・2026・2027年度のデータにより、年度横断サマリーで過去・現行・将来の状態を初期表示から比較できます
- fund detail で category 別の予算と planned / actual の流れを確認できます
- imports に履歴が入るので import review が空になりません
- workbook export preview と上書き保存も最初から試せます

## スクリーンショット

README 用スクリーンショットは `docs/assets/screenshots/` に置いています。生成元は demo seed です。

| File | Screen |
| --- | --- |
| `docs/assets/screenshots/overview.png` | overview |
| `docs/assets/screenshots/fund-detail.png` | fund detail |
| `docs/assets/screenshots/workbook-export-preview.png` | workbook export preview |

再生成するには次を使います。

```bash
npm run screenshots:demo
```

この command は既存の e2e demo server と同じ経路を使い、demo seed DB と runtime workbook copy を準備してから Playwright で撮影します。固定デスクトップ viewport で overview、fund detail、workbook export preview を順に保存します。

## Demo Build

ローカルで GitHub Pages 用ビルドを確認するには次を使います。

```bash
npm run build:demo
```

`build:demo` は `VITE_STATIC_DEMO=true vite build` を実行し、Pages fallback 用に `dist/index.html` を `dist/404.html` にコピーしてから TypeScript の型チェックを行います。

# 開発者向けセットアップ

## セットアップ

```bash
npm install
```

このリポジトリは次の構成です。

- フロントエンド: React 19 + TypeScript + Vite
- バックエンド: Fastify
- データベース: SQLite
- workbook 処理: `xlsx`
- テスト: Vitest + Playwright

## 開発起動

クライアントと API サーバーを同時に起動します。

```bash
npm run dev
```

個別に起動したい場合:

```bash
npm run dev:client
npm run dev:server
```

- フロントエンド: `http://127.0.0.1:5173`
- API サーバー: `http://127.0.0.1:3001`

## アプリの画面と API の概要

主な画面:

- `/`: 予算サマリと fund 一覧
- `/imports`: import 履歴
- `/imports/:importId`: import 詳細
- `/funds/:fundId`: fund 詳細
- `/planned-items/new`: 予定項目の作成
- `/actual-entries/new`: 実績項目の作成

主な API ルート:

- `/api/overview`
- `/api/funds/:fundId`
- `/api/planned-items`
- `/api/actual-entries`
- `/api/imports`
- `/api/exports/json`
- `/api/exports/ledger.xlsx?year=2026`
- `/api/exports/ledger.xlsx?year=2026&fundId=1`
- `/api/exports/workbook/preview`
- `/api/exports/workbook`

## データベースと Migration

- 既定の DB: `app.db`
- スキーマ定義: `server/db/schema.sql`
- migration 実行コード: `server/db/migrate.ts`

サーバー起動時に migration は自動実行されます。つまり `npm run dev:server` または `npm run dev` を起動すれば、必要なテーブル作成が適用されます。

別の DB を使う場合:

```bash
BUDGET_DB_PATH=/path/to/custom.db npm run dev:server
```

## Seed Data

バージョン管理された seed データは `seeds/dev/`, `seeds/test/`, `seeds/demo/` にあります。

```bash
npm run seed:dev
npm run seed:test
npm run seed:demo
```

- `seed:dev` は `seeds/dev/` を `app.db` に投入します
- `seed:test` は `seeds/test/` を `app.test.db` に投入します
- `seed:demo` は `seeds/demo/` を `app.db` に投入し、書き込み可能な workbook copy と import 履歴も作成します
- `BUDGET_DB_PATH` を指定すれば出力先を上書きできます

## 公開前安全監査

公開前に、tracked file と `origin` の live branch / tag から辿れる履歴に runtime data や秘密情報らしきパスが残っていないか確認するには次を使います。

```bash
npm run audit:public-safety
```

- 既定では `git fetch --prune --tags origin` を実行してから監査します
- offline や CI の remote-tracking refs だけで確認したい場合は `-- --no-fetch` を付けます
- `seeds/demo/demo-budget.xlsx` と `vendor/xlsx-0.20.3.tgz` は公開用 fixture / 依存パッケージとして許可します
- current tracked text files だけ、secret-like assignment の軽量内容スキャンも行います

## テストとビルド

CI と同等の確認をローカルで行うには、clean install から順に実行します。

```bash
npm ci
npm test
npm run build
npm run build:demo
```

ユニットテストと統合テスト:

```bash
npm test
```

watch モード:

```bash
npm run test:watch
```

E2E テスト:

```bash
npm run test:e2e
```

ビルドと型チェック:

```bash
npm run build
```

GitHub Actions では pull request と `main` push で同じ確認を実行します。静的デモの GitHub Pages deploy は別 workflow が担当します。

## 主要ディレクトリ

- `src/`: React アプリ
- `server/`: Fastify サーバー、DB、route、service、import/export 実装
- `scripts/`: workbook import/export、backup/restore、seed、開発補助スクリプト
- `tests/`: client/server/e2e テスト
- `imports/`: 任意で作る workbook 配置ディレクトリ
- `exports/`: レビュー用 JSON snapshot
- `seeds/`: バージョン管理された seed データ

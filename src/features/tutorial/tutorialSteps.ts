export type DemoTutorialStep = {
  id: string;
  title: string;
  body: string;
  targetId: string;
  route:
    | "overview"
    | "fund-detail"
    | "export-preview"
    | "planned-item-form"
    | "actual-entry-form"
    | "fund-edit";
};

export const standardDemoTutorialSteps: DemoTutorialStep[] = [
  {
    id: "overview-summary",
    title: "予算総額の分析",
    body: "最初から開いている分析パネルで、総額、予定、実績、残高の全体像を確認します。",
    targetId: "overview-summary",
    route: "overview",
  },
  {
    id: "overview-fund-card",
    title: "予算別の状況",
    body: "デモ予算カードから詳細画面へ移動し、個別の費目と支出状況を見ます。",
    targetId: "overview-fund-card",
    route: "overview",
  },
  {
    id: "fund-detail-lists",
    title: "予定と実績の一覧",
    body: "詳細画面では予定項目と精算済み項目を検索、絞り込み、並べ替えできます。",
    targetId: "fund-planned-list",
    route: "fund-detail",
  },
  {
    id: "settle-planned-item",
    title: "予定を精算する",
    body: "精算ボタンから予定項目を実績として登録できます。デモ DB の内容は保存時に変わります。",
    targetId: "planned-settle-action",
    route: "fund-detail",
  },
  {
    id: "export-preview",
    title: "workbook 差分を確認する",
    body: "エクスポート前に workbook の差分を確認できます。上書き保存は任意です。",
    targetId: "workbook-export",
    route: "export-preview",
  },
];

export const advancedDemoTutorialSteps: DemoTutorialStep[] = [
  {
    id: "planned-item-form",
    title: "予定を作成する",
    body: "予定作成では資金と費目を選び、執行予定月、説明、金額を入力してこれから使う予定を登録します。",
    targetId: "planned-item-form",
    route: "planned-item-form",
  },
  {
    id: "actual-entry-form",
    title: "実績を作成する",
    body: "実績作成では予定項目との連携を選べます。未連携でも登録でき、保存後に残り予定額を確認できます。",
    targetId: "actual-entry-form",
    route: "actual-entry-form",
  },
  {
    id: "fund-edit-form",
    title: "予算を編集する",
    body: "予算編集では交付額、費目、費目別予算を更新します。差額を確認してから保存できます。",
    targetId: "fund-edit-form",
    route: "fund-edit",
  },
];

export const demoTutorialSteps = [
  ...standardDemoTutorialSteps,
  ...advancedDemoTutorialSteps,
];

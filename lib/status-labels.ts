export const documentStatusLabels: Record<string, string> = {
  draft: "下書き",
  sent: "送付済み",
  approved: "承認済み",
  ordered: "受注",
  in_progress: "作業中",
  completed: "作業完了",
  issued: "発行済み",
  paid: "入金済み",
  void: "無効",
  cancelled: "取消"
};

export const paymentStatusLabels: Record<string, string> = {
  not_billed: "未請求",
  billed: "請求済み",
  unpaid: "未入金",
  partially_paid: "一部入金",
  partial: "一部入金",
  paid: "入金済み",
  void: "取消",
  cancelled: "取消"
};

export const orderStatusLabels: Record<string, string> = {
  ordered: "受注",
  in_progress: "作業中",
  completed: "作業完了",
  invoiced: "請求化済み",
  cancelled: "取消"
};

export const workStatusLabels: Record<string, string> = {
  not_started: "未着手",
  working: "作業中",
  done: "作業完了",
  on_hold: "保留"
};

export const paymentRecordStatusLabels: Record<string, string> = {
  received: "入金済み",
  partial: "一部入金",
  cancelled: "取消",
  paid: "入金済み",
  failed: "失敗",
  pending: "確認中"
};

export const integrationStatusLabels: Record<string, string> = {
  not_connected: "未設定",
  manual_ready: "設定済み",
  manual_csv: "CSV出力で利用中",
  connected: "接続済み",
  active: "有効",
  planned: "準備中",
  error: "要確認",
  disconnected: "未接続"
};

export const accountingExportStatusLabels: Record<string, string> = {
  completed: "完了",
  failed: "失敗",
  pending: "処理中"
};

export function labelFor(labels: Record<string, string>, value: string | null | undefined, fallback = "未設定") {
  if (!value) return fallback;
  return labels[value] ?? value;
}

/** Shared, read-only interpretation of stored state. Never changes approval/payment. */
export type WorkflowApplication = {
  status: string;
  source_analysis_id?: string | null;
  intake_review_status?: string | null;
  payment_status?: string | null;
  approval_status?: string | null;
  account_status?: string | null;
  store_id?: string | null;
  approved_store_id?: string | null;
  invited_user_id?: string | null;
  approved_user_id?: string | null;
  archived_at?: string | null;
};

export function applicationWorkflow(application: WorkflowApplication) {
  const reviewRequired = Boolean(application.source_analysis_id) && application.intake_review_status !== "not_required";
  const reviewed = reviewRequired && application.intake_review_status === "approved";
  const paid = application.payment_status === "paid" ||
    (!application.payment_status && application.status === "payment_confirmed");
  const issued = application.status === "account_issued" || ["invited", "issued"].includes(application.account_status ?? "");
  const linked = Boolean((application.store_id || application.approved_store_id) && (application.invited_user_id || application.approved_user_id));
  const stopped = application.status === "declined" || application.approval_status === "rejected" || application.intake_review_status === "rejected";
  const stage = application.archived_at ? "archived" : stopped ? "stopped" : issued ? (linked ? "complete" : "inconsistent") : reviewRequired && !reviewed ? "review" : !paid ? "payment" : "activate";
  const labels = {
    archived: "削除済み", stopped: "見送り", inconsistent: "発行情報の確認が必要",
    complete: "利用開始の承認完了", review: "申込内容を確認", payment: "入金を確認", activate: "利用開始を承認"
  };
  return {
    stage, label: labels[stage], reviewRequired, reviewed, paid, issued,
    steps: [
      { key: "review", label: "申込内容の確認", done: reviewed, detail: !reviewRequired ? "事前審査の対象外" : reviewed ? "確認済み" : issued && linked ? "確認記録は未完了・発行済みのため再審査不要" : "店舗・申込者・管理権限を確認", skipped: !reviewRequired || (issued && linked && !reviewed) },
      { key: "payment", label: "入金の確認", done: paid, detail: paid ? "入金確認済み" : "振込実績を確認して記録", skipped: false },
      { key: "activate", label: "利用開始の承認", done: issued && linked, detail: issued && linked ? "アカウント発行済み" : "承認と招待メール発行をまとめて実行", skipped: false }
    ]
  };
}

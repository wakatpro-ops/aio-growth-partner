import Link from "next/link";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { applicationWorkflow, type WorkflowApplication } from "@/lib/admin/application-workflow";

type Props = {
  application: WorkflowApplication & { store_name: string; contact_name: string; email: string; invite_email?: string | null };
  reviewAction: (data: FormData) => Promise<void>;
  paymentAction: (data: FormData) => Promise<void>;
  activateAction: (data: FormData) => Promise<void>;
  resumeAction: (data: FormData) => Promise<void>;
  inviteEmailStatus?: string;
};

export function ApplicationProgress({ application, reviewAction, paymentAction, activateAction, resumeAction, inviteEmailStatus }: Props) {
  const flow = applicationWorkflow(application);
  const activeStep = flow.stage === "review"
    ? { action: reviewAction, name: "review_confirmed", confirmation: "店舗・申込者の連絡先・管理権限を確認しました" }
    : flow.stage === "payment"
      ? { action: paymentAction, name: "payment_confirmed", confirmation: "契約・請求内容と入金を確認しました" }
      : flow.stage === "activate"
        ? { action: activateAction, name: "activation_confirmed", confirmation: "この申込の利用開始と招待メール送信を承認します" }
        : null;

  const stepsAndAction = <>
    <ol className="application-steps" aria-label="確認の進み具合">
      {flow.steps.map((step, index) => <li key={step.key} data-done={step.done} aria-current={flow.stage === step.key ? "step" : undefined}>
        {activeStep && flow.stage === step.key ? <label className="application-step-check">
          <input type="checkbox" name={activeStep.name} value="yes" required />
          <span><strong>{step.label}</strong><span className="application-step-detail">{activeStep.confirmation}</span><span className="application-step-hint">チェック後、下のボタンで確定</span></span>
        </label> : <>
          <span className="application-step-icon" aria-hidden="true">{step.done ? "✓" : step.skipped ? "―" : index + 1}</span>
          <div><strong>{step.label}</strong><p>{step.detail}</p>{!step.done && !step.skipped && <span className="application-step-hint">前の確認が終わると進めます</span>}</div>
        </>}
      </li>)}
    </ol>
    {flow.stage === "review" && <div className="application-next-action">
      <h3>申込内容を確認したら、診断案内を送ります</h3>
      <p>下の申込内容を確認し、上の「申込内容の確認」にチェックしてください。ボタンを押すと、詳細診断を見られるようにして案内メールを送ります。</p>
      <input type="hidden" name="intake_review_status" value="approved" />
      <PendingSubmitButton pendingLabel="確認結果を保存・送信しています...">申込内容を確認して診断案内を送る</PendingSubmitButton>
    </div>}
    {flow.stage === "payment" && <div className="application-next-action">
      <h3>入金を確認したら、記録します</h3><p>契約・請求内容と実際の振込を確認し、上の「入金の確認」にチェックしてください。ボタンを押すと入金確認を記録します。</p>
      <PendingSubmitButton pendingLabel="入金確認を記録しています...">入金確認を記録する</PendingSubmitButton>
    </div>}
    {flow.stage === "activate" && <div className="application-next-action">
      <h3>利用開始を承認できます</h3><p>上の「利用開始の承認」にチェックしてください。ボタンを押すと、承認・アカウント準備・招待メール送信をまとめて行います。送信先：{application.invite_email || application.email}</p>
      <PendingSubmitButton pendingLabel="利用開始を準備しています...">利用開始を承認して招待メールを送る</PendingSubmitButton>
    </div>}
  </>;

  return <section className="card application-progress" aria-labelledby="application-progress-title">
    <div className="section-heading"><div><p className="eyebrow">申込の確認と利用開始</p><h2 id="application-progress-title">{application.store_name}</h2><p>{application.contact_name} 様 · {application.email}</p></div><span className="badge">{flow.label}</span></div>
    {activeStep ? <form action={activeStep.action}>{stepsAndAction}</form> : stepsAndAction}
    {flow.stage === "complete" && <div className="application-next-action"><h3>承認は完了しています</h3><p>承認をやり直す必要はありません。ログイン案内の再送や履歴は、下の「案内メール・送信履歴」で確認できます。</p>
      <p>{inviteEmailStatus === "sent" ? "招待メール：送信済み（受信・ログイン完了を示すものではありません）" : inviteEmailStatus === "failed" || inviteEmailStatus === "skipped" ? "招待メール：未送信・送信失敗。案内メール・送信履歴から再送してください。" : "招待メールの送信結果は履歴を確認してください。"}</p>
      <Link className="button secondary" href={`/stores/${application.store_id || application.approved_store_id}`}>店舗画面を確認する</Link>
    </div>}
    {flow.stage === "inconsistent" && <p className="notice danger">発行済みですが、店舗またはユーザーの紐付けを確認できません。重複発行を防ぐため承認を停止しています。発行情報と対応履歴を確認してください。</p>}
    {flow.stage === "archived" && <p className="notice">削除済みの申込です。操作する場合は申込一覧の「削除済み」から元に戻してください。</p>}
    {flow.stage === "stopped" && <p className="notice">見送りの記録があります。承認は停止しています。確認結果と対応履歴を確認してください。</p>}
    {flow.stage === "stopped" && !flow.issued && <details className="disclosure"><summary>見送りから確認を再開する</summary><form action={resumeAction}>
      <p>入金や過去の対応記録は保持します。承認・メール送信は行いません。</p>
      <label className="application-confirm"><input type="checkbox" name="resume_confirmed" value="yes" required />この申込の確認を再開します</label>
      <PendingSubmitButton className="button secondary">申込の確認を再開する</PendingSubmitButton>
    </form></details>}
  </section>;
}

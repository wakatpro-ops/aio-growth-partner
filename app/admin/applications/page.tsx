import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { PageHeader } from "@/components/ui/page-header";
import { archiveApplicationAction, listApplications, restoreApplicationAction } from "@/lib/admin/applications";
import { applicationWorkflow } from "@/lib/admin/application-workflow";

export default async function AdminApplicationsPage({ searchParams }: { searchParams: Promise<{ view?: string; archived?: string; restored?: string }> }) {
  const query = await searchParams;
  const showArchived = query.view === "archived";
  const applications = await listApplications({ includeArchived: showArchived });
  const pending = applications.filter(item => !["complete", "stopped", "archived"].includes(applicationWorkflow(item).stage));
  const visible = query.view === "pending" ? pending : applications;
  return <AppShell>
    <PageHeader title="申し込み管理" description="申込ごとに、次に必要な確認を進めます。利用開始の承認は詳細画面でまとめて行えます。" action={<Link className="button secondary" href="/admin">運営トップへ</Link>} />
    {query.archived && <p className="notice success">申込を削除済みへ移しました。店舗・ユーザー・履歴は保持しています。</p>}
    {query.restored && <p className="notice success">申込を元に戻しました。</p>}
    <nav className="button-row" aria-label="申込の表示切り替え">
      <Link className={`button ${query.view === "pending" ? "" : "secondary"}`} href="/admin/applications?view=pending">要対応{!showArchived ? ` ${pending.length}件` : ""}</Link>
      <Link className={`button ${!query.view ? "" : "secondary"}`} href="/admin/applications">すべて</Link>
      <Link className={`button ${showArchived ? "" : "secondary"}`} href="/admin/applications?view=archived">削除済み</Link>
    </nav>
    <section className="application-list" aria-label="申込一覧">
      {visible.map(application => {
        const flow = applicationWorkflow(application);
        return <article className="card application-list-row" key={application.id}>
          <div><p className="muted">{new Date(application.created_at).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })} 申込</p><h2>{application.store_name}</h2><p>{application.contact_name} 様</p><p className="muted">{application.email}</p></div>
          <div><span className="badge">{flow.label}</span><ul className="application-list-steps" aria-label="確認の進み具合">{flow.steps.map((step, index) => <li key={step.key}>{step.done ? "✓" : step.skipped ? "―" : index + 1} {step.label}：{step.done ? "完了" : step.skipped ? step.detail : "未完了"}</li>)}</ul></div>
          <div className="application-list-actions"><Link className="button secondary" href={`/admin/applications/${application.id}`}>{["complete", "stopped", "archived", "inconsistent"].includes(flow.stage) ? "内容・履歴を確認" : flow.label}</Link>
            {showArchived ? <form action={restoreApplicationAction.bind(null, application.id)}><PendingSubmitButton className="button secondary">元に戻す</PendingSubmitButton></form> : <details><summary>その他</summary><form action={archiveApplicationAction.bind(null, application.id)}><ConfirmSubmitButton message={`「${application.store_name}」の申込を削除済みへ移します。履歴・店舗・ユーザーは保持し、元に戻せます。`}>削除</ConfirmSubmitButton></form></details>}
          </div>
        </article>;
      })}
      {!visible.length && <p className="card empty">{query.view === "pending" ? "対応が必要な申込はありません。" : showArchived ? "削除済みの申込はありません。" : "まだ申し込みはありません。"}</p>}
    </section>
    <p className="muted">直近100件の申込履歴を表示しています。店舗の情報は「店舗管理」で確認できます。</p>
  </AppShell>;
}

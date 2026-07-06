import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { listAuditLogs, listPdfIssues } from "@/lib/phase6/compliance-data";
import { getStore } from "@/lib/stores";

function dateTime(value: string) {
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tokyo" }).format(new Date(value));
}

export default async function AuditLogsPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const store = await getStore(storeId);
  const industry = getIndustryConfig(store.industry_type_key);
  const [logs, pdfIssues] = await Promise.all([listAuditLogs(store.id), listPdfIssues(store.id)]);

  return (
    <AppShell>
      <PageHeader eyebrow={industry.name} title="操作ログ・PDF発行履歴" description="請求、入金、CSV出力、PDF発行などの証跡を確認します。" />
      <StoreBusinessNav store={store} />

      <section className="card">
        <h2>PDF発行・再発行履歴</h2>
        <table className="table">
          <thead><tr><th>日時</th><th>請求書番号</th><th>種別</th><th>ファイル名</th></tr></thead>
          <tbody>
            {pdfIssues.map((issue) => (
              <tr key={issue.id}>
                <td>{dateTime(issue.issued_at)}</td>
                <td>{issue.document_number}</td>
                <td><span className="badge">{issue.issue_type === "reissue" ? "再発行" : "発行"}</span></td>
                <td>{issue.file_name ?? "-"}</td>
              </tr>
            ))}
            {pdfIssues.length === 0 ? <tr><td colSpan={4}>まだPDF発行履歴はありません。</td></tr> : null}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>操作ログ</h2>
        <table className="table">
          <thead><tr><th>日時</th><th>操作</th><th>対象</th><th>内容</th></tr></thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id}>
                <td>{dateTime(log.created_at)}</td>
                <td>{log.action_type}</td>
                <td>{log.target_type}</td>
                <td>{log.message}</td>
              </tr>
            ))}
            {logs.length === 0 ? <tr><td colSpan={4}>まだ操作ログはありません。</td></tr> : null}
          </tbody>
        </table>
      </section>
    </AppShell>
  );
}

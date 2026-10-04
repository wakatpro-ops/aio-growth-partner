import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { getAiUsageDashboard, saveAiUsageMonthlySettingsAction } from "@/lib/ai-usage/admin";
import { AiUsageDashboardView } from "./usage-dashboard";
import { MonthlyUsageSettings } from "./usage-settings";
import styles from "./usage.module.css";

export const dynamic = "force-dynamic";

export default async function AdminAiLogsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const query = await searchParams;
  // The loader independently checks platform-admin access before reading data.
  const dashboard = await getAiUsageDashboard(typeof query.month === "string" ? query.month : undefined);
  return <AppShell>
    <PageHeader eyebrow="運営専用 · AI利用状況" title="AI利用料と稼働状況" description="どこで、どれくらいAIを使っているか。記録された使用量から費用を確認します。" action={<Link className="button secondary" href="/admin">管理者トップへ</Link>} />
    <div className={styles.workspace}>
      <AiUsageDashboardView dashboard={dashboard} />
        {dashboard.state === "ready" ? <MonthlyUsageSettings key={dashboard.month} month={dashboard.month} settings={dashboard.settings} saveAction={saveAiUsageMonthlySettingsAction} /> : <p className={styles.note}>計算条件の変更は、現在の設定を正常に読み込んでから行えます。</p>}
    </div>
  </AppShell>;
}

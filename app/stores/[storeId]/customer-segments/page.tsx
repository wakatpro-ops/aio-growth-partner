import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { PageHeader } from "@/components/ui/page-header";
import { getCustomerSegmentSummaries } from "@/lib/customer-crm";
import { getStore } from "@/lib/stores";

export default async function CustomerSegmentsPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const store = await getStore(storeId);
  const segments = await getCustomerSegmentSummaries(store.id);
  const total = segments.find((segment) => segment.key === "all")?.count ?? 0;

  return (
    <AppShell>
      <PageHeader
        eyebrow="集客・顧客"
        title="顧客セグメント"
        description="顧客を別の場所へ移さず、来店状況と連絡許可から対象者を自動で整理します。"
        action={<Link className="button" href={`/stores/${store.id}/customer-messages`}>メッセージを作る</Link>}
      />
      <StoreBusinessNav store={store} />
      <section className="ai-question-panel">
        <p className="eyebrow">顧客データの活用状況</p>
        <h2>{total.toLocaleString("ja-JP")}人の顧客を、再来店につながる条件で整理しました。</h2>
        <p>名前・電話番号などの個人情報や会話メモはAIへ送りません。AIメッセージには、セグメント名と人数などの集計だけを使用します。</p>
      </section>
      <section className="hub-grid">
        {segments.map((segment) => (
          <Link className={segment.key === "inactive_90" ? "hub-link primary" : "hub-link"} href={`/stores/${store.id}/customers?segment=${segment.key}`} key={segment.key}>
            <p className="eyebrow">{segment.count.toLocaleString("ja-JP")}人</p>
            <h2>{segment.label}</h2>
            <p>{segment.description}</p>
            <strong>{segment.recommendedAction} →</strong>
          </Link>
        ))}
      </section>
    </AppShell>
  );
}

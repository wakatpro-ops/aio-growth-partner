import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { PageHeader } from "@/components/ui/page-header";
import { getStore } from "@/lib/stores";

export default async function AcquisitionHubPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const store = await getStore(storeId);
  const links = [
    ["AIO改善", "AIにおすすめされるための不足情報と優先順位を確認します。", `/stores/${store.id}/aio-improvement`, "改善状況を見る"],
    ["顧客・再来店", "顧客情報の一括取込、セグメント、会話メモ、再来店メッセージを管理します。", `/stores/${store.id}/customer-segments`, "顧客セグメントを見る"],
    ["集客アクション", "Google投稿、SNS、案内文などの下書きをまとめて管理します。", `/stores/${store.id}/growth-actions`, "下書きと実施状況を見る"],
    ["集客カレンダー", "いつ、どの媒体へ出すかを予定で確認します。", `/stores/${store.id}/growth-calendar`, "予定を見る"],
    ["Google連携", "Googleビジネスプロフィールなどの接続・反映先を確認します。", `/stores/${store.id}/settings/google`, "Google連携を確認"],
    ["投稿文を作る", "店舗情報を使って投稿文の案を作成します。", `/stores/${store.id}/marketing`, "投稿文作成へ"]
  ];
  return (
    <AppShell>
      <PageHeader eyebrow="集客" title="お客様に見つけてもらう" description="AIO改善、Google、SNS、投稿予定を目的別にまとめています。" />
      <StoreBusinessNav store={store} />
      <section className="hub-grid">
        {links.map(([title, body, href, action], index) => (
          <Link className={index === 0 ? "hub-link primary" : "hub-link"} href={href} key={href}>
            <h2>{title}</h2><p>{body}</p><strong>{action} →</strong>
          </Link>
        ))}
      </section>
    </AppShell>
  );
}

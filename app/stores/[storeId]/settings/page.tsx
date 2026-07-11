import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import {
  StoreAiLearnedFeedback,
  StoreAiNextActions,
  StoreAiReadinessPanel
} from "@/components/store-ai/store-ai-readiness-panel";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { getStore } from "@/lib/stores";
import { getStoreAiReadiness } from "@/lib/store-ai/readiness";

export default async function StoreSettingsHomePage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const store = await getStore(storeId);
  const industry = getIndustryConfig(store.industry_type_key);
  const readiness = await getStoreAiReadiness(store);

  const settings = [
    {
      title: "店舗プロフィール",
      body: "店舗名、URL、Google情報、業態別の強みを整えると、AIの投稿・診断・提案が店舗らしくなります。",
      href: `/stores/${store.id}`,
      badge: "基礎情報"
    },
    {
      title: "請求書設定",
      body: "請求書番号や事業者情報を確認すると、見積・請求・入金管理を安心して使えます。",
      href: `/stores/${store.id}/settings/invoice`,
      badge: "請求業務に必要"
    },
    {
      title: "Google連携",
      body: "Google接続を整えると、Gmail下書きやカレンダー予定、投稿支援の導線が使いやすくなります。",
      href: `/stores/${store.id}/settings/google`,
      badge: "集客提案に必要"
    },
    {
      title: "外部連携",
      body: "Stripe決済URLやfreee向けCSVなど、請求・入金・会計の情報を店舗データに結び付けます。",
      href: `/stores/${store.id}/settings/integrations`,
      badge: "運用情報"
    },
    {
      title: "チャネル設定",
      body: "SNSや案内文の出し先を整理すると、集客アクションを媒体ごとに管理しやすくなります。",
      href: `/stores/${store.id}/settings/channels`,
      badge: "AI精度UP"
    }
  ];

  return (
    <AppShell>
      <PageHeader
        eyebrow={industry.name}
        title="店舗AI設定"
        description="店舗AIが理解する情報を整えます。設定が増えるほど、投稿・請求・売上分析・顧客フォローの提案が具体化します。"
      />
      <StoreBusinessNav store={store} />
      <StoreAiReadinessPanel readiness={readiness} storeId={store.id} />
      <section className="grid cols-2">
        <StoreAiNextActions readiness={readiness} />
        <StoreAiLearnedFeedback readiness={readiness} />
      </section>
      <section className="card">
        <h2>設定メニュー</h2>
        <div className="action-card-list">
          {settings.map((setting) => (
            <article className="action-card" key={setting.href}>
              <div className="action-card-head">
                <span className="badge badge-strong">{setting.badge}</span>
              </div>
              <h3>{setting.title}</h3>
              <p>{setting.body}</p>
              <Link className="button secondary" href={setting.href}>開く</Link>
            </article>
          ))}
        </div>
      </section>
    </AppShell>
  );
}

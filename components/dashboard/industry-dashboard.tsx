import { getIndustryConfig } from "@/config/industries";
import { isFeatureEnabled, resolveFeatureFlags } from "@/lib/feature-flags/resolve-feature-flags";
import type { Store } from "@/types/domain";
import { DashboardCard } from "./dashboard-card";

const cardCopy: Record<string, { title: string; body: string; metric?: string; feature?: string }> = {
  store_profile_completion: {
    title: "プロフィール充実度",
    body: "AI検索と店舗集客に使う基本情報の整備状況です。",
    metric: "82%"
  },
  ai_post_generation: {
    title: "AI投稿文生成",
    body: "店舗情報と業態別プロンプトから投稿文を生成できます。",
    feature: "ai_post_generation"
  },
  review_reply: {
    title: "クチコミ返信",
    body: "評価と本文に合わせて、丁寧な返信文を作成します。",
    feature: "ai_review_reply"
  },
  aio_score: {
    title: "AIOスコア",
    body: "AI検索で理解されやすい店舗情報になっているかを診断します。",
    metric: "78"
  },
  instagram_post: {
    title: "Instagram投稿",
    body: "業態やプランに応じて表示・非表示を切り替えます。",
    feature: "instagram_post"
  },
  repair_service_visibility: {
    title: "修理サービス可視化",
    body: "車検、点検、修理相談などの対応範囲を明確にします。",
    feature: "repair_services"
  }
};

export function IndustryDashboard({ store }: { store: Store }) {
  const industry = getIndustryConfig(store.industry_type_key);
  const flags = resolveFeatureFlags(store);
  const cards = industry.dashboardCards
    .map((cardKey) => cardCopy[cardKey])
    .filter((card) => card && (!card.feature || isFeatureEnabled(flags, card.feature)));

  return (
    <div className="grid cols-3">
      {cards.map((card) => (
        <DashboardCard key={card.title} title={card.title} body={card.body} metric={card.metric} />
      ))}
    </div>
  );
}

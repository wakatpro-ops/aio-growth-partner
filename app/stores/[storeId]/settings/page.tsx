import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import {
  StoreAiLearnedFeedback,
  StoreAiNextActions,
  StoreAiReadinessPanel
} from "@/components/store-ai/store-ai-readiness-panel";
import { PageHeader } from "@/components/ui/page-header";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { getIndustryConfig } from "@/config/industries";
import { getStore } from "@/lib/stores";
import { getStoreAiReadiness } from "@/lib/store-ai/readiness";
import { getCurrentUserAccess } from "@/lib/auth/server";
import { archiveStoreAction } from "../../actions";

export default async function StoreSettingsHomePage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const store = await getStore(storeId);
  const industry = getIndustryConfig(store.industry_type_key);
  const readiness = await getStoreAiReadiness(store);
  const access = await getCurrentUserAccess();
  const canArchiveStore = Boolean(access?.isPlatformAdmin || access?.organizationRoles[store.organization_id] === "org_owner");
  const canManageStaff = canArchiveStore;

  const settings = [
    ...(canManageStaff ? [{
      title: "スタッフアカウント",
      body: "この店舗だけを利用できるスタッフを招待し、登録・編集・閲覧のみの権限を設定します。",
      href: `/stores/${store.id}/settings/staff`,
      badge: "店舗ごとの権限"
    }] : []),
    {
      title: "店舗プロフィール",
      body: "店舗名、URL、Google情報、業態別の強みを整えると、AIの投稿・診断・提案が店舗らしくなります。",
      href: `/stores/${store.id}/settings/profile`,
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
    },
    {
      title: "削除済みデータ",
      body: "削除した商品・顧客・書類・下書きなどを確認し、必要なものを元に戻せます。",
      href: `/stores/${store.id}/archives`,
      badge: "データ管理"
    }
  ];

  return (
    <AppShell>
      <PageHeader
        eyebrow={industry.name}
        title="設定"
        description="店舗情報、外部サービス、請求に関する設定をまとめています。"
      />
      <StoreBusinessNav store={store} />
      {canArchiveStore ? (
        <section className="card">
          <h2>別の店舗を追加する</h2>
          <p>同じ法人契約のまま、店舗数・利用ユーザー数の追加料金なしで店舗を登録できます。</p>
          <Link className="button" href="/stores/new">店舗を追加</Link>
        </section>
      ) : null}
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
      {canArchiveStore ? (
        <section className="card danger-zone">
          <h2>店舗を削除</h2>
          <p>画面上は削除されますが、データは消去せず「削除済み」に移動します。請求・入金・顧客・投稿などの関連データは保持され、あとから元に戻せます。</p>
          <form action={archiveStoreAction.bind(null, store.id)}>
            <ConfirmSubmitButton message={`「${store.name}」を削除済みに移します。データは保持され、あとから元に戻せます。`}>店舗を削除</ConfirmSubmitButton>
          </form>
        </section>
      ) : null}
    </AppShell>
  );
}

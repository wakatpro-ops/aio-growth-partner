import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { ApplicationIntakeSummary } from "@/components/onboarding/application-intake-summary";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { isDemoStore, planForKey, storeDataModeDescription, storeDataModeLabel } from "@/lib/mvp/status";
import { betaCautions, betaManualOrPlannedFeatures, betaOnboardingSteps, betaReadyFeatures, getStoreBetaChecklist } from "@/lib/mvp/release-prep";
import { getMvpWorkspaceSummary, getStore, getStoreOnboardingSnapshot, listProductionStores } from "@/lib/stores";

const steps = [
  {
    title: "店舗プロフィール",
    body: "店舗名、住所、電話、公式サイト、業態別の強みを整えます。",
    href: (storeId: string) => `/stores/${storeId}`
  },
  {
    title: "請求書設定",
    body: "請求書番号、登録番号、発行事業者名を確認します。",
    href: (storeId: string) => `/stores/${storeId}/settings/invoice`
  },
  {
    title: "商品・顧客",
    body: "商品・サービス、顧客情報を登録して見積と請求に使います。",
    href: (storeId: string) => `/stores/${storeId}/items`
  },
  {
    title: "売上データ",
    body: "CSV / Excel取り込みで外部レジの売上を整理します。",
    href: (storeId: string) => `/stores/${storeId}/data-imports`
  },
  {
    title: "Google / SNS支援",
    body: "Gmail、Googleカレンダー、GBP手動投稿支援、SNS下書きを確認します。",
    href: (storeId: string) => `/stores/${storeId}/settings/google`
  },
  {
    title: "集客アクション",
    body: "AI提案を投稿、案内、POP、LINE文面として管理します。",
    href: (storeId: string) => `/stores/${storeId}/growth-actions`
  }
];

export default async function OnboardingPage({
  searchParams
}: {
  searchParams: Promise<{ storeId?: string; created?: string }>;
}) {
  const { storeId, created } = await searchParams;
  const productionStores = await listProductionStores();
  const fallbackStore = productionStores[0];
  const selectedStore = storeId ? await getStore(storeId) : fallbackStore;
  const summary = await getMvpWorkspaceSummary();
  const plan = planForKey(summary.planKey);
  const industry = selectedStore ? getIndustryConfig(selectedStore.industry_type_key) : null;
  const betaChecklist = selectedStore ? await getStoreBetaChecklist(selectedStore) : [];
  const intakeSnapshot = selectedStore ? await getStoreOnboardingSnapshot(selectedStore.id) : null;

  return (
    <AppShell>
      <PageHeader
        eyebrow="初回導入"
        title="初回オンボーディング"
        description="最初の店舗を利用開始できる状態にするための確認画面です。"
        action={<Link className="button" href="/stores/new">実店舗を追加</Link>}
      />
      {created ? <p className="notice success">店舗を作成しました。次の順番で初期設定を進めてください。</p> : null}

      {!selectedStore ? (
        <section className="card">
          <h2>まだ実店舗がありません</h2>
          <p>利用する店舗を1件作成してください。作成後、請求書設定、商品・顧客、Google連携の順に確認できます。</p>
          <Link className="button" href="/stores/new">最初の店舗を作成</Link>
        </section>
      ) : (
        <>
          <section className="grid cols-3">
            <article className="card">
              <p className="muted">対象店舗</p>
              <h2>{selectedStore.name}</h2>
              <p><span className="badge">{industry?.name}</span> <span className="badge">{storeDataModeLabel(selectedStore)}</span></p>
              <p>{storeDataModeDescription(selectedStore)}</p>
            </article>
            <article className="card">
              <p className="muted">現在のプラン</p>
              <h2>{plan.name}</h2>
              <p>{plan.monthlyPriceLabel}</p>
              <p>店舗 {summary.productionStores.length} / {plan.limits.stores}、AI {summary.counts.aiLogs} / {plan.limits.aiGenerations}</p>
            </article>
            <article className="card">
              <p className="muted">Google Business Profile</p>
              <h2>投稿支援</h2>
              <p>投稿文、CTA、URLを整理し、Google管理画面に反映しやすい形で確認できます。</p>
            </article>
          </section>

          {isDemoStore(selectedStore) ? (
            <p className="notice danger">現在の対象は確認用店舗です。実際に利用する店舗は `/stores/new` から作成してください。</p>
          ) : null}

          {intakeSnapshot ? <ApplicationIntakeSummary content={intakeSnapshot.content} /> : null}

          <section className="card">
            <h2>初回にやること</h2>
            <ol className="compact-list">
              {betaOnboardingSteps.map((step) => {
                const href = typeof step.href === "function" ? step.href(selectedStore.id) : step.href;
                return (
                  <li key={step.label}>
                    <strong>{step.label}</strong>
                    <p className="muted">{step.detail}</p>
                    <Link className="button secondary" href={href}>開く</Link>
                  </li>
                );
              })}
            </ol>
          </section>

          <section className="grid cols-2">
            <article className="card">
              <h2>利用できること</h2>
              <div className="grid">
                {betaReadyFeatures.map((feature) => <span className="badge badge-strong" key={feature}>{feature}</span>)}
              </div>
            </article>
            <article className="card">
              <h2>確認しながら使う機能</h2>
              <p className="muted">外部サービス側の画面でも内容を確認しながら利用します。</p>
              <div className="grid">
                {betaManualOrPlannedFeatures.map((feature) => <span className="badge" key={feature}>{feature}</span>)}
              </div>
            </article>
          </section>

          <section className="card">
            <h2>導入チェックリスト</h2>
            <table className="table">
              <tbody>
                {betaChecklist.map((item) => (
                  <tr key={item.label}>
                    <th>{item.label}</th>
                    <td><span className={item.done ? "badge badge-strong" : "badge"}>{item.done ? "OK" : "未確認"}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="card">
            <h2>重要な注意</h2>
            <ul className="compact-list">
              {betaCautions.map((caution) => <li key={caution}>{caution}</li>)}
            </ul>
            <div className="button-row">
              <Link className="button secondary" href="/legal">規約・ポリシー</Link>
              <Link className="button secondary" href="/help">操作方法</Link>
              <Link className="button secondary" href="/beta-notes">利用時の注意事項</Link>
            </div>
          </section>

          <section className="card">
            <h2>機能別ショートカット</h2>
            <div className="grid cols-3">
              {steps.map((step) => (
                <article className="card" key={step.title}>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                  <Link className="button secondary" href={step.href(selectedStore.id)}>開く</Link>
                </article>
              ))}
            </div>
          </section>

          <section className="card">
            <h2>実店舗データの確認</h2>
            <table className="table">
              <tbody>
                <tr><th>請求書</th><td>{summary.counts.invoices.toLocaleString("ja-JP")}件</td></tr>
                <tr><th>CSV / Excel取込</th><td>{summary.counts.imports.toLocaleString("ja-JP")}件</td></tr>
                <tr><th>集客アクション</th><td>{summary.counts.growthActions.toLocaleString("ja-JP")}件</td></tr>
                <tr><th>AI生成ログ</th><td>{summary.counts.aiLogs.toLocaleString("ja-JP")}件</td></tr>
              </tbody>
            </table>
          </section>
        </>
      )}
    </AppShell>
  );
}

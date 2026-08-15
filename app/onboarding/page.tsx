import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { ApplicationIntakeSummary } from "@/components/onboarding/application-intake-summary";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { getAioImprovementWorkspace } from "@/lib/aio-improvement";
import { getStore, getStoreOnboardingSnapshot, listProductionStores } from "@/lib/stores";

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ storeId?: string; created?: string }> }) {
  const { storeId, created } = await searchParams;
  const stores = await listProductionStores();
  const selectedStore = storeId ? await getStore(storeId) : stores[0];

  if (!selectedStore) {
    return (
      <AppShell>
        <PageHeader eyebrow="はじめての方へ" title="まず店舗を登録しましょう" description="申し込み内容をもとに、AIにおすすめされやすくする最初の改善を提案します。" />
        <section className="first-use-panel">
          <p className="step-label">STEP 1 / 1</p>
          <h2>店舗の基本情報を登録</h2>
          <p>最初から請求や税の設定をする必要はありません。店舗情報を登録すると、AIO改善が始まります。</p>
          <Link className="button" href="/stores/new">店舗情報を登録する</Link>
        </section>
      </AppShell>
    );
  }

  const aioWorkspace = await getAioImprovementWorkspace(selectedStore.id);
  const readiness = aioWorkspace.readiness;
  const industry = getIndustryConfig(selectedStore.industry_type_key);
  const intakeSnapshot = await getStoreOnboardingSnapshot(selectedStore.id);
  const priority = readiness.nextBestActions[0];
  const activeTask = aioWorkspace.activeTask;

  return (
    <AppShell>
      <PageHeader
        eyebrow="はじめての方へ"
        title={`${selectedStore.name}の最初のAIO改善`}
        description="設定を全部終える画面ではありません。まず、AIにおすすめされるための改善を1件だけ進めます。"
      />
      {created ? <p className="notice success">店舗を登録しました。申し込み内容から最初の改善を用意しました。</p> : null}

      <section className="ai-question-panel">
        <p className="eyebrow">お客様がAIに尋ねる質問の例</p>
        <h2>「{readiness.targetQuestions[0]}」</h2>
        <p>{selectedStore.name}がおすすめされる根拠を、店舗情報と外部の公開情報に増やしていきます。</p>
      </section>

      <section className="card first-priority-card">
        <div className="section-heading">
          <div><p className="step-label">最初にやること</p><h2>{activeTask?.title ?? priority?.label ?? "外部への反映を確認"}</h2></div>
          <span className="badge priority-high">最優先</span>
        </div>
        <p>{activeTask?.description ?? priority?.benefit ?? "整えた内容をGoogleやWebへ反映できる状態にします。"}</p>
        <div className="button-row">
          <Link className="button" href={activeTask ? `/stores/${selectedStore.id}/aio-improvement/tasks/${activeTask.id}` : `/stores/${selectedStore.id}/aio-improvement`}>{activeTask ? "進行中の改善を続ける" : "改善内容を確認する"}</Link>
          <Link className="button secondary" href={`/stores/${selectedStore.id}`}>店舗トップを先に見る</Link>
        </div>
      </section>

      <section className="grid cols-3 first-use-summary">
        <article className="static-card"><span>業態</span><strong>{industry.name}</strong></article>
        <article className="static-card"><span>AIおすすめ準備度</span><strong>{readiness.score}%</strong></article>
        <article className="static-card"><span>外部反映</span><strong>{readiness.publicationStatus.contentCreated ? "下書きあり" : "これから"}</strong></article>
      </section>

      {intakeSnapshot ? (
        <details className="card disclosure">
          <summary>申し込み時の情報を確認する</summary>
          <ApplicationIntakeSummary content={intakeSnapshot.content} />
        </details>
      ) : null}
    </AppShell>
  );
}

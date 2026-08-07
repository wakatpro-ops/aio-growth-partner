import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { getStore } from "@/lib/stores";
import { getStoreAiReadiness } from "@/lib/store-ai/readiness";

function currentDescription(description?: string) {
  return description?.trim() || "店舗の特徴や、どんなお客様に向いているかがまだ書かれていません。";
}

export default async function AioImprovementPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const store = await getStore(storeId);
  const industry = getIndustryConfig(store.industry_type_key);
  const readiness = await getStoreAiReadiness(store);
  const priority = readiness.nextBestActions[0];

  return (
    <AppShell>
      <PageHeader
        eyebrow="AIO改善"
        title="AIにおすすめされやすくする"
        description="AIの回答を保証する点数ではなく、店舗情報をAIが参照・説明しやすくするための準備状況です。"
      />
      <StoreBusinessNav store={store} />

      <section className="ai-question-panel">
        <p className="eyebrow">目指す質問</p>
        <h2>「{readiness.targetQuestions[0]}」</h2>
        <p>この質問に対して、{store.name}をおすすめする根拠が外部から確認できる状態を目指します。</p>
        <div className="question-chips">
          {readiness.targetQuestions.slice(1).map((question) => <span key={question}>{question}</span>)}
        </div>
      </section>

      <section className="grid cols-2">
        <article className="card">
          <p className="eyebrow">AIおすすめ準備度</p>
          <h2>{readiness.score}%</h2>
          <p>{readiness.headline}</p>
          <div className="readiness-meter"><span style={{ width: `${readiness.score}%` }} /></div>
        </article>
        <article className="card">
          <p className="eyebrow">外部への反映状況</p>
          <div className="status-list">
            <span><b>Google連携</b><em>{readiness.publicationStatus.googleConnected ? "接続・URL確認済み" : "未確認"}</em></span>
            <span><b>改善コンテンツ</b><em>{readiness.publicationStatus.contentCreated ? "下書きあり" : "未作成"}</em></span>
          </div>
          <p className="muted">準備度が上がっても、外部へ公開しなければ反映は完了しません。</p>
        </article>
      </section>

      <section className="card" id="priority">
        <div className="section-heading">
          <div><p className="eyebrow">最初の改善は1件だけ</p><h2>{priority?.label ?? "外部への反映を確認"}</h2></div>
          <span className="badge priority-high">最優先</span>
        </div>
        <p>{priority?.benefit ?? "整えた店舗情報をGoogle・Web・SNSへ反映します。"}</p>
        <div className="comparison-grid">
          <article className="comparison before">
            <span>現在</span>
            <p>{currentDescription(store.description)}</p>
          </article>
          <article className="comparison after">
            <span>改善すると</span>
            <p>{industry.name}としての提供内容、地域、得意なお客様、選ばれる理由を具体的に説明できる状態になります。</p>
          </article>
        </div>
        <div className="button-row">
          <Link className="button" href={priority?.href ?? `/stores/${store.id}/acquisition`}>{priority ? `${priority.label}を改善する` : "反映先を確認する"}</Link>
          <Link className="button secondary" href={`/stores/${store.id}`}>店舗トップへ戻る</Link>
        </div>
      </section>

      <section className="card">
        <h2>改善の順番</h2>
        <ol className="progress-list">
          {readiness.items.map((item) => (
            <li className={item.complete ? "done" : ""} key={item.key}>
              <span>{item.complete ? "✓" : ""}</span>
              <div><strong>{item.label}</strong><p>{item.value}</p></div>
              <Link href={item.href}>{item.complete ? "確認する" : "改善する"} →</Link>
            </li>
          ))}
        </ol>
      </section>
    </AppShell>
  );
}

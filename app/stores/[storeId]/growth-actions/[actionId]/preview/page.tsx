import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { isFeatureEnabled, resolveFeatureFlags } from "@/lib/feature-flags/resolve-feature-flags";
import { getGrowthAction, growthActionChannelLabel } from "@/lib/phase5/growth-actions";
import { getStore } from "@/lib/stores";
import type { GrowthActionDraft } from "@/types/phase5";

function fullText(draft: GrowthActionDraft) {
  return [draft.body, draft.hashtags.join(" "), draft.call_to_action].filter(Boolean).join("\n\n");
}

function PreviewCard({ draft }: { draft: GrowthActionDraft }) {
  const text = fullText(draft);
  if (draft.channel === "instagram") {
    return (
      <article className="preview-card instagram-preview">
        <div className="preview-media">画像案</div>
        <h3>{draft.title}</h3>
        <p>{text}</p>
      </article>
    );
  }
  if (draft.channel === "line") {
    return (
      <article className="preview-card line-preview">
        <p className="line-bubble">{text}</p>
      </article>
    );
  }
  if (draft.channel === "store_pop") {
    return (
      <article className="preview-card pop-preview">
        <h2>{draft.title}</h2>
        <p>{draft.body}</p>
        {draft.call_to_action ? <strong>{draft.call_to_action}</strong> : null}
      </article>
    );
  }
  if (draft.channel === "review_reply") {
    return (
      <article className="preview-card review-preview">
        <p className="muted">お客様の声への返信</p>
        <p>{text}</p>
      </article>
    );
  }
  if (draft.channel === "customer_message") {
    return (
      <article className="preview-card mail-preview">
        <p className="muted">件名: {draft.title}</p>
        <p>{text}</p>
      </article>
    );
  }
  return (
    <article className="preview-card google-preview">
      <p className="muted">Googleビジネスプロフィール投稿</p>
      <h3>{draft.title}</h3>
      <p>{text}</p>
    </article>
  );
}

export default async function GrowthActionPreviewPage({
  params
}: {
  params: Promise<{ storeId: string; actionId: string }>;
}) {
  const { storeId, actionId } = await params;
  const store = await getStore(storeId);
  const flags = resolveFeatureFlags(store);
  if (!isFeatureEnabled(flags, "channel_previews")) notFound();
  const action = await getGrowthAction(store.id, actionId);
  if (!action) notFound();
  const industry = getIndustryConfig(store.industry_type_key);

  return (
    <AppShell>
      <PageHeader eyebrow={industry.name} title="チャネル別プレビュー" description="投稿、配信、返信、POPの見え方を確認します。" />
      <StoreBusinessNav store={store} />
      <section className="grid cols-2">
        {(action.drafts ?? []).map((draft) => (
          <div className="card" key={draft.id}>
            <p className="eyebrow">{growthActionChannelLabel(draft.channel)}</p>
            <PreviewCard draft={draft} />
          </div>
        ))}
      </section>
      <div className="form-actions">
        <Link className="button" href={`/stores/${store.id}/growth-actions/${action.id}/edit`}>編集する</Link>
        <Link className="button secondary" href={`/stores/${store.id}/growth-actions/${action.id}`}>詳細へ戻る</Link>
      </div>
    </AppShell>
  );
}

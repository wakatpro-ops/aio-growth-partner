import type { MarketingDraft } from "@/types/phase3";

export function MarketingDraftForm({
  action,
  draft,
  labels
}: {
  action: (formData: FormData) => void;
  draft?: MarketingDraft | null;
  labels: { draft: string };
}) {
  return (
    <form className="card form" action={action}>
      <div className="grid cols-2">
        <div className="field">
          <label htmlFor="channel">投稿先</label>
          <select id="channel" name="channel" defaultValue={draft?.channel ?? "instagram"}>
            <option value="instagram">Instagram</option>
            <option value="google_business_profile">Googleビジネスプロフィール</option>
            <option value="other">その他</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="status">状態</label>
          <select id="status" name="status" defaultValue={draft?.status ?? "draft"}>
            <option value="draft">下書き</option>
            <option value="approved">承認済み</option>
            <option value="published">公開済み</option>
            <option value="archived">保管</option>
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor="title">{labels.draft}タイトル</label>
        <input id="title" name="title" defaultValue={draft?.title ?? ""} required />
      </div>
      <div className="field">
        <label htmlFor="body">本文</label>
        <textarea id="body" name="body" defaultValue={draft?.body ?? ""} required />
      </div>
      <div className="field">
        <label htmlFor="short_body">短縮版</label>
        <textarea id="short_body" name="short_body" defaultValue={draft?.short_body ?? ""} />
      </div>
      <div className="grid cols-2">
        <div className="field">
          <label htmlFor="hashtags">ハッシュタグ</label>
          <textarea id="hashtags" name="hashtags" defaultValue={(draft?.hashtags ?? []).join("\n")} />
        </div>
        <div className="field">
          <label htmlFor="call_to_action">行動導線</label>
          <textarea id="call_to_action" name="call_to_action" defaultValue={draft?.call_to_action ?? ""} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="recommended_image_idea">おすすめ画像案</label>
        <textarea id="recommended_image_idea" name="recommended_image_idea" defaultValue={draft?.recommended_image_idea ?? ""} />
      </div>
      <div className="field">
        <label htmlFor="ai_reasoning">AI判断理由</label>
        <textarea id="ai_reasoning" name="ai_reasoning" defaultValue={draft?.ai_reasoning ?? ""} />
      </div>
      <button className="button" type="submit">保存</button>
    </form>
  );
}

export function MarketingDraftGenerateForm({
  action,
  defaultChannel = "instagram",
  isGoogleEnabled = true
}: {
  action: (formData: FormData) => void;
  defaultChannel?: string;
  isGoogleEnabled?: boolean;
}) {
  return (
    <form className="card form" action={action}>
      <div className="grid cols-2">
        <div className="field">
          <label htmlFor="generate_channel">投稿先</label>
          <select id="generate_channel" name="channel" defaultValue={defaultChannel}>
            <option value="instagram">Instagram</option>
            {isGoogleEnabled ? <option value="google_business_profile">Googleビジネスプロフィール</option> : null}
          </select>
        </div>
        <div className="field">
          <label htmlFor="post_type">投稿タイプ</label>
          <select id="post_type" name="post_type" defaultValue="latest_info">
            <option value="latest_info">最新情報</option>
            <option value="campaign">キャンペーン</option>
            <option value="service_intro">サービス紹介</option>
          </select>
        </div>
      </div>
      <button className="button" type="submit">AIで下書きを作成</button>
    </form>
  );
}

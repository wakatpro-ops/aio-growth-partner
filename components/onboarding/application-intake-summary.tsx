function listFromContent(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value.map(String).map((item) => item.trim()).filter(Boolean);
}

function recordFromContent(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function textValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function UrlList({ urls }: { urls: string[] }) {
  if (urls.length === 0) return <p className="muted">登録されたURLはまだありません。</p>;
  return (
    <ul className="compact-list">
      {urls.map((url) => (
        <li key={url}><a href={url} target="_blank">{url}</a></li>
      ))}
    </ul>
  );
}

export function ApplicationIntakeSummary({ content }: { content: Record<string, unknown> }) {
  const ai = recordFromContent(content.ai);
  const social = recordFromContent(content.social_urls);
  const urls = [
    textValue(content.website_url),
    textValue(content.google_maps_url),
    textValue(social.instagram),
    textValue(social.line),
    ...listFromContent(social.other),
    ...listFromContent(content.reference_urls)
  ].filter(Boolean);
  const currentTools = listFromContent(content.current_tools);
  const improvementGoals = listFromContent(content.improvement_goals);
  const opportunities = listFromContent(ai.growth_opportunities).length
    ? listFromContent(ai.growth_opportunities)
    : listFromContent(content.ai_growth_opportunities);
  const setupSteps = listFromContent(ai.recommended_setup_steps).length
    ? listFromContent(ai.recommended_setup_steps)
    : listFromContent(content.ai_recommended_setup_steps);
  const meetingPoints = listFromContent(ai.first_meeting_points).length
    ? listFromContent(ai.first_meeting_points)
    : listFromContent(content.ai_first_meeting_points);
  const businessSummary = textValue(ai.business_summary) || textValue(content.ai_business_summary);

  return (
    <section className="card">
      <h2>申込内容をもとにした初期設定下書き</h2>
      <p className="muted">導入相談時の内容から、店舗プロフィールと初期設定の候補を用意しています。内容を確認し、必要に応じて修正しながら進めてください。</p>

      <div className="grid cols-2">
        <article className="mini-card">
          <h3>お店のまとめ</h3>
          <p>{businessSummary || textValue(content.pain_points) || "店舗の特徴を確認しながら初期設定を進めます。"}</p>
        </article>
        <article className="mini-card">
          <h3>申込時の基本情報</h3>
          <table className="table compact">
            <tbody>
              <tr><th>業態</th><td>{textValue(content.industry_label) || "-"}</td></tr>
              <tr><th>担当者</th><td>{textValue(content.contact_name) || "-"}</td></tr>
              <tr><th>メール</th><td>{textValue(content.contact_email) || textValue(content.email) || "-"}</td></tr>
              <tr><th>電話</th><td>{textValue(content.contact_phone) || textValue(content.phone) || "-"}</td></tr>
              <tr><th>店舗数</th><td>{String(content.store_count ?? "-")}</td></tr>
            </tbody>
          </table>
        </article>
        <article className="mini-card">
          <h3>AIOで活かせそうなポイント</h3>
          {opportunities.length ? (
            <ul className="compact-list">
              {opportunities.map((item) => <li key={item}>{item}</li>)}
            </ul>
          ) : <p className="muted">初期設定を進めながら活用ポイントを整理します。</p>}
        </article>
        <article className="mini-card">
          <h3>最初に整える項目</h3>
          {setupSteps.length ? (
            <ul className="compact-list">
              {setupSteps.map((item) => <li key={item}>{item}</li>)}
            </ul>
          ) : <p className="muted">店舗プロフィール、商品・サービス、顧客、請求書設定から整えます。</p>}
        </article>
        <article className="mini-card">
          <h3>初回確認ポイント</h3>
          {meetingPoints.length ? (
            <ul className="compact-list">
              {meetingPoints.map((item) => <li key={item}>{item}</li>)}
            </ul>
          ) : <p className="muted">集客、請求、売上分析、顧客フォローの優先度を確認します。</p>}
        </article>
        <article className="mini-card">
          <h3>URL・SNS</h3>
          <UrlList urls={urls} />
        </article>
        <article className="mini-card">
          <h3>利用中ツール</h3>
          {currentTools.length ? <p>{currentTools.join("、")}</p> : <p className="muted">利用中ツールは初回設定で確認します。</p>}
        </article>
        <article className="mini-card">
          <h3>改善したいこと</h3>
          {improvementGoals.length ? <p>{improvementGoals.join("、")}</p> : <p className="muted">改善テーマは初回設定で確認します。</p>}
        </article>
      </div>
    </section>
  );
}

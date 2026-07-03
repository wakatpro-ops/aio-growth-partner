import Link from "next/link";

export default function HomePage() {
  return (
    <>
      <section className="hero">
        <div>
          <div className="eyebrow">GitHub + Vercel + Supabase + OpenAI API</div>
          <h1>AIO Growth Partner</h1>
          <p>
            飲食店、美容室、自動車修理、クリニック、整体院、不動産まで、1つの共通基盤で業態別の機能、文言、AIプロンプト、ダッシュボードを切り替える店舗業務効率化SaaSです。
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link className="button" href="/apply">
              申し込みへ
            </Link>
            <Link className="button secondary" href="/dashboard">
              デモを見る
            </Link>
          </div>
        </div>
      </section>
      <section className="main">
        <div className="grid cols-3">
          <div className="card">
            <h3>業態切替</h3>
            <p>industry_type により、汎用店舗と自動車修理で項目や文言を切り替えます。</p>
          </div>
          <div className="card">
            <h3>機能フラグ</h3>
            <p>不要な機能は削除せず、feature_flags で非表示・無効化します。</p>
          </div>
          <div className="card">
            <h3>AIログ</h3>
            <p>AI生成結果、トークン、ステータス、エラーをサーバー側で保存します。</p>
          </div>
        </div>
      </section>
    </>
  );
}

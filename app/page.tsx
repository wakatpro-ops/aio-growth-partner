import Link from "next/link";

export default function HomePage() {
  return (
    <>
      <section className="hero">
        <div>
          <div className="eyebrow">店舗業務管理とAI集客支援</div>
          <h1>AIO boost</h1>
          <p>
            飲食店、美容室、自動車修理、クリニック、整体院、不動産まで、店舗ごとの業務に合わせて、顧客管理、見積・請求、売上分析、AI集客支援をまとめて使えるサービスです。
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link className="button" href="/apply">
              申し込みへ
            </Link>
            <Link className="button secondary" href="/pricing">
              料金を見る
            </Link>
            <Link className="button secondary" href="/dashboard">
              機能を見る
            </Link>
          </div>
        </div>
      </section>
      <section className="main">
        <div className="grid cols-3">
          <div className="card">
            <h3>業態に合わせた管理</h3>
            <p>汎用店舗や自動車修理など、業態に合わせて項目や文言を切り替えられます。</p>
          </div>
          <div className="card">
            <h3>必要な機能だけ使える</h3>
            <p>店舗に必要な機能を選び、日常業務で迷わない画面に整えられます。</p>
          </div>
          <div className="card">
            <h3>AI集客支援</h3>
            <p>投稿文、口コミ返信案、月次改善提案などを、店舗情報や売上データをもとに作成できます。</p>
          </div>
        </div>
        <section className="home-pricing-banner" aria-labelledby="home-pricing-title">
          <div>
            <p className="eyebrow">料金は1プランだけ</p>
            <h2 id="home-pricing-title">月額20万円（税別）で、店舗数・利用者数・通常業務でのAI利用が上限なし。</h2>
            <p>2年以上のご契約で、初期設定費30万円（税別）が無料になります。</p>
          </div>
          <Link className="button" href="/pricing">料金と全機能を見る</Link>
        </section>
        <section className="card" aria-labelledby="public-information-title" style={{ marginTop: 24 }}>
          <h2 id="public-information-title">運営・サポート</h2>
          <p>
            AIO boostは株式会社 Navi Lifeが運営しています。サービスの利用条件、個人情報とGoogleユーザーデータの取り扱い、Google連携の解除方法を公開しています。
          </p>
          <div className="button-row">
            <Link className="button secondary" href="/privacy">
              プライバシーポリシー
            </Link>
            <Link className="button secondary" href="/terms">
              利用規約
            </Link>
            <Link className="button secondary" href="/legal">
              事業者情報・法的情報
            </Link>
          </div>
          <p className="muted" style={{ marginTop: 16 }}>
            お問い合わせ: <a href="mailto:info@aioboost.jp">info@aioboost.jp</a>
          </p>
        </section>
      </section>
    </>
  );
}

import Link from "next/link";
import { ApplyForm } from "./apply-form";

export default function ApplyPage() {
  return (
    <main className="main" style={{ maxWidth: 920, margin: "0 auto" }}>
      <div className="stack">
        <div>
          <div className="eyebrow">Apply</div>
          <h1>お店のURLだけで、AIO改善を始められます</h1>
          <p>AIがお店の公開ページを整理し、まず無料の簡易診断を表示します。詳細診断は、メール確認と正式申込を株式会社 Navi Lifeが確認した後にご案内します。</p>
          <div className="button-row" style={{ marginTop: 16 }}>
            <Link className="button secondary" href="/pricing">料金と含まれる機能を見る</Link>
          </div>
        </div>
        <section className="grid cols-3">
          <article className="card">
            <p className="muted">1</p>
            <h2>URLを1件入力</h2>
            <p>公式サイトがなくても、予約サイトや店舗ポータルのURLで始められます。</p>
          </article>
          <article className="card">
            <p className="muted">2</p>
            <h2>無料の簡易診断</h2>
            <p>AIおすすめ準備度と、最初に改善すると良いことを先に表示します。</p>
          </article>
          <article className="card">
            <p className="muted">3</p>
            <h2>確認後に詳細を案内</h2>
            <p>メール確認と正式申込後、運営会社の承認を経て詳細診断をご案内します。</p>
          </article>
        </section>
        <ApplyForm />
        <section className="apply-pricing-summary" aria-labelledby="apply-pricing-title">
          <div>
            <p className="eyebrow">AIO boost オールインワンプラン</p>
            <h2 id="apply-pricing-title">月額200,000円（税別）／1法人</h2>
            <p>店舗数・利用ユーザー数・通常業務でのAI利用は上限なし。2年以上のご契約で初期設定費300,000円（税別）が無料です。</p>
          </div>
          <Link className="button secondary" href="/pricing">料金の詳細を確認</Link>
        </section>
        <section className="card">
          <h2>ご利用開始までの流れ</h2>
          <ol className="compact-list">
            <li>URLだけで無料の簡易診断を確認します。</li>
            <li>メールアドレスを確認し、店舗との関係を含む正式申込を送信します。</li>
            <li>株式会社 Navi Lifeが申込内容を確認し、承認後に詳細診断をご案内します。</li>
            <li>電子契約・入金確認後、診断結果を引き継いだ管理画面を発行します。</li>
          </ol>
          <p className="notice">このフォームは導入相談・利用申し込みの受付です。送信後、担当者より確認のうえご案内します。</p>
        </section>
      </div>
    </main>
  );
}

import Link from "next/link";
import { ApplyForm } from "./apply-form";

export default function ApplyPage() {
  return (
    <main className="main" style={{ maxWidth: 920, margin: "0 auto" }}>
      <div className="stack">
        <div>
          <div className="eyebrow">Apply</div>
          <h1>お店のURLだけで、AIO改善を始められます</h1>
          <p>AIがお店の公開ページから業態、地域、メニュー、特徴を整理し、「どんな質問でおすすめされる準備をすべきか」を先にお見せします。</p>
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
            <h2>AIが事前診断</h2>
            <p>想定質問、AIおすすめ準備度、最初に改善すると良いことを表示します。</p>
          </article>
          <article className="card">
            <p className="muted">3</p>
            <h2>不足だけを確認</h2>
            <p>読み取れなかった重要項目だけ答えると、管理画面の初期設定下書きが整います。</p>
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
            <li>URLから無料の事前診断を確認します。</li>
            <li>診断結果を確認し、連絡先と不足している情報だけを送信します。</li>
            <li>ご契約内容を確認後、初期設定とアカウント発行を進めます。</li>
            <li>ログイン後、初回導入ガイドに沿って店舗設定を進めます。</li>
          </ol>
          <p className="notice">このフォームは導入相談・利用申し込みの受付です。送信後、担当者より確認のうえご案内します。</p>
        </section>
      </div>
    </main>
  );
}

import { ApplyForm } from "./apply-form";

export default function ApplyPage() {
  return (
    <main className="main" style={{ maxWidth: 920, margin: "0 auto" }}>
      <div className="stack">
        <div>
          <div className="eyebrow">Apply</div>
          <h1>導入相談・利用申し込み</h1>
          <p>店舗業務の整理、請求・入金管理、売上分析、AI集客支援の導入についてご相談いただけます。入力内容をもとに、AIOが導入前の初期整理を行います。</p>
        </div>
        <section className="grid cols-3">
          <article className="card">
            <p className="muted">1</p>
            <h2>お店の情報を入力</h2>
            <p>業態、URL、使っているツール、改善したいことを分かる範囲で入力します。</p>
          </article>
          <article className="card">
            <p className="muted">2</p>
            <h2>AIが初期整理</h2>
            <p>お店の概要、活かせそうなポイント、最初に整える項目をまとめます。</p>
          </article>
          <article className="card">
            <p className="muted">3</p>
            <h2>担当者がご案内</h2>
            <p>入力内容をもとに、より具体的な導入イメージをご案内します。</p>
          </article>
        </section>
        <section className="card">
          <h2>ご利用開始までの流れ</h2>
          <ol className="compact-list">
            <li>このフォームから導入希望内容を送信します。</li>
            <li>担当者より、導入内容とご利用開始までの流れをご案内します。</li>
            <li>ご契約内容を確認後、初期設定とアカウント発行を進めます。</li>
            <li>ログイン後、初回導入ガイドに沿って店舗設定を進めます。</li>
          </ol>
          <p className="notice">このフォームは導入相談・利用申し込みの受付です。送信後、担当者より確認のうえご案内します。</p>
        </section>
        <ApplyForm />
      </div>
    </main>
  );
}

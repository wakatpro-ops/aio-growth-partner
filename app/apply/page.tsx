import { ApplyForm } from "./apply-form";

export default function ApplyPage() {
  return (
    <main className="main" style={{ maxWidth: 920, margin: "0 auto" }}>
      <div className="stack">
        <div>
          <div className="eyebrow">Apply</div>
          <h1>導入相談・利用申し込み</h1>
          <p>店舗業務の整理、請求・入金管理、売上分析、AI集客支援の導入についてご相談いただけます。内容を確認後、担当者よりご連絡します。</p>
        </div>
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

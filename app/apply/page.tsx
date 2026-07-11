import { ApplyForm } from "./apply-form";

export default function ApplyPage() {
  return (
    <main className="main" style={{ maxWidth: 920, margin: "0 auto" }}>
      <div className="stack">
        <div>
          <div className="eyebrow">Public Form</div>
          <h1>公開申し込みフォーム</h1>
          <p>導入希望の店舗から問い合わせを受け付けます。送信後、AIO運営側がオンライン説明、請求書発行、入金確認、承認を行ったうえで利用開始をご案内します。</p>
        </div>
        <section className="card">
          <h2>利用開始までの流れ</h2>
          <ol className="compact-list">
            <li>このフォームから導入希望内容を送信します。</li>
            <li>AIO運営側がオンライン説明・営業を行います。</li>
            <li>契約意思確認後、AIO運営側が請求書を発行します。</li>
            <li>入金確認後、管理者が承認し、ログイン案内または招待リンクを発行します。</li>
            <li>ログイン後、初回オンボーディングから店舗設定を進めます。</li>
          </ol>
          <p className="notice">申し込みだけで自動的に利用開始にはなりません。MVP期間中のAIO利用料は請求書ベースで運用します。</p>
        </section>
        <ApplyForm />
      </div>
    </main>
  );
}

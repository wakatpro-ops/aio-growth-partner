import { ApplyForm } from "./apply-form";

export default function ApplyPage() {
  return (
    <main className="main" style={{ maxWidth: 920, margin: "0 auto" }}>
      <div className="stack">
        <div>
          <div className="eyebrow">Public Form</div>
          <h1>公開申し込みフォーム</h1>
          <p>未ログインの店舗から申し込みを受け付けます。Supabase接続時は applications に保存します。</p>
        </div>
        <ApplyForm />
      </div>
    </main>
  );
}

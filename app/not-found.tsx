import Link from "next/link";

export default function NotFoundPage() {
  return (
    <main className="main" style={{ maxWidth: 760, margin: "0 auto" }}>
      <section className="card">
        <div className="eyebrow">404</div>
        <h1>ページが見つかりません</h1>
        <p>URLが変わったか、店舗・データへのアクセス権がない可能性があります。店舗一覧から開き直してください。</p>
        <div className="button-row">
          <Link className="button" href="/stores">店舗一覧へ</Link>
          <Link className="button secondary" href="/dashboard">ダッシュボードへ</Link>
        </div>
      </section>
    </main>
  );
}

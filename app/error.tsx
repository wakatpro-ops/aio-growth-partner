"use client";

import Link from "next/link";

export default function ErrorPage({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="main" style={{ maxWidth: 760, margin: "0 auto" }}>
      <section className="card">
        <div className="eyebrow">エラー</div>
        <h1>処理を完了できませんでした</h1>
        <p>保存、取得、外部連携のいずれかで問題が起きました。時間をおいて再度お試しください。続く場合は、発生した画面と操作内容を担当者へお知らせください。</p>
        {error.digest ? <p className="muted">管理者確認用 Digest: {error.digest}</p> : null}
        <div className="button-row">
          <button className="button" type="button" onClick={reset}>もう一度試す</button>
          <Link className="button secondary" href="/dashboard">ダッシュボードへ</Link>
        </div>
      </section>
    </main>
  );
}

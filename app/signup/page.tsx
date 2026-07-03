import Link from "next/link";

export default function SignupPage() {
  return (
    <main className="main" style={{ maxWidth: 640, margin: "0 auto" }}>
      <div className="stack">
        <div>
          <div className="eyebrow">Phase 1</div>
          <h1>新規登録</h1>
          <p>本番では Supabase Auth のサインアップと organization 作成を接続します。Phase 1 の画面確認ではログインからデモに進めます。</p>
        </div>
        <form className="card form">
          <div className="field">
            <label htmlFor="name">お名前</label>
            <input id="name" name="name" />
          </div>
          <div className="field">
            <label htmlFor="email">メール</label>
            <input id="email" name="email" type="email" />
          </div>
          <div className="field">
            <label htmlFor="password">パスワード</label>
            <input id="password" name="password" type="password" />
          </div>
          <button className="button" type="button">登録</button>
        </form>
        <Link href="/login">ログインへ</Link>
      </div>
    </main>
  );
}

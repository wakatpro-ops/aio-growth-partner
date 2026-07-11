import Link from "next/link";

export default function SignupPage() {
  return (
    <main className="main" style={{ maxWidth: 640, margin: "0 auto" }}>
      <div className="stack">
        <div>
          <div className="eyebrow">Sign up</div>
          <h1>新規登録</h1>
          <p>利用開始には担当者からの案内が必要です。すでに案内を受けている場合は、ログイン画面からお進みください。</p>
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
          <button className="button" type="button">登録内容を確認</button>
        </form>
        <Link href="/login">ログインへ</Link>
      </div>
    </main>
  );
}

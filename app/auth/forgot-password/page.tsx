import Link from "next/link";
import { ForgotPasswordForm } from "./forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <main className="main" style={{ maxWidth: 560, margin: "0 auto" }}>
      <div className="stack">
        <div>
          <div className="eyebrow">AIO boost</div>
          <h1>パスワードを再設定</h1>
          <p>登録したメールアドレスへ、パスワード再設定用のリンクを送ります。</p>
        </div>
        <ForgotPasswordForm />
        <Link className="back-link" href="/login">← ログイン画面へ戻る</Link>
      </div>
    </main>
  );
}

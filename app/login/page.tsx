import Link from "next/link";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="main" style={{ maxWidth: 560, margin: "0 auto" }}>
      <div className="stack">
        <div>
          <div className="eyebrow">AIO boost</div>
          <h1>ログイン</h1>
          <p>登録済みのメールアドレスとパスワードでログインしてください。</p>
        </div>
        <LoginForm />
        <Link href="/signup">アカウント作成へ</Link>
      </div>
    </main>
  );
}

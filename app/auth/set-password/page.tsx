import { Suspense } from "react";
import { SetPasswordForm } from "./set-password-form";

export default function SetPasswordPage() {
  return (
    <main className="public-page">
      <section className="legal-shell">
        <p className="eyebrow">初回設定</p>
        <h1>ログイン用パスワードの設定</h1>
        <p>
          AIO Growth Partnerの利用を開始するため、今後ログインに使うパスワードを設定してください。
          設定後、初回導入画面へ進みます。
        </p>
        <Suspense fallback={<p className="notice">初回設定画面を準備しています。</p>}>
          <SetPasswordForm />
        </Suspense>
      </section>
    </main>
  );
}

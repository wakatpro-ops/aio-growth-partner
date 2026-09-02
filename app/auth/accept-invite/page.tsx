import { AcceptInviteForm } from "./accept-invite-form";

export default function AcceptInvitePage() {
  return (
    <main className="public-page">
      <section className="legal-shell">
        <p className="eyebrow">AIO boostへようこそ</p>
        <h1>招待内容を確認します</h1>
        <p>
          リンクを開いただけでは招待は使用されません。
          ご本人が下のボタンを押した時だけ、1回限りの招待を確認してパスワード設定へ進みます。
        </p>
        <AcceptInviteForm />
      </section>
    </main>
  );
}

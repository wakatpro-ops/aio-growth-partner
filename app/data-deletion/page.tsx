import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { CompanyInformationCard } from "@/components/legal/legal-blocks";
import { PageHeader } from "@/components/ui/page-header";

export const metadata = {
  title: "データ削除 | AIO boost",
  description: "AIO boostのMeta連携解除とデータ削除依頼の手順です。"
};

export default function DataDeletionPage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="Data deletion"
        title="Meta連携の解除・データ削除"
        description="Facebook・Instagramとの接続解除と、AIO boostに保存されたデータの削除依頼方法をご案内します。"
        action={<Link className="button secondary" href="/privacy">プライバシーポリシーへ</Link>}
      />

      <section className="card legal-card">
        <h2>1. AIO boostからMeta連携を解除する</h2>
        <ol className="compact-list">
          <li>AIO boostへログインし、対象店舗を開きます。</li>
          <li>「外部チャネル設定」を開きます。</li>
          <li>「Meta連携を解除」を押し、確認画面で解除します。</li>
        </ol>
        <p>解除すると、Meta側の権限取消を試みたうえで、AIO boostに保存されたMetaアクセストークンを削除します。</p>
      </section>

      <section className="card legal-card">
        <h2>2. Facebook側からアクセスを取り消す</h2>
        <ol className="compact-list">
          <li>Facebookの「設定とプライバシー」から「設定」を開きます。</li>
          <li>「アプリとウェブサイト」を開きます。</li>
          <li>AIO boostを選択し、削除またはアクセス権の取り消しを行います。</li>
        </ol>
      </section>

      <section className="card legal-card">
        <h2>3. 保存データの削除を依頼する</h2>
        <p>
          Meta連携により保存された情報、またはAIO boost内のアカウント情報の削除をご希望の場合は、
          対象アカウントのメールアドレスと店舗名を明記して
          <a href="mailto:info@aioboost.jp"> info@aioboost.jp </a>
          へご連絡ください。
        </p>
        <p>本人確認後、法令・契約・監査上保持が必要な情報を除き、合理的な期間内に削除し、完了をご連絡します。</p>
        <p className="muted">セキュリティ、不正利用防止、障害調査、法令対応に必要な操作履歴は、アクセストークンを含まない形で保持する場合があります。</p>
      </section>

      <CompanyInformationCard />
    </AppShell>
  );
}

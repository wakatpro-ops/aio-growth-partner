import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { CompanyPlaceholderCard, LegalSections } from "@/components/legal/legal-blocks";
import { PageHeader } from "@/components/ui/page-header";
import { privacySections } from "@/lib/legal/content";

export default function PrivacyPage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="Privacy"
        title="プライバシーポリシー"
        description="店舗情報、顧客情報、売上・請求・入金データ、外部連携情報、AI生成に必要な情報の取り扱いを整理しています。"
        action={<Link className="button secondary" href="/legal">文書一覧へ</Link>}
      />
      <p className="notice">このポリシーはMVP/β向けの初期文書です。正式公開前に運営者情報と問い合わせ先を入力してください。</p>
      <LegalSections sections={privacySections} />
      <CompanyPlaceholderCard />
    </AppShell>
  );
}

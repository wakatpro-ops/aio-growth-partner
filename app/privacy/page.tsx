import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { CompanyInformationCard, LegalSections } from "@/components/legal/legal-blocks";
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
      <p className="notice">Google連携の解除とデータ削除方法は、第7項に記載しています。</p>
      <LegalSections sections={privacySections} />
      <CompanyInformationCard />
    </AppShell>
  );
}

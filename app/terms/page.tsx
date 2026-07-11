import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { CompanyPlaceholderCard, LegalSections } from "@/components/legal/legal-blocks";
import { PageHeader } from "@/components/ui/page-header";
import { termsSections } from "@/lib/legal/content";

export default function TermsPage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="Terms"
        title="利用規約"
        description="AIO Growth Partnerの利用条件、AI機能、外部連携、注意事項について定める文書です。"
        action={<Link className="button secondary" href="/legal">文書一覧へ</Link>}
      />
      <p className="notice">請求書、会計、法務、補助金に関する判断は、必要に応じて専門家へ確認してください。</p>
      <LegalSections sections={termsSections} />
      <CompanyPlaceholderCard />
    </AppShell>
  );
}

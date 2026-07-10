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
        description="AIO Growth Partnerの利用条件、AI機能、外部連携、β版の制限について定める初期文書です。"
        action={<Link className="button secondary" href="/legal">文書一覧へ</Link>}
      />
      <p className="notice">この利用規約はMVP/β向けの初期文書です。正式な契約や公開前には、必要に応じて専門家へ確認してください。</p>
      <LegalSections sections={termsSections} />
      <CompanyPlaceholderCard />
    </AppShell>
  );
}

import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { CompanyPlaceholderCard, LegalNavCards } from "@/components/legal/legal-blocks";
import { PageHeader } from "@/components/ui/page-header";

export default function LegalPage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="Legal"
        title="規約・ポリシー"
        description="AIO Growth Partnerの利用条件、個人情報の取り扱い、利用時の注意事項をまとめています。"
        action={<Link className="button" href="/help">操作方法を見る</Link>}
      />
      <p className="notice">会社情報欄は、正式な運営者情報を入力してご利用ください。</p>
      <LegalNavCards />
      <CompanyPlaceholderCard />
    </AppShell>
  );
}

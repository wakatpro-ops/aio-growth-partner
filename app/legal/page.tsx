import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { CompanyInformationCard, LegalNavCards } from "@/components/legal/legal-blocks";
import { PageHeader } from "@/components/ui/page-header";

export default function LegalPage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="Legal"
        title="規約・ポリシー"
        description="AIO boostの利用条件、個人情報の取り扱い、利用時の注意事項をまとめています。"
        action={<Link className="button" href="/help">操作方法を見る</Link>}
      />
      <p className="notice">運営会社、利用条件、個人情報、Google・Meta連携の解除とデータ削除方法を公開しています。</p>
      <LegalNavCards />
      <CompanyInformationCard />
    </AppShell>
  );
}

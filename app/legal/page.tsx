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
        description="AIO Growth Partnerをβ版として利用する前に確認する文書をまとめています。"
        action={<Link className="button" href="/help">操作方法を見る</Link>}
      />
      <p className="notice">このページはMVP/β向けの初期文書です。会社情報は正式公開前に入力してください。</p>
      <LegalNavCards />
      <CompanyPlaceholderCard />
    </AppShell>
  );
}
